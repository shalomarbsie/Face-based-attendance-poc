# tests/test_tracker.py
import numpy as np
import time
import pytest
from services.tracker import CentroidTracker


def test_new_detection_creates_track():
    t = CentroidTracker()
    t.update([np.array([10, 10, 50, 50])])
    assert len(t.tracks) == 1


def test_moving_face_keeps_same_track_id():
    t = CentroidTracker()
    t.update([np.array([10, 10, 50, 50])])
    tid = list(t.tracks.keys())[0]
    t.update([np.array([12, 12, 52, 52])])   # small movement
    assert tid in t.tracks


def test_disappeared_face_is_purged_after_max_frames():
    t = CentroidTracker(max_disappeared=3)
    t.update([np.array([10, 10, 50, 50])])
    for _ in range(4):
        t.update([])                          # no detection for 4 frames
    assert len(t.tracks) == 0


def test_max_active_tracks_cap_is_respected():
    t = CentroidTracker(max_active_tracks=3)
    # Try to register 5 simultaneous new faces
    faces = [np.array([i * 60, 0, i * 60 + 40, 40]) for i in range(5)]
    t.update(faces)
    assert len(t.tracks) <= 3               # laptop cap enforced


def test_majority_verdict_needs_five_votes():
    t = CentroidTracker()
    t.update([np.array([10, 10, 50, 50])])
    tid = list(t.tracks.keys())[0]
    for _ in range(4):
        t.record_vote(tid, "emp_abc", 0.85)
    assert t.get_majority_verdict(tid) is None   # 4 votes not enough
    t.record_vote(tid, "emp_abc", 0.85)
    result = t.get_majority_verdict(tid)
    assert result is not None
    assert result[0] == "emp_abc"


def test_committed_track_not_re_sampled():
    t = CentroidTracker(sample_every_n=1)
    t.update([np.array([10, 10, 50, 50])])
    tid = list(t.tracks.keys())[0]
    t.mark_committed(tid)
    t.update([np.array([10, 10, 50, 50])])
    assert not t.should_sample(tid)


def test_tracker_stays_under_1ms_per_frame():
    t = CentroidTracker(max_active_tracks=3)
    faces = [np.array([i * 60, 0, i * 60 + 40, 40]) for i in range(3)]
    t.update(faces)
    start = time.perf_counter()
    for _ in range(200):
        t.update(faces)
    avg_ms = (time.perf_counter() - start) / 200 * 1000
    assert avg_ms < 1.0, f"Tracker too slow: {avg_ms:.2f}ms per frame"