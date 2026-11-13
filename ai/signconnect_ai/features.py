"""
Landmark features — a line-for-line port of apps/web/src/ai/signFeatures.ts and the resampler in
apps/web/src/ai/signRecognizer.ts. The web app computes these at inference time, so training MUST
use identical numbers. tests/test_features_parity.py checks this against a fixture produced by the
TypeScript code.

FEATURE_VERSION 1: per hand slot (Left, Right):
  presence, wrist x/y location (weighted), 21 wrist-relative points scaled by palm size (x, y weighted; z weighted less)
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np

FEATURE_VERSION = 1
LANDMARKS_PER_HAND = 21
PER_HAND = 1 + 2 + LANDMARKS_PER_HAND * 3  # 66
FEATURE_DIM = PER_HAND * 2  # 132
SEQUENCE_LENGTH = 32

WRIST = 0
PALM_POINTS = (5, 9, 17)
LOCATION_WEIGHT = 6.0
SHAPE_WEIGHT = 0.5
DEPTH_WEIGHT = 0.5


def _write_hand(out: np.ndarray, offset: int, pts: list[list[float]]) -> None:
    wx, wy, wz = pts[WRIST]
    scale = 0.0
    for i in PALM_POINTS:
        scale += math.hypot(pts[i][0] - wx, pts[i][1] - wy)
    scale = scale / len(PALM_POINTS) or 1e-6
    out[offset] = 1.0
    out[offset + 1] = (wx - 0.5) * 2 * LOCATION_WEIGHT
    out[offset + 2] = (wy - 0.5) * 2 * LOCATION_WEIGHT
    for i in range(LANDMARKS_PER_HAND):
        x, y, z = pts[i]
        o = offset + 3 + i * 3
        out[o] = ((x - wx) / scale) * SHAPE_WEIGHT
        out[o + 1] = ((y - wy) / scale) * SHAPE_WEIGHT
        out[o + 2] = ((z - wz) / scale) * SHAPE_WEIGHT * DEPTH_WEIGHT


def frame_features(hands: Iterable[dict]) -> np.ndarray:
    """One exported frame's hands ([{h: 'L'|'R', s: score, p: [63 floats]}]) -> FEATURE_DIM float32 vector."""
    out = np.zeros(FEATURE_DIM, dtype=np.float64)
    valid = [h for h in hands if len(h["p"]) == LANDMARKS_PER_HAND * 3]
    # Same ordering as the TS code: highest score first, max two hands (stable sort like Array.prototype.sort).
    valid = sorted(valid, key=lambda h: -h["s"])[:2]
    slots: list[dict | None] = [None, None]
    for h in valid:
        preferred = 0 if h["h"] == "L" else 1
        if slots[preferred] is None:
            slots[preferred] = h
        elif slots[1 - preferred] is None:
            slots[1 - preferred] = h
    for i, h in enumerate(slots):
        if h is not None:
            p = h["p"]
            _write_hand(out, i * PER_HAND, [[p[k * 3], p[k * 3 + 1], p[k * 3 + 2]] for k in range(LANDMARKS_PER_HAND)])
    return out.astype(np.float32)


def hands_present(f: np.ndarray) -> int:
    return int(f[0] > 0) + int(f[PER_HAND] > 0)


def resample(frames: np.ndarray, length: int = SEQUENCE_LENGTH) -> np.ndarray:
    """(T, D) -> (length, D) by linear interpolation; identical to resample() in signRecognizer.ts."""
    n = frames.shape[0]
    if n == 0:
        return np.zeros((length, frames.shape[1] if frames.ndim == 2 else FEATURE_DIM), dtype=np.float32)
    if n == 1:
        return np.repeat(frames.astype(np.float32), length, axis=0)
    out = np.empty((length, frames.shape[1]), dtype=np.float32)
    for i in range(length):
        t = i * (n - 1) / (length - 1)
        lo = math.floor(t)
        hi = min(n - 1, lo + 1)
        w = t - lo
        # Float32 arithmetic order matches the TypeScript Float32Array computation closely.
        out[i] = frames[lo].astype(np.float32) * np.float32(1 - w) + frames[hi].astype(np.float32) * np.float32(w)
    return out


def trim_to_hands(frames: np.ndarray) -> np.ndarray:
    """Keep only frames with a hand. The live app's SignSegmenter does the same (it never buffers handless
    frames), so training and inference see sequences built the same way."""
    keep = [hands_present(f) > 0 for f in frames]
    return frames[np.array(keep, dtype=bool)] if len(frames) else frames


def sample_to_sequence(raw_frames: list[dict], length: int = SEQUENCE_LENGTH) -> np.ndarray:
    feats = np.stack([frame_features(f["hands"]) for f in raw_frames]) if raw_frames else np.zeros((0, FEATURE_DIM), np.float32)
    return resample(trim_to_hands(feats), length)
