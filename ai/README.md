# SignConnect AI: sign-recognition training

This folder trains the sign-recognition model that the app runs on-device during calls. It is kept separate from the product code (spec section 13).

**What you need to know first:** a model is only as good as its data. The app does not ship with an ISL model. You build one by collecting consented recordings from real signers (ideally Deaf and native ISL signers), reviewing them, and training here. Accuracy depends on how many signers and recordings you collect.

## The loop

| Step | Where | What happens |
|---|---|---|
| 1. Consent | App → Translator → *Contribute to the ISL dataset* | Each signer agrees to recording + training. Stored with a pseudonymous `signer-xxxx` id |
| 2. Record | same card | Pick a word, sign it after the countdown. **Only MediaPipe hand landmarks are stored, never video.** Aim for 10 recordings per word per signer |
| 3. Review | Admin → *Sign dataset* | Replay each recording as an animated skeleton; approve or reject |
| 4. Export | Admin → *Sign dataset* → *Download dataset JSON* | Approved samples with active consent only |
| 5. Train | here (below) | Trains 2 architectures, picks the best on held-out signers, exports ONNX |
| 6. Publish | Admin → *Sign models* | Upload `model.onnx` + `manifest.json`. Apps verify the SHA-256 and load it the next time sign detection starts. Older versions stay available for rollback |

Withdrawing consent (in the app) deletes that signer's recordings. Retrain afterwards to remove their influence from the model.

## Setup (once)

```bash
python -m venv ai/.venv
ai/.venv/Scripts/python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
ai/.venv/Scripts/python -m pip install -r ai/requirements.txt
```

## Train

```bash
cd ai
.venv/Scripts/python -m signconnect_ai.train --data path/to/signconnect-isl-dataset.json --out runs/isl-001
```

Outputs in `runs/isl-001/`:
- `model.onnx`
- `manifest.json`: labels, threshold and honest metrics
- `metrics.json`: per-sign accuracy, confusion matrix
- `report.md`

### How evaluation works
- **3 or more signers:** whole signers are held out for validation and test, so accuracy measures performance on **people the model has never seen** (spec: signer-independent evaluation).
- **Fewer than 3 signers:** a per-sample split is used and the manifest says `signerIndependent: false`. That accuracy is optimistic, and the app and admin console label it that way.
- **Signs with fewer than 3 approved recordings are skipped.**
- **The confidence threshold** is calibrated on validation data, with a floor of 0.6. Lower-confidence predictions are reported as "unsure" and never sent.
- **The ONNX export is checked** against PyTorch with onnxruntime. Training refuses to finish if they differ.

### Models
- **`bigru`:** bidirectional GRU, mean+max pooling.
- **`tcn`:** dilated temporal CNN.

Input: 32 frames × 132 landmark features (both hands). Feature normalisation is baked into the ONNX file.

## Tests

```bash
cd ai && .venv/Scripts/python -m pytest -q
```

- `test_features_parity.py`: the Python features equal the app's TypeScript features (fixture from `apps/web/test/make-feature-fixture.ts`). If you change `signFeatures.ts`, regenerate the fixture and bump `FEATURE_VERSION` in both places.
- `test_train_smoke.py`: an end-to-end training run on a **synthetic** dataset. This checks the mechanics only; never publish its model.

## Known limitations
- **Hands only.** Body pose and facial expressions (important in ISL grammar) are not captured yet. Adding them requires a new `FEATURE_VERSION`.
- **Isolated signs only.** One word per recording. Continuous sentence recognition (CTC) is future work.
- **No "not a sign" class.** Rejection relies on the confidence threshold.
- **No digital signatures.** Models are integrity-checked by SHA-256 only.
