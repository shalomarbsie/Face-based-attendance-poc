import av
import cv2
import streamlit as st
from sqlalchemy.exc import OperationalError
from streamlit_webrtc import webrtc_streamer

from core.bootstrap import bootstrap_database
from core.config import ConfigError, get_settings
from core.db import SessionLocal
from db.repositories.camera_repository import CameraRepository
from services.attendance_service import AttendanceService
from services.face_service import FaceService


st.set_page_config(page_title="Camera Attendance", layout="wide")
st.subheader("Camera Attendance")

try:
    settings = get_settings()
    bootstrap_database()
except ConfigError as exc:
    st.error(str(exc))
    st.stop()
except OperationalError as exc:
    st.error("Could not connect to this project's Postgres database.")
    st.info("Run `docker compose up -d postgres` and verify DATABASE_URL points to localhost:5433 for local runs.")
    st.code(str(exc.orig) if getattr(exc, "orig", None) else str(exc))
    st.stop()
except Exception as exc:
    st.error(f"Camera attendance startup failed: {exc}")
    st.stop()

if not settings.camera_id:
    st.error("CAMERA_ID is required for camera attendance instances.")
    st.stop()

with SessionLocal() as session:
    camera = CameraRepository(session).get(settings.camera_id)
    if camera is None or not camera.is_active:
        st.error("Configured CAMERA_ID does not match an active camera.")
        st.stop()
    st.info(f"Camera: {camera.name} ({camera.direction})")


def video_frame_callback(frame):
    img = frame.to_ndarray(format="bgr24")
    with SessionLocal() as session:
        face_service = FaceService(session)
        attendance_service = AttendanceService(session)
        results = face_service.detect_faces(img)

        if not results:
            return av.VideoFrame.from_ndarray(img, format="bgr24")

        for res in results:
            bbox = res["bbox"].astype(int)
            employee, confidence = face_service.match_embedding(res["embedding"])
            if employee is None:
                attendance_service.handle_unknown(settings.camera_id, confidence, "No confident face match")
                label = "Unknown"
                color = (0, 0, 255)
            else:
                event = attendance_service.handle_detection(employee.id, settings.camera_id, confidence)
                label = f"{employee.full_name} - {event.event_type}"
                color = (0, 255, 0) if event.event_type in {"clock_in", "clock_out"} else (255, 255, 0)

            cv2.rectangle(img, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 1)
            cv2.putText(img, label, (bbox[0], bbox[1]), cv2.FONT_HERSHEY_DUPLEX, 0.6, color, 2)

    return av.VideoFrame.from_ndarray(img, format="bgr24")


webrtc_streamer(
    key="cameraAttendance",
    video_frame_callback=video_frame_callback,
    rtc_configuration={"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
    media_stream_constraints={"video": True, "audio": False},
)
