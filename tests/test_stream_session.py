import numpy as np
import cv2
import pytest
from unittest.mock import patch, MagicMock
from services.stream_session import StreamSession

def blank_jpeg(width=640, height=480) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def fake_detection(x1=100, y1=100, x2=200, y2=200):
    return {
        "bbox": np.array([x1, y1, x2, y2], dtype=float),
        "embedding": np.ones(512, dtype=np.float32),
    }


def test_empty_frame_returns_no_events():
    session = StreamSession(camera_id="cam_in")
    with patch("services.stream_session.get_face_app") as mock_app:
        mock_app.return_value.get.return_value = []
        result = session.process_frame(blank_jpeg())
    assert result == []


def test_attendance_fires_exactly_once_per_track():
    session = StreamSession(camera_id="cam_in")

    emp = MagicMock()
    emp.id = "emp_001"

    with patch("services.stream_session.get_face_app") as mock_app, \
         patch("services.stream_session.SessionLocal"), \
         patch("services.stream_session.FaceService") as mock_fs, \
         patch("services.stream_session.AttendanceService") as mock_att:

        mock_app.return_value.get.return_value = [fake_detection()]
        mock_fs.return_value.match_embedding.return_value = (emp, 0.91)
        mock_att.return_value.handle_detection.return_value = MagicMock(
            event_type="clock_in"
        )

        # Run well past the vote threshold (5 votes × sample_every_n=15 frames)
        for _ in range(120):
            session.process_frame(blank_jpeg())

        call_count = mock_att.return_value.handle_detection.call_count
        assert call_count == 1, f"Expected 1 attendance call, got {call_count}"


def test_unknown_face_calls_handle_unknown():
    session = StreamSession(camera_id="cam_in")

    with patch("services.stream_session.get_face_app") as mock_app, \
         patch("services.stream_session.SessionLocal"), \
         patch("services.stream_session.FaceService") as mock_fs, \
         patch("services.stream_session.AttendanceService") as mock_att:

        mock_app.return_value.get.return_value = [fake_detection()]
        mock_fs.return_value.match_embedding.return_value = (None, 0.21)
        mock_att.return_value.handle_unknown.return_value = MagicMock(
            event_type="unknown"
        )

        for _ in range(120):
            session.process_frame(blank_jpeg())

        assert mock_att.return_value.handle_unknown.call_count == 1