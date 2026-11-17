"""
Pipeline smoke test on a SYNTHETIC dataset (generated hand trajectories, not real signing).
It checks the mechanics: export parsing, signer-independent split, training of both architectures,
threshold calibration, ONNX export + onnxruntime parity, manifest format. It says nothing about real
ISL accuracy, and its model must never be published.
"""
import json
import math
import random

import pytest

from signconnect_ai.data import load_export, make_split
from signconnect_ai.train import main as train_main


def synthetic_hand(cx, cy, curl, rnd):
    pts = [[cx, cy, 0.0]]
    for f in range(5):
        ang = -math.pi / 2 + (f - 2) * 0.35
        for j in range(1, 5):
            reach = 0.08 * (0.5 if j == 1 else (0.5 + (j - 1) * 0.5 / 3) * (1 - 0.6 * curl))
            pts.append([cx + math.cos(ang) * reach + (rnd.random() - 0.5) * 0.006, cy + math.sin(ang) * reach + (rnd.random() - 0.5) * 0.006, 0.0])
    return [round(v, 5) for p in pts for v in p]


MOTIONS = {
    "HELLO": lambda t: (0.3 + 0.4 * t, 0.5, 0.0),
    "YES": lambda t: (0.5, 0.3 + 0.4 * t, 1.0),
    "THANK-YOU": lambda t: (0.5 + 0.2 * math.cos(t * 6.28), 0.5 + 0.2 * math.sin(t * 6.28), 0.5),
}


def make_export(path, signers=5, per_sign=6):
    rnd = random.Random(1)
    samples = []
    for s in range(signers):
        style = 0.9 + 0.2 * rnd.random()  # signer-specific size/offset
        for gloss, motion in MOTIONS.items():
            for k in range(per_sign):
                n = rnd.randint(18, 40)
                frames = []
                for i in range(n):
                    x, y, curl = motion(i / (n - 1))
                    frames.append({"t": i * 50, "hands": [{"h": "R", "s": 0.95, "p": synthetic_hand(x * style, y, curl, rnd)}]})
                samples.append({"id": f"{s}-{gloss}-{k}", "signerId": f"signer-{s}", "gloss": gloss, "frames": frames})
    data = {
        "formatVersion": 1, "featureVersion": 1, "featureDim": 132, "language": "isl", "exportedAt": "synthetic",
        "vocabulary": [{"gloss": g, "meaning": g.title()} for g in MOTIONS], "samples": samples,
    }
    path.write_text(json.dumps(data))
    return path


def test_split_holds_out_whole_signers(tmp_path):
    ds = load_export(make_export(tmp_path / "e.json"))
    split = make_split(ds)
    assert split.signer_independent
    signers = lambda idx: {ds.signers[i] for i in idx}
    assert not (signers(split.train) & signers(split.test))
    assert not (signers(split.train) & signers(split.val))


def test_too_few_signers_is_flagged_not_signer_independent(tmp_path):
    ds = load_export(make_export(tmp_path / "e.json", signers=2))
    assert not make_split(ds).signer_independent


def test_end_to_end_training_exports_valid_onnx_and_manifest(tmp_path):
    export = make_export(tmp_path / "e.json")
    manifest, metrics = train_main(["--data", str(export), "--out", str(tmp_path / "run"), "--epochs", "40"])
    assert (tmp_path / "run" / "model.onnx").stat().st_size > 1000
    assert manifest["featureDim"] == 132 and manifest["sequenceLength"] == 32
    assert [l["gloss"] for l in manifest["labels"]] == sorted(MOTIONS)
    assert manifest["metrics"]["signerIndependent"] is True
    assert metrics["onnxMaxAbsDiff"] < 1e-4
    # Distinct synthetic motions should be easy; this only proves the pipeline learns at all.
    assert metrics["test"]["accuracy"] >= 0.8
    # Regression: an under-trained checkpoint once produced a threshold that rejected every sign live.
    assert metrics["test"]["coverage"] >= 0.7, metrics["test"]
    assert manifest["threshold"] <= 0.9


def test_rejects_export_with_wrong_feature_format(tmp_path):
    p = make_export(tmp_path / "e.json")
    data = json.loads(p.read_text())
    data["featureVersion"] = 99
    p.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="feature format"):
        load_export(p)
