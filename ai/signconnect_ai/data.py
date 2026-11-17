"""Load the app's dataset export and build signer-independent splits."""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .features import FEATURE_DIM, FEATURE_VERSION, SEQUENCE_LENGTH, sample_to_sequence

MIN_SAMPLES_PER_CLASS = 3


@dataclass
class Dataset:
    language: str
    labels: list[dict]  # [{gloss, meaning}] in class-index order
    x: np.ndarray  # (N, T, D) float32
    y: np.ndarray  # (N,) int64
    signers: list[str]  # per sample
    exported_at: str | None
    dropped_classes: list[str] = field(default_factory=list)


def load_export(path: str | Path, length: int = SEQUENCE_LENGTH) -> Dataset:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("featureVersion") != FEATURE_VERSION or data.get("featureDim") != FEATURE_DIM:
        raise ValueError(f"Export uses feature format v{data.get('featureVersion')}/{data.get('featureDim')}; this trainer expects v{FEATURE_VERSION}/{FEATURE_DIM}.")
    samples = data["samples"]
    counts: dict[str, int] = {}
    for s in samples:
        counts[s["gloss"]] = counts.get(s["gloss"], 0) + 1
    keep = sorted(g for g, c in counts.items() if c >= MIN_SAMPLES_PER_CLASS)
    dropped = sorted(g for g, c in counts.items() if c < MIN_SAMPLES_PER_CLASS)
    if len(keep) < 2:
        raise ValueError(f"Need at least 2 signs with >= {MIN_SAMPLES_PER_CLASS} approved samples each; have {counts}.")
    meanings = {v["gloss"]: v["meaning"] for v in data.get("vocabulary", [])}
    index = {g: i for i, g in enumerate(keep)}
    xs, ys, signers = [], [], []
    for s in samples:
        if s["gloss"] not in index:
            continue
        seq = sample_to_sequence(s["frames"], length)
        if not np.any(seq):
            continue
        xs.append(seq)
        ys.append(index[s["gloss"]])
        signers.append(s["signerId"])
    return Dataset(
        language=data["language"],
        labels=[{"gloss": g, "meaning": meanings.get(g, g.replace("-", " ").title())} for g in keep],
        x=np.stack(xs).astype(np.float32),
        y=np.array(ys, dtype=np.int64),
        signers=signers,
        exported_at=data.get("exportedAt"),
        dropped_classes=dropped,
    )


@dataclass
class Split:
    train: np.ndarray
    val: np.ndarray
    test: np.ndarray
    signer_independent: bool
    note: str


def make_split(ds: Dataset, seed: int = 7) -> Split:
    """
    >= 3 signers: whole signers are held out for test and validation (signer-independent, as the spec requires).
    Fewer signers: stratified per-sample split, explicitly marked NOT signer-independent.
    """
    rng = random.Random(seed)
    unique = sorted(set(ds.signers))
    idx = np.arange(len(ds.y))
    if len(unique) >= 3:
        order = unique[:]
        rng.shuffle(order)
        test_s, val_s = {order[0]}, {order[1]}
        test = idx[[s in test_s for s in ds.signers]]
        val = idx[[s in val_s for s in ds.signers]]
        train = idx[[s not in test_s and s not in val_s for s in ds.signers]]
        return Split(train, val, test, True, f"Held-out signers: test={sorted(test_s)}, validation={sorted(val_s)}.")
    train, val, test = [], [], []
    for c in np.unique(ds.y):
        members = idx[ds.y == c].tolist()
        rng.shuffle(members)
        n = len(members)
        n_test = max(1, round(n * 0.2))
        n_val = max(1, round(n * 0.15)) if n - n_test > 2 else 0
        test += members[:n_test]
        val += members[n_test : n_test + n_val]
        train += members[n_test + n_val :]
    return Split(
        np.array(train), np.array(val if val else train[:1]), np.array(test), False,
        f"Only {len(unique)} signer(s): per-sample split. Accuracy will be OPTIMISTIC and is NOT signer-independent.",
    )
