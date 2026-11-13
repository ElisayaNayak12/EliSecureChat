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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash, randomUUID } from "crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "fs";
import { memoryStorage } from "multer";
import { dirname, join } from "path";
import { InMemoryStore } from "../store/in-memory.store";
import { AuthService } from "../auth/auth.service";
import type { SignVideo } from "../store/models";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, lookupSignVideo, normalizePhrase, validateSignVideoFields } from "./sign-video-rules";
import { CurrentUser, Public, type AuthUser } from "../auth/decorators";

const EXT: Record<string, string> = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };

/** Public shape: never exposes the on-disk file name. */
function toPublic(v: SignVideo) {
  const { fileName: _fileName, ...rest } = v;
  return { ...rest, url: `/api/sign-videos/${v.id}/file` };
}

@Controller()
export class SignVideosController {
  constructor(
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private get dir() {
    const d = process.env.SIGN_VIDEO_DIR ?? join(dirname(this.store.storeFilePath), "sign-videos");
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    return d;
  }

  private isAdmin(token?: string) {
    return !!token && this.store.isValidAdminSession(token);
  }

  /** Contribute a human signing recording. It stays UNVERIFIED (never used for translation) until an admin verifies it. */
  @Post("sign-videos")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, unknown>, @CurrentUser() me: AuthUser) {
    // Multipart bodies are parsed after the global guards run, so ownership is checked here.
    if (body?.uploadedBy !== undefined && body.uploadedBy !== me.userId) throw new ForbiddenException("NOT_YOUR_ACCOUNT");
    const issues: string[] = [];
    if (!file) issues.push("file is required.");
    else if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(file.mimetype)) issues.push(`file type ${file.mimetype} is not allowed (mp4, webm, mov).`);
    const fields = validateSignVideoFields(body ?? {});
    issues.push(...fields.issues);
    if (fields.value && !this.store.users.some((u) => u.id === fields.value!.uploadedBy)) issues.push("uploadedBy is not a known user.");
    if (issues.length || !file || !fields.value) throw new BadRequestException({ error: "INVALID_SIGN_VIDEO", issues });

    const id = randomUUID();
    const fileName = `${id}${EXT[file.mimetype]}`;
    writeFileSync(join(this.dir, fileName), file.buffer);
    const video: SignVideo = {
      id,
      ...fields.value,
      normalizedPhrase: normalizePhrase(fields.value.phraseText),
      verificationStatus: "UNVERIFIED",
      fileName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      createdAt: new Date().toISOString(),
    };
    this.store.signVideos.push(video);
    this.store.persist();
    return toPublic(video);
  }

  /** Verified recordings for a language (what clients may play). */
  @Get("sign-videos")
  list(@Query("language") language?: string, @Query("uploadedBy") uploadedBy?: string) {
    if (uploadedBy) {
      // A contributor can see the review status of their own uploads.
      return this.store.signVideos.filter((v) => v.uploadedBy === uploadedBy).map(toPublic);
    }
    return this.store.signVideos
      .filter((v) => v.verificationStatus === "VERIFIED" && (!language || v.signLanguageId === language))
      .map(toPublic);
  }

  /** Exact whole-sentence lookup among VERIFIED recordings. Returns match:null with a reason otherwise. */
  @Get("sign-videos/lookup")
  lookup(@Query("language") language?: string, @Query("text") text?: string) {
    if (!language) throw new BadRequestException("language is required");
    const result = lookupSignVideo(this.store.signVideos, language, text ?? "");
    return { match: result.match ? toPublic(result.match) : null, reason: result.reason };
  }

  @Public()
  @Get("sign-videos/:id/file")
  file(@Param("id") id: string, @Query("adminToken") adminToken?: string, @Query("access_token") accessToken?: string) {
    const video = this.store.signVideos.find((v) => v.id === id);
    if (!video) throw new NotFoundException("SIGN_VIDEO_NOT_FOUND");
    // Admins preview with their admin token; users need a valid (short-lived) access token.
    const admin = this.isAdmin(adminToken);
    const me = admin ? null : accessToken ? this.auth.authenticate(accessToken) : null;
    if (!admin && !me) throw new UnauthorizedException("AUTH_REQUIRED");
    const allowed = admin || video.verificationStatus === "VERIFIED" || me?.userId === video.uploadedBy;
    if (!allowed) throw new ForbiddenException("SIGN_VIDEO_NOT_VERIFIED");
    const path = join(this.dir, video.fileName);
    if (!existsSync(path)) throw new NotFoundException("SIGN_VIDEO_FILE_MISSING");
    return new StreamableFile(createReadStream(path), { type: video.mimeType, length: statSync(path).size });
  }

  /* ---------------- admin review ---------------- */

  @Public()
  @Get("admin/sign-videos")
  adminList(@Headers("x-admin-token") token?: string) {
    if (!this.isAdmin(token)) throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
    return this.store.signVideos.map(toPublic);
  }

  @Public()
  @Patch("admin/sign-videos/:id")
  review(@Param("id") id: string, @Body() body: { status?: string; note?: string }, @Headers("x-admin-token") token?: string) {
    if (!this.isAdmin(token)) throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
    const video = this.store.signVideos.find((v) => v.id === id);
    if (!video) throw new NotFoundException("SIGN_VIDEO_NOT_FOUND");
    if (body?.status !== "VERIFIED" && body?.status !== "REJECTED" && body?.status !== "UNVERIFIED") {
      throw new BadRequestException({ error: "INVALID_STATUS", issues: ["status must be VERIFIED, REJECTED or UNVERIFIED."] });
    }
    video.verificationStatus = body.status;
    video.reviewNote = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
    video.verifiedAt = body.status === "VERIFIED" ? new Date().toISOString() : undefined;
    this.store.persist();
    return toPublic(video);
  }

  @Public()
  @Delete("admin/sign-videos/:id")
  remove(@Param("id") id: string, @Headers("x-admin-token") token?: string) {
    if (!this.isAdmin(token)) throw new UnauthorizedException("ADMIN_AUTH_REQUIRED");
    const idx = this.store.signVideos.findIndex((v) => v.id === id);
    if (idx < 0) throw new NotFoundException("SIGN_VIDEO_NOT_FOUND");
    const [video] = this.store.signVideos.splice(idx, 1);
    rmSync(join(this.dir, video.fileName), { force: true });
    this.store.persist();
    return { ok: true };
  }

  /* ---------------- call history ---------------- */

  @Get("calls")
  calls(@Query("userId") userId?: string) {
    if (!userId) throw new BadRequestException("userId is required");
    return this.store.calls
      .filter((c) => c.participantIds.includes(userId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 100);
  }
}
