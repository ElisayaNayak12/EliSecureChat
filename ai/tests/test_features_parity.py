"""The trainer's features must equal the web app's (TypeScript) features, or a trained model would see
different inputs at inference time than in training. Fixture produced by apps/web/test/make-feature-fixture.ts."""
import json
from pathlib import Path

import numpy as np

from signconnect_ai.features import FEATURE_DIM, frame_features, resample

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "features_fixture.json").read_text())


def test_frame_features_match_typescript():
    py = np.stack([frame_features(f["hands"]) for f in FIXTURE["frames"]])
    ts = np.array(FIXTURE["features"], dtype=np.float32)
    assert py.shape == ts.shape == (len(FIXTURE["frames"]), FEATURE_DIM)
    assert np.abs(py - ts).max() < 1e-4


def test_resample_matches_typescript():
    ts_feats = np.array(FIXTURE["features"], dtype=np.float32)
    assert np.abs(resample(ts_feats, 32) - np.array(FIXTURE["resampled"], dtype=np.float32)).max() < 1e-5


def test_missing_hands_are_zero_and_slots_follow_handedness():
    empty = frame_features([])
    assert not empty.any()
    p = [0.5] * 63
    right_only = frame_features([{"h": "R", "s": 0.9, "p": p}])
    assert right_only[0] == 0 and right_only[66] == 1  # Right hand goes in slot 1


def test_sequences_drop_handless_frames_like_the_live_segmenter():
    from signconnect_ai.features import sample_to_sequence

    p = [0.5] * 63
    hand = {"h": "R", "s": 0.9, "p": p}
    frames = [{"t": 0, "hands": []}, {"t": 1, "hands": [hand]}, {"t": 2, "hands": []}, {"t": 3, "hands": [hand]}, {"t": 4, "hands": []}]
    seq = sample_to_sequence(frames, 8)
    assert seq.shape == (8, 132) and (seq[:, 66] == 1).all()
