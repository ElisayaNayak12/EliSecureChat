import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { createHash, randomBytes, randomUUID } from "crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { memoryStorage } from "multer";
import { dirname, join } from "path";
import { InMemoryStore } from "../store/in-memory.store";
import type { DatasetSample, SignModel } from "../store/models";
import {
  CONSENT_VERSION,
  FEATURE_DIM,
  FEATURE_VERSION,
  GLOSS_PATTERN,
  STARTER_VOCABULARY,
  normalizeGloss,
  validateConsent,
  validateManifest,
  validateSample,
  type RawFrame,
} from "./dataset-rules";
import { Public } from "../auth/decorators";

const MAX_MODEL_BYTES = 30 * 1024 * 1024;

@Controller()
export class DatasetController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  private dir(sub: string) {
    const d = join(process.env.DATASET_DIR ?? join(dirname(this.store.storeFilePath), "dataset"), sub);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    return d;
  }

  private requireAdmin(token?: string) {
    if (!token || !this.store.isValidAdminSession(token)) throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
  }

  private vocabularyFor(language: string) {
    if (!this.store.vocabulary.some((v) => v.language === language) && language === "isl") {
      // First use: seed a starter list of everyday words (labels only).
      const now = new Date().toISOString();
      for (const v of STARTER_VOCABULARY) this.store.vocabulary.push({ id: randomUUID(), language, gloss: v.gloss, meaning: v.meaning, createdAt: now });
      this.store.persist();
    }
    return this.store.vocabulary.filter((v) => v.language === language).sort((a, b) => a.gloss.localeCompare(b.gloss));
  }

  private framesPath(id: string) {
    return join(this.dir("samples"), `${id}.json`);
  }

  private deleteSampleFiles(samples: DatasetSample[]) {
    for (const s of samples) rmSync(this.framesPath(s.id), { force: true });
  }

  /* ---------------- vocabulary ---------------- */

  @Get("dataset/vocabulary")
  vocabulary(@Query("language") language = "isl") {
    return this.vocabularyFor(language);
  }

  @Public()
  @Post("admin/dataset/vocabulary")
  addVocabulary(@Body() body: { language?: string; gloss?: string; meaning?: string }, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const language = body?.language ?? "isl";
    const gloss = normalizeGloss(body?.gloss ?? "");
    const meaning = (body?.meaning ?? "").trim();
    const issues: string[] = [];
    if (!GLOSS_PATTERN.test(gloss)) issues.push("gloss must be 1-40 characters: letters, digits and hyphens.");
    if (!meaning || meaning.length > 120) issues.push("meaning must be 1-120 characters.");
    if (this.vocabularyFor(language).some((v) => v.gloss === gloss)) issues.push(`${gloss} already exists.`);
    if (issues.length) throw new BadRequestException({ error: "INVALID_VOCABULARY", issues });
    const entry = { id: randomUUID(), language, gloss, meaning, createdAt: new Date().toISOString() };
    this.store.vocabulary.push(entry);
    this.store.persist();
    return entry;
  }

  @Public()
  @Delete("admin/dataset/vocabulary/:id")
  removeVocabulary(@Param("id") id: string, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const entry = this.store.vocabulary.find((v) => v.id === id);
    if (!entry) throw new NotFoundException("VOCABULARY_NOT_FOUND");
    if (this.store.datasetSamples.some((s) => s.language === entry.language && s.gloss === entry.gloss)) {
      throw new BadRequestException({ error: "VOCABULARY_IN_USE", issues: [`${entry.gloss} already has recorded samples; delete them first.`] });
    }
    this.store.vocabulary = this.store.vocabulary.filter((v) => v.id !== id);
    this.store.persist();
    return { ok: true };
  }

  /* ---------------- consent ---------------- */

  @Post("dataset/consents")
  createConsent(@Body() body: unknown) {
    const { value, issues } = validateConsent(body);
    if (!value) throw new BadRequestException({ error: "INVALID_CONSENT", issues });
    if (!this.store.users.some((u) => u.id === value.userId)) throw new BadRequestException({ error: "INVALID_CONSENT", issues: ["userId is not a known user."] });
    const consent = {
      id: randomUUID(),
      ...value,
      signerId: `signer-${randomBytes(4).toString("hex")}`,
      consentVersion: CONSENT_VERSION,
      createdAt: new Date().toISOString(),
    };
    this.store.datasetConsents.push(consent);
    this.store.persist();
    return consent;
  }

  @Get("dataset/consents")
  listConsents(@Query("userId") userId?: string) {
    if (!userId) throw new BadRequestException("userId is required");
    return this.store.datasetConsents.filter((c) => c.userId === userId);
  }

  /** Revoking consent deletes every sample recorded under it (spec: data deletion). */
  @Post("dataset/consents/:id/revoke")
  revokeConsent(@Param("id") id: string, @Body() body: { userId?: string }) {
    const consent = this.store.datasetConsents.find((c) => c.id === id);
    if (!consent) throw new NotFoundException("CONSENT_NOT_FOUND");
    if (consent.userId !== body?.userId) throw new ForbiddenException("NOT_YOUR_CONSENT");
    const doomed = this.store.datasetSamples.filter((s) => s.consentId === id);
    this.deleteSampleFiles(doomed);
    this.store.datasetSamples = this.store.datasetSamples.filter((s) => s.consentId !== id);
    consent.revokedAt = new Date().toISOString();
    this.store.persist();
    return { ok: true, deletedSamples: doomed.length };
  }

  /* ---------------- samples ---------------- */

  @Post("dataset/samples")
  addSample(@Body() body: { userId?: string } & Record<string, unknown>) {
    const { value, issues } = validateSample(body);
    if (!value) throw new BadRequestException({ error: "INVALID_SAMPLE", issues });
    const consent = this.store.datasetConsents.find((c) => c.id === value.consentId);
    if (!consent || consent.revokedAt) throw new BadRequestException({ error: "INVALID_SAMPLE", issues: ["The consent record does not exist or was revoked."] });
    if (consent.userId !== body.userId) throw new ForbiddenException("NOT_YOUR_CONSENT");
    if (consent.language !== value.language) throw new BadRequestException({ error: "INVALID_SAMPLE", issues: ["The sample language differs from the consent language."] });
    if (!this.vocabularyFor(value.language).some((v) => v.gloss === value.gloss)) {
      throw new BadRequestException({ error: "INVALID_SAMPLE", issues: [`${value.gloss} is not in the ${value.language.toUpperCase()} vocabulary.`] });
    }
    const sample: DatasetSample = {
      id: randomUUID(),
      consentId: consent.id,
      signerId: consent.signerId,
      userId: consent.userId,
      language: value.language,
      gloss: value.gloss,
      frameCount: value.frames.length,
      durationMs: value.durationMs,
      handFrameRatio: value.handFrameRatio,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    writeFileSync(this.framesPath(sample.id), JSON.stringify(value.frames));
    this.store.datasetSamples.push(sample);
    this.store.persist();
    return sample;
  }

  @Get("dataset/samples")
  mySamples(@Query("userId") userId?: string) {
    if (!userId) throw new BadRequestException("userId is required");
    return this.store.datasetSamples.filter((s) => s.userId === userId);
  }

  @Delete("dataset/samples/:id")
  deleteMySample(@Param("id") id: string, @Query("userId") userId?: string) {
    const sample = this.store.datasetSamples.find((s) => s.id === id);
    if (!sample) throw new NotFoundException("SAMPLE_NOT_FOUND");
    if (sample.userId !== userId) throw new ForbiddenException("NOT_YOUR_SAMPLE");
    this.deleteSampleFiles([sample]);
    this.store.datasetSamples = this.store.datasetSamples.filter((s) => s.id !== id);
    this.store.persist();
    return { ok: true };
  }

  @Get("dataset/stats")
  stats(@Query("language") language = "isl") {
    const vocab = this.vocabularyFor(language);
    const samples = this.store.datasetSamples.filter((s) => s.language === language);
    const glosses = vocab.map((v) => {
      const mine = samples.filter((s) => s.gloss === v.gloss);
      return {
        gloss: v.gloss,
        meaning: v.meaning,
        approved: mine.filter((s) => s.status === "APPROVED").length,
        pending: mine.filter((s) => s.status === "PENDING").length,
        signers: new Set(mine.filter((s) => s.status !== "REJECTED").map((s) => s.signerId)).size,
      };
    });
    return {
      language,
      totals: {
        samples: samples.length,
        approved: samples.filter((s) => s.status === "APPROVED").length,
        pending: samples.filter((s) => s.status === "PENDING").length,
        signers: new Set(samples.map((s) => s.signerId)).size,
        consents: this.store.datasetConsents.filter((c) => c.language === language && !c.revokedAt).length,
      },
      glosses,
    };
  }

  /* ---------------- admin review & export ---------------- */

  @Public()
  @Get("admin/dataset/samples")
  adminSamples(@Headers("x-admin-token") token?: string, @Query("status") status?: string) {
    this.requireAdmin(token);
    return this.store.datasetSamples
      .filter((s) => !status || s.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  @Public()
  @Get("admin/dataset/samples/:id/frames")
  adminFrames(@Param("id") id: string, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const sample = this.store.datasetSamples.find((s) => s.id === id);
    if (!sample || !existsSync(this.framesPath(id))) throw new NotFoundException("SAMPLE_NOT_FOUND");
    return JSON.parse(readFileSync(this.framesPath(id), "utf8")) as RawFrame[];
  }

  @Public()
  @Patch("admin/dataset/samples/:id")
  review(@Param("id") id: string, @Body() body: { status?: string; note?: string }, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const sample = this.store.datasetSamples.find((s) => s.id === id);
    if (!sample) throw new NotFoundException("SAMPLE_NOT_FOUND");
    if (body?.status !== "APPROVED" && body?.status !== "REJECTED" && body?.status !== "PENDING") {
      throw new BadRequestException({ error: "INVALID_STATUS", issues: ["status must be APPROVED, REJECTED or PENDING."] });
    }
    sample.status = body.status;
    sample.reviewNote = typeof body.note === "string" ? body.note.slice(0, 300) : undefined;
    this.store.persist();
    return sample;
  }

  @Public()
  @Delete("admin/dataset/samples/:id")
  adminDelete(@Param("id") id: string, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const sample = this.store.datasetSamples.find((s) => s.id === id);
    if (!sample) throw new NotFoundException("SAMPLE_NOT_FOUND");
    this.deleteSampleFiles([sample]);
    this.store.datasetSamples = this.store.datasetSamples.filter((s) => s.id !== id);
    this.store.persist();
    return { ok: true };
  }

  /**
   * Training export: APPROVED samples whose consent is still active. Signers appear only by pseudonymous id.
   * This is the input to ai/train.py.
   */
  @Public()
  @Get("admin/dataset/export")
  export(@Headers("x-admin-token") token?: string, @Query("language") language = "isl") {
    this.requireAdmin(token);
    const active = new Map(this.store.datasetConsents.filter((c) => c.language === language && !c.revokedAt && c.agreeTraining).map((c) => [c.id, c]));
    const samples = this.store.datasetSamples
      .filter((s) => s.language === language && s.status === "APPROVED" && active.has(s.consentId) && existsSync(this.framesPath(s.id)))
      .map((s) => ({ id: s.id, signerId: s.signerId, gloss: s.gloss, frames: JSON.parse(readFileSync(this.framesPath(s.id), "utf8")) as RawFrame[] }));
    const used = new Set(samples.map((s) => s.gloss));
    return {
      formatVersion: 1,
      featureVersion: FEATURE_VERSION,
      featureDim: FEATURE_DIM,
      language,
      exportedAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
      vocabulary: this.vocabularyFor(language).filter((v) => used.has(v.gloss)).map((v) => ({ gloss: v.gloss, meaning: v.meaning })),
      signers: [...new Set(samples.map((s) => s.signerId))].map((signerId) => {
        const c = [...active.values()].find((x) => x.signerId === signerId)!;
        return { signerId, isDeafOrNativeSigner: c.isDeafOrNativeSigner, region: c.region ?? null };
      }),
      samples,
    };
  }

  /* ---------------- trained model registry ---------------- */

  @Public()
  @Post("admin/models")
  @UseInterceptors(FileFieldsInterceptor([{ name: "model", maxCount: 1 }, { name: "manifest", maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: MAX_MODEL_BYTES } }))
  uploadModel(
    @UploadedFiles() files: { model?: Express.Multer.File[]; manifest?: Express.Multer.File[] },
    @Headers("x-admin-token") token?: string,
    @Body() body?: { note?: string },
  ) {
    this.requireAdmin(token);
    const model = files?.model?.[0];
    const manifestFile = files?.manifest?.[0];
    const issues: string[] = [];
    if (!model || model.size < 100) issues.push("model (.onnx file) is required.");
    if (!manifestFile) issues.push("manifest (manifest.json) is required.");
    let manifestRaw: unknown = null;
    if (manifestFile) {
      try {
        manifestRaw = JSON.parse(manifestFile.buffer.toString("utf8"));
      } catch {
        issues.push("manifest is not valid JSON.");
      }
    }
    const { value: manifest, issues: mIssues } = validateManifest(manifestRaw);
    if (manifestRaw !== null) issues.push(...mIssues);
    if (issues.length || !model || !manifest) throw new BadRequestException({ error: "INVALID_MODEL", issues });
    const id = randomUUID();
    const fileName = `${id}.onnx`;
    writeFileSync(join(this.dir("models"), fileName), model.buffer);
    const entry: SignModel = {
      id,
      manifest,
      fileName,
      sizeBytes: model.size,
      sha256: createHash("sha256").update(model.buffer).digest("hex"),
      status: "PUBLISHED",
      uploadedAt: new Date().toISOString(),
      note: typeof body?.note === "string" ? body.note.slice(0, 300) : undefined,
    };
    // Only one published model per language at a time; older ones are withdrawn (kept for rollback).
    for (const m of this.store.signModels) if (m.manifest.language === manifest.language && m.status === "PUBLISHED") m.status = "WITHDRAWN";
    this.store.signModels.push(entry);
    this.store.persist();
    return entry;
  }

  @Public()
  @Get("admin/models")
  adminModels(@Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    return [...this.store.signModels].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  /** Publish (also used for rollback to an older version) or withdraw. */
  @Public()
  @Patch("admin/models/:id")
  setModelStatus(@Param("id") id: string, @Body() body: { status?: string }, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const model = this.store.signModels.find((m) => m.id === id);
    if (!model) throw new NotFoundException("MODEL_NOT_FOUND");
    if (body?.status !== "PUBLISHED" && body?.status !== "WITHDRAWN") throw new BadRequestException({ error: "INVALID_STATUS", issues: ["status must be PUBLISHED or WITHDRAWN."] });
    if (body.status === "PUBLISHED") {
      for (const m of this.store.signModels) if (m.manifest.language === model.manifest.language && m.status === "PUBLISHED") m.status = "WITHDRAWN";
    }
    model.status = body.status;
    this.store.persist();
    return model;
  }

  @Public()
  @Delete("admin/models/:id")
  deleteModel(@Param("id") id: string, @Headers("x-admin-token") token?: string) {
    this.requireAdmin(token);
    const model = this.store.signModels.find((m) => m.id === id);
    if (!model) throw new NotFoundException("MODEL_NOT_FOUND");
    rmSync(join(this.dir("models"), model.fileName), { force: true });
    this.store.signModels = this.store.signModels.filter((m) => m.id !== id);
    this.store.persist();
    return { ok: true };
  }

  /** What clients download: the currently published model for a language, or null. */
  @Public()
  @Get("models/sign-recognition")
  currentModel(@Query("language") language = "isl") {
    const m = this.store.signModels.find((x) => x.manifest.language === language && x.status === "PUBLISHED");
    if (!m) return { model: null };
    return { model: { id: m.id, manifest: m.manifest, sha256: m.sha256, sizeBytes: m.sizeBytes, url: `/api/models/${m.id}/file` } };
  }

  @Public()
  @Get("models/:id/file")
  modelFile(@Param("id") id: string) {
    const m = this.store.signModels.find((x) => x.id === id);
    if (!m || m.status !== "PUBLISHED") throw new NotFoundException("MODEL_NOT_FOUND");
    const path = join(this.dir("models"), m.fileName);
    if (!existsSync(path)) throw new NotFoundException("MODEL_FILE_MISSING");
    return new StreamableFile(createReadStream(path), { type: "application/octet-stream", length: statSync(path).size });
  }
}
