import numpy as np
import cv2
import pytest
from unittest.mock import patch

from services.spoof_service import SpoofService, _expand_crop
from services.stream_session import StreamSession

def blank_frame(h=480, w=640):
    return np.zeros((h, w, 3), dtype=np.uint8)

def blank_jpeg(width=640, height=480) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()

def fake_detection(x1=100, y1=100, x2=200, y2=200):
    return {
        "bbox": np.array([x1, y1, x2, y2], dtype=float),
        "embedding": np.ones(512, dtype=np.float32),
    }


def test_is_live_returns_bool_and_float():
    svc = SpoofService()
    frame = blank_frame()
    # Use a bbox that fits comfortably inside the frame
    bbox = np.array([200, 150, 380, 350], dtype=float)
    is_live, score = svc.is_live(frame, bbox)
    assert isinstance(is_live, bool)
    assert 0.0 <= score <= 1.0


def test_edge_bbox_does_not_crash():
    """Face right at the frame boundary — padding must handle it."""
    svc = SpoofService()
    frame = blank_frame()
    bbox = np.array([0, 0, 30, 30], dtype=float)   # top-left corner
    is_live, score = svc.is_live(frame, bbox)
    assert isinstance(is_live, bool)


def test_expand_crop_stays_within_frame():
    frame = blank_frame()
    bbox = np.array([10, 10, 60, 60], dtype=float)
    crop = _expand_crop(frame, bbox, scale=2.7)
    # Crop must be non-empty and square-ish (within rounding)
    assert crop.shape[0] > 0 and crop.shape[1] > 0
    assert abs(crop.shape[0] - crop.shape[1]) <= 2


def test_expand_crop_out_of_bounds_bbox():
    """2.7x expansion of a near-edge face must not produce negative slices."""
    frame = blank_frame()
    bbox = np.array([0, 0, 50, 50], dtype=float)
    crop = _expand_crop(frame, bbox, scale=2.7)
    assert crop.shape[0] > 0


def test_spoof_session_cached():
    """get_spoof_session must return the same object on repeated calls."""
    from services.spoof_service import get_spoof_session
    s1 = get_spoof_session()
    s2 = get_spoof_session()
    assert s1 is s2

def test_spoof_gate_blocks_match_embedding():
    """
    If SpoofService.is_live always returns False,
    match_embedding must never be called.
    """
    session = StreamSession(camera_id="cam_in")

    with patch("services.stream_session.get_face_app") as mock_app, \
         patch("services.stream_session.SpoofService") as mock_spoof_cls, \
         patch("services.stream_session.SessionLocal"), \
         patch("services.stream_session.FaceService") as mock_fs, \
         patch("services.stream_session.AttendanceService"):

        mock_app.return_value.get.return_value = [fake_detection()]
        # Anti-spoof always rejects
        mock_spoof_cls.return_value.is_live.return_value = (False, 0.1)

        for _ in range(120):
            session.process_frame(blank_jpeg())

        # match_embedding must never have been called
        assert mock_fs.return_value.match_embedding.call_count == 0