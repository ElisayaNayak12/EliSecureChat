# SignConnect AI — Dataset Licences

**No dataset has been downloaded, imported or used.** Every entry below is a candidate named in the spec (section 6).
Its licence has **not been reviewed**. Nothing here is a statement of what those licences allow.

| Dataset | Language | Intended use | Licence review | Commercial use | Consent / redistribution checked |
|---|---|---|---|---|---|
| iSign | ISL | benchmark / research | NOT_REVIEWED | unknown | no |
| ISLTranslate | ISL ↔ English | translation research | NOT_REVIEWED | unknown | no |
| CISLR | ISL | isolated-sign research | NOT_REVIEWED | unknown | no |
| WLASL | ASL | isolated-sign research | NOT_REVIEWED | unknown | no |
| How2Sign | ASL | continuous-signing research | NOT_REVIEWED | unknown | no |

## Fingerspelling photos in the app (`apps/web/public/signs/`)

| Set | Content | Source | Licence review |
|---|---|---|---|
| `isl/` | ISL two-handed alphabet A–Z and numbers 1–9 (35 photos) | Chart image supplied by the project owner on 2026-11-13, cut into one photo per sign | **NOT_REVIEWED.** Owner to confirm usage rights before public release |
| `asl/` | ASL one-handed alphabet A–Z (26 photos) | Chart image supplied by the project owner on 2026-11-13, cut and cleaned to the hand only | **NOT_REVIEWED.** Owner to confirm usage rights before public release |

These photos are used only to display fingerspelling in calls. They are not used for training. To replace them,
put your own photos or recordings at the same file names (`A.jpg` … `Z.jpg`, `1.jpg` … `9.jpg`); no code change is
needed. ISL has no photo for 0; numbers containing 0 are shown as text.

## Review checklist (complete before any import)

1. Licence text located and archived with the review date.
2. Commercial-use rights. Non-commercial data must not become the production foundation (spec §6).
3. Attribution requirements.
4. Signer consent: does it cover ML training and the intended distribution?
5. Redistribution restrictions, including for derived landmarks and trained weights.
6. Quality: resolution, signer diversity, regional variation, annotation method.
7. Record the outcome in `apps/backend/src/languages/language-packs.ts` (`licenseReview`) and in `model_versions.license` / `provenance` for any model trained on it.

## Proprietary dataset (collection tooling built 2026-11-10)

The app now collects this dataset (Translator → Contribute; Admin → Sign dataset). Each record stores:
- **Consent:** version `signconnect-dataset-consent-v1`, covering recording and training, plus a Deaf/native-signer flag and region.
- **The recording itself:** hand landmarks only.
- **Review status.**

Exports include only approved samples with active consent, identified by pseudonymous signer id. **No real recordings exist yet.**

### Original plan

The spec's production path: record consenting signers (with a `user_consents` record of type
`DATASET_CONTRIBUTION`), capture recording metadata, extract landmarks, annotate gloss and natural-language
translations, validate with native-signer experts, and build signer-independent splits. Synthetic labels are never
treated as verified human annotation.
