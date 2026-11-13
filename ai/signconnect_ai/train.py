"""
Train, evaluate and export an ISL sign-recognition model from the app's dataset export.

Usage:
  ai/.venv/Scripts/python -m signconnect_ai.train --data export.json --out runs/isl-001

Outputs in --out: model.onnx, manifest.json (upload both in Admin -> Models), metrics.json, report.md
"""
from __future__ import annotations

import argparse
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .data import Dataset, load_export, make_split
from .features import FEATURE_DIM, FEATURE_VERSION, PER_HAND, SEQUENCE_LENGTH
from .models import ARCHITECTURES, ExportWrapper, Normalize


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def augment(x: torch.Tensor, gen: torch.Generator) -> torch.Tensor:
    """Signer-variation augmentation: speed/crop jitter, small location shifts and landmark noise."""
    b, t, d = x.shape
    out = torch.empty_like(x)
    for i in range(b):
        # random crop of 85-100% of the sequence, stretched back to T (speed variation)
        keep = int(t * (0.85 + 0.15 * torch.rand(1, generator=gen).item()))
        start = int(torch.randint(0, t - keep + 1, (1,), generator=gen).item())
        seg = x[i, start : start + keep].T.unsqueeze(0)
        out[i] = torch.nn.functional.interpolate(seg, size=t, mode="linear", align_corners=True)[0].T
    noise = torch.randn(out.shape, generator=gen) * 0.03
    for slot in (0, PER_HAND):  # never add noise to presence flags
        noise[:, :, slot] = 0
        shift = (torch.rand(b, 1, 2, generator=gen) - 0.5) * 0.6  # location shift (in weighted units)
        out[:, :, slot + 1 : slot + 3] += shift * (out[:, :, slot : slot + 1] > 0)
    return out + noise * (out != 0)


