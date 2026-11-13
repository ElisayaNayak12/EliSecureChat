/**
 * Sign-language pack registry (SignConnect AI spec, section 2).
 *
 * This is METADATA ONLY. No recognition model, translation model or human
 * signing-video library exists yet for any language. Every AI-facing field
 * is explicitly null / zero / "NOT_IMPLEMENTED" so clients can never present
 * a pack as more capable than it is. Fields are filled in as phases 5-9 land.
 */

/** Spec section 13: the five allowed implementation states. */
export type ImplementationStatus =
  | "WORKING"
  | "PROTOTYPE"
  | "MOCK"
  | "RESEARCH"
  | "NOT_IMPLEMENTED";

export type PackLifecycle = "IN_DEVELOPMENT" | "PLANNED";

export type LicenseReviewStatus = "NOT_REVIEWED" | "APPROVED_COMMERCIAL" | "NON_COMMERCIAL_ONLY" | "REJECTED";

export type DatasetReference = {
  name: string;
  /** Licence has not been checked yet unless this says otherwise. */
  licenseReview: LicenseReviewStatus;
  notes: string;
};

export type ModelInfo = {
  id: string;
  version: string;
  sha256: string;
  status: ImplementationStatus;
};

export type SignLanguagePack = {
  id: string; // stable identifier, e.g. "isl"
  code: string; // display code, e.g. "ISL"
  name: string;
  region: string;
  /** Spoken/written languages this pack translates to and from. */
  pairedSpokenLanguages: string[];
  lifecycle: PackLifecycle;
  roadmapPhase: number;
  metadata: {
    description: string;
    writtenGlossConvention: string | null;
  };
  vocabulary: { glossCount: number; status: ImplementationStatus };
  grammarRules: { status: ImplementationStatus; notes: string };
  recognitionModel: ModelInfo | null;
  translationModel: ModelInfo | null;
  videoLibrary: { verifiedClipCount: number; sentenceLevelClipCount: number; status: ImplementationStatus };
  datasetReferences: DatasetReference[];
  modelVersion: string | null;
  evaluation: { glossErrorRate: number | null; recognitionAccuracy: number | null; signerIndependent: boolean; status: ImplementationStatus };
  license: { packLicense: string | null; provenance: string };
};

const NOT_BUILT = "NOT_IMPLEMENTED" as const;

function emptyAiFields() {
  return {
    vocabulary: { glossCount: 0, status: NOT_BUILT },
    grammarRules: { status: NOT_BUILT, notes: "Language-specific grammar rules have not been authored yet." },
    recognitionModel: null,
    translationModel: null,
    videoLibrary: { verifiedClipCount: 0, sentenceLevelClipCount: 0, status: NOT_BUILT },
    modelVersion: null,
    evaluation: { glossErrorRate: null, recognitionAccuracy: null, signerIndependent: false, status: NOT_BUILT },
    license: {
      packLicense: null,
      provenance: "No data, models or videos have been imported. Provenance will be recorded per asset when they are.",
    },
  };
}

export const SIGN_LANGUAGE_PACKS: readonly SignLanguagePack[] = [
  {
    id: "isl",
    code: "ISL",
    name: "Indian Sign Language",
    region: "India",
    pairedSpokenLanguages: ["en-IN", "hi-IN"],
    lifecycle: "IN_DEVELOPMENT",
    roadmapPhase: 5,
    metadata: {
      description: "Primary language for the first complete implementation (spec section 2).",
      writtenGlossConvention: null,
    },
    datasetReferences: [
      { name: "iSign", licenseReview: "NOT_REVIEWED", notes: "Candidate ISL benchmark. Licence, consent and commercial rights must be checked before use." },
      { name: "ISLTranslate", licenseReview: "NOT_REVIEWED", notes: "Candidate ISL-English translation corpus. Licence not yet checked." },
      { name: "CISLR", licenseReview: "NOT_REVIEWED", notes: "Candidate isolated-sign corpus. Licence not yet checked." },
    ],
    ...emptyAiFields(),
  },
  {
    id: "asl",
    code: "ASL",
    name: "American Sign Language",
    region: "United States, Canada",
    pairedSpokenLanguages: ["en-US"],
    lifecycle: "PLANNED",
    roadmapPhase: 9,
    metadata: { description: "Planned language pack (Phase 9).", writtenGlossConvention: null },
    datasetReferences: [
      { name: "WLASL", licenseReview: "NOT_REVIEWED", notes: "Candidate isolated-sign dataset. Licence not yet checked." },
      { name: "How2Sign", licenseReview: "NOT_REVIEWED", notes: "Candidate continuous-signing dataset. Licence not yet checked." },
    ],
    ...emptyAiFields(),
  },
  {
    id: "bsl",
    code: "BSL",
    name: "British Sign Language",
    region: "United Kingdom",
    pairedSpokenLanguages: ["en-GB"],
    lifecycle: "PLANNED",
    roadmapPhase: 9,
    metadata: { description: "Planned language pack (Phase 9).", writtenGlossConvention: null },
    datasetReferences: [],
    ...emptyAiFields(),
  },
  {
    id: "auslan",
    code: "Auslan",
    name: "Australian Sign Language",
    region: "Australia",
    pairedSpokenLanguages: ["en-AU"],
    lifecycle: "PLANNED",
    roadmapPhase: 9,
    metadata: { description: "Planned language pack (Phase 9).", writtenGlossConvention: null },
    datasetReferences: [],
    ...emptyAiFields(),
  },
];

export type SpokenLanguage = { id: string; name: string };

export const SPOKEN_LANGUAGES: readonly SpokenLanguage[] = [
  { id: "en-IN", name: "English (India)" },
  { id: "en-US", name: "English (United States)" },
  { id: "en-GB", name: "English (United Kingdom)" },
  { id: "en-AU", name: "English (Australia)" },
  { id: "hi-IN", name: "Hindi (India)" },
];

export function findSignLanguage(id: string) {
  return SIGN_LANGUAGE_PACKS.find((p) => p.id === id);
}

export function isSpokenLanguage(id: string) {
  return SPOKEN_LANGUAGES.some((l) => l.id === id);
}
