import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InMemoryStore } from "../store/in-memory.store";
import { SIGN_LANGUAGE_PACKS, SPOKEN_LANGUAGES, findSignLanguage, type SignLanguagePack } from "./language-packs";
import { Public } from "../auth/decorators";

@Public()
@Controller("languages")
export class LanguagesController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  /**
   * The static registry says what exists by default (nothing). Live facts are merged in:
   * a published trained model, and the number of VERIFIED human signing videos.
   */
  private live(pack: SignLanguagePack): SignLanguagePack {
    const model = this.store.signModels.find((m) => m.manifest.language === pack.id && m.status === "PUBLISHED");
    const verified = this.store.signVideos.filter((v) => v.signLanguageId === pack.id && v.verificationStatus === "VERIFIED");
    return {
      ...pack,
      recognitionModel: model
        ? { id: model.id, version: model.manifest.version, sha256: model.sha256, status: "PROTOTYPE" }
        : pack.recognitionModel,
      modelVersion: model ? model.manifest.version : pack.modelVersion,
      vocabulary: model ? { glossCount: model.manifest.labels.length, status: "PROTOTYPE" } : pack.vocabulary,
      evaluation: model
        ? {
            glossErrorRate: null,
            recognitionAccuracy: model.manifest.metrics.testAccuracy,
            signerIndependent: model.manifest.metrics.signerIndependent,
            status: "PROTOTYPE",
          }
        : pack.evaluation,
      videoLibrary: {
        verifiedClipCount: verified.length,
        sentenceLevelClipCount: verified.filter((v) => v.unit === "SENTENCE").length,
        status: verified.length ? "PROTOTYPE" : pack.videoLibrary.status,
      },
    };
  }

  /** All sign-language packs with their current capabilities. */
  @Get("sign")
  listSignLanguages() {
    return SIGN_LANGUAGE_PACKS.map((p) => this.live(p));
  }

  @Get("sign/:id")
  getSignLanguage(@Param("id") id: string) {
    const pack = findSignLanguage(id);
    if (!pack) throw new NotFoundException("SIGN_LANGUAGE_NOT_FOUND");
    return this.live(pack);
  }

  @Get("spoken")
  listSpokenLanguages() {
    return SPOKEN_LANGUAGES;
  }
}