def train_one(arch: str, ds: Dataset, tr: np.ndarray, va: np.ndarray, epochs: int, seed: int, log):
    set_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    x = torch.from_numpy(ds.x)
    y = torch.from_numpy(ds.y)
    mean = x[tr].reshape(-1, FEATURE_DIM).mean(0)
    std = x[tr].reshape(-1, FEATURE_DIM).std(0)
    norm = Normalize(mean, std)
    core = ARCHITECTURES[arch](FEATURE_DIM, len(ds.labels))
    opt = torch.optim.AdamW(core.parameters(), lr=3e-3, weight_decay=1e-3)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)
    best = (-1.0, None, 0)
    best_loss = float("inf")
    patience = max(25, epochs // 4)
    for epoch in range(epochs):
        core.train()
        perm = tr[torch.randperm(len(tr), generator=gen).numpy()]
        for i in range(0, len(perm), 32):
            idx = perm[i : i + 32]
            if len(idx) < 2 and arch == "tcn":
                continue  # BatchNorm needs >1 sample
            xb = augment(x[idx], gen)
            opt.zero_grad()
            loss = loss_fn(core(norm(xb)), y[idx])
            loss.backward()
            opt.step()
        acc = evaluate(norm, core, x[va], y[va])["accuracy"]
        core.eval()
        with torch.no_grad():
            val_loss = float(nn.functional.cross_entropy(core(norm(x[va])), y[va]))
        # Prefer higher accuracy; among equal accuracy prefer lower loss (a confident model, not a lucky guess).
        if acc > best[0] or (acc == best[0] and val_loss < best_loss - 1e-4):
            best = (acc, {k: v.clone() for k, v in core.state_dict().items()}, epoch)
            best_loss = val_loss
        if epoch - best[2] > patience:
            break
    core.load_state_dict(best[1])
    core.eval()
    log(f"  {arch}: best validation accuracy {best[0]:.3f}, loss {best_loss:.3f} at epoch {best[2]}")
    return norm, core, best[0], best_loss


@torch.no_grad()
def predict(norm, core, x: torch.Tensor) -> np.ndarray:
    core.eval()
    return torch.softmax(core(norm(x)), dim=-1).numpy()


def evaluate(norm, core, x: torch.Tensor, y: torch.Tensor, threshold: float | None = None) -> dict:
    if len(y) == 0:
        return {"accuracy": None, "n": 0}
    probs = predict(norm, core, x)
    pred = probs.argmax(1)
    yt = y.numpy()
    res = {"accuracy": float((pred == yt).mean()), "n": int(len(yt))}
    if threshold is not None:
        acc_mask = probs.max(1) >= threshold
        res["coverage"] = float(acc_mask.mean())
        res["acceptedAccuracy"] = float((pred[acc_mask] == yt[acc_mask]).mean()) if acc_mask.any() else None
    return res


MIN_THRESHOLD = 0.6  # live video contains movements that are not any known sign; never accept weak guesses


def calibrate_threshold(probs: np.ndarray, y: np.ndarray, target: float = 0.9) -> float:
    """Lowest confidence threshold (>= MIN_THRESHOLD) at which accepted validation predictions reach `target` accuracy."""
    if len(y) < 5:
        return 0.7
    conf, pred = probs.max(1), probs.argmax(1)
    for t in np.arange(MIN_THRESHOLD, 0.951, 0.02):
        m = conf >= t
        if m.sum() >= max(3, 0.3 * len(y)) and (pred[m] == y[m]).mean() >= target:
            return float(round(t, 2))
    # Target not reachable: pick the threshold with the best accuracy x coverage instead of rejecting everything.
    best_t, best_score = MIN_THRESHOLD, -1.0
    for t in np.arange(MIN_THRESHOLD, 0.951, 0.02):
        m = conf >= t
        if not m.any():
            continue
        score = (pred[m] == y[m]).mean() * m.mean()
        if score > best_score:
            best_t, best_score = t, score
    return float(round(best_t, 2))


def export_onnx(norm, core, path: Path) -> float:
    wrapper = ExportWrapper(norm, core).eval()
    dummy = torch.zeros(1, SEQUENCE_LENGTH, FEATURE_DIM)
    torch.onnx.export(
        wrapper, (dummy,), str(path), input_names=["landmarks"], output_names=["probs"],
        dynamic_axes={"landmarks": {0: "batch"}, "probs": {0: "batch"}}, opset_version=17, dynamo=False,
    )
    import onnxruntime as ort

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    probe = torch.randn(4, SEQUENCE_LENGTH, FEATURE_DIM)
    with torch.no_grad():
        ref = wrapper(probe).numpy()
    got = sess.run(["probs"], {"landmarks": probe.numpy()})[0]
    return float(np.abs(ref - got).max())


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True, help="dataset export JSON from Admin -> Dataset -> Export")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=150)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--version", default=None, help="model version string (default: date-based)")
    args = ap.parse_args(argv)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []

    def log(msg: str):
        print(msg, flush=True)
        lines.append(msg)

    started = time.time()
    ds = load_export(args.data)
    split = make_split(ds, args.seed)
    log(f"Language {ds.language}: {len(ds.y)} samples, {len(ds.labels)} signs, {len(set(ds.signers))} signers")
    if ds.dropped_classes:
        log(f"Skipped signs with too few samples: {', '.join(ds.dropped_classes)}")
    log(split.note)
    log(f"Split sizes: train {len(split.train)}, validation {len(split.val)}, test {len(split.test)}")

    results = {}
    for arch in ARCHITECTURES:
        results[arch] = train_one(arch, ds, split.train, split.val, args.epochs, args.seed, log)
    # Highest validation accuracy; ties broken by lower validation loss.
    best_arch = max(results, key=lambda a: (results[a][2], -results[a][3]))
    norm, core, val_acc, _ = results[best_arch]
    log(f"Selected architecture: {best_arch} (validation accuracy {val_acc:.3f})")

    x, y = torch.from_numpy(ds.x), torch.from_numpy(ds.y)
    threshold = calibrate_threshold(predict(norm, core, x[split.val]), ds.y[split.val])
    test = evaluate(norm, core, x[split.test], y[split.test], threshold)
    per_class = {}
    if len(split.test):
        probs = predict(norm, core, x[split.test])
        pred = probs.argmax(1)
        yt = ds.y[split.test]
        confusion = np.zeros((len(ds.labels), len(ds.labels)), dtype=int)
        for a, b in zip(yt, pred):
            confusion[a, b] += 1
        for i, lab in enumerate(ds.labels):
            m = yt == i
            per_class[lab["gloss"]] = {"n": int(m.sum()), "accuracy": float((pred[m] == i).mean()) if m.any() else None}
    else:
        confusion = np.zeros((0, 0), dtype=int)
    if test.get("coverage") is not None and test["coverage"] < 0.5:
        log(f"WARNING: only {test['coverage']:.0%} of test signs pass the confidence threshold. The model needs more or better data before it is useful.")
    log(f"Test accuracy: {test['accuracy']} on {test['n']} samples; threshold {threshold} -> coverage {test.get('coverage')}, accepted accuracy {test.get('acceptedAccuracy')}")

    onnx_path = out / "model.onnx"
    diff = export_onnx(norm, core, onnx_path)
    log(f"ONNX export verified with onnxruntime: max |torch - onnx| = {diff:.2e}")
    if diff > 1e-4:
        raise SystemExit("ONNX output differs from PyTorch; refusing to publish this model.")

    version = args.version or datetime.now(timezone.utc).strftime("%Y.%m.%d-%H%M")
    manifest = {
        "task": "SIGN_RECOGNITION",
        "language": ds.language,
        "version": version,
        "architecture": best_arch,
        "featureVersion": FEATURE_VERSION,
        "sequenceLength": SEQUENCE_LENGTH,
        "featureDim": FEATURE_DIM,
        "labels": ds.labels,
        "threshold": threshold,
        "metrics": {
            "testAccuracy": test["accuracy"],
            "validationAccuracy": val_acc,
            "signerIndependent": split.signer_independent,
            "trainSamples": int(len(split.train)),
            "testSamples": int(len(split.test)),
            "signers": len(set(ds.signers)),
        },
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "datasetExportedAt": ds.exported_at,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    metrics = {
        "architectures": {a: {"validationAccuracy": r[2], "validationLoss": r[3]} for a, r in results.items()},
        "selected": best_arch,
        "test": test,
        "perClass": per_class,
        "confusion": {"labels": [l["gloss"] for l in ds.labels], "matrix": confusion.tolist()},
        "split": split.note,
        "onnxMaxAbsDiff": diff,
        "seconds": round(time.time() - started, 1),
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (out / "report.md").write_text(
        "# Training report\n\n" + "\n".join(f"- {l}" for l in lines)
        + "\n\nAccuracy here is measured on held-out data only. Before claiming real-world quality, test with Deaf signers"
        " who were not in the training data, in different lighting and camera conditions (spec section 15).\n",
        encoding="utf-8",
    )
    log(f"Wrote {onnx_path}, manifest.json, metrics.json, report.md")
    return manifest, metrics


if __name__ == "__main__":
    main()
