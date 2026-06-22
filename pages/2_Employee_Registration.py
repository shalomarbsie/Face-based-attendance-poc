import hashlib

import cv2
import numpy as np
import streamlit as st

from core.db import SessionLocal
from services.face_service import get_face_app
from services.user_service import UserService
from ui.session import require_roles


st.set_page_config(page_title="Employee Registration", layout="wide")
actor = require_roles("owner", "hr")
st.subheader("Employee Registration")

MIN_FACE_SAMPLES = 5
MAX_FACE_SAMPLES = 30

if "registration_embeddings" not in st.session_state:
    st.session_state["registration_embeddings"] = []
if "last_registration_capture_hash" not in st.session_state:
    st.session_state["last_registration_capture_hash"] = None


@st.cache_resource
def load_face_app():
    return get_face_app()


def extract_embedding_from_image(image_bytes: bytes):
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if frame is None:
        return None, None, "Could not decode captured image"

    results = load_face_app().get(frame, max_num=1)
    if not results:
        return frame, None, "No face detected. Try better lighting and face the camera directly."

    res = results[0]
    bbox = res["bbox"].astype(int)
    cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 2)
    embedding = res["embedding"].astype(np.float32)
    return frame, embedding, "Face sample captured"


st.write(f"Captured samples: {len(st.session_state['registration_embeddings'])}/{MIN_FACE_SAMPLES} minimum")
st.caption("Capture the employee's face at least 5 times. Use slight angle/position changes for better enrollment.")

capture = st.camera_input("Capture employee face sample")

if capture is not None:
    image_bytes = capture.getvalue()
    capture_hash = hashlib.sha256(image_bytes).hexdigest()

    if capture_hash != st.session_state["last_registration_capture_hash"]:
        annotated_frame, embedding, message = extract_embedding_from_image(image_bytes)
        st.session_state["last_registration_capture_hash"] = capture_hash

        if annotated_frame is not None:
            st.image(cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB), caption=message)

        if embedding is None:
            st.warning(message)
        elif len(st.session_state["registration_embeddings"]) >= MAX_FACE_SAMPLES:
            st.info(f"Maximum {MAX_FACE_SAMPLES} samples already captured")
        else:
            st.session_state["registration_embeddings"].append(embedding)
            st.success(f"{message}. Total samples: {len(st.session_state['registration_embeddings'])}")

with st.form("employee_form"):
    full_name = st.text_input("Employee full name")
    email = st.text_input("Employee email (optional)")
    submitted = st.form_submit_button("Register employee")

if submitted:
    samples = st.session_state["registration_embeddings"]
    if not full_name.strip():
        st.error("Employee name is required")
    elif len(samples) < MIN_FACE_SAMPLES:
        st.error(f"Capture at least {MIN_FACE_SAMPLES} valid face samples before registering")
    else:
        embedding = np.vstack(samples).mean(axis=0).astype(np.float32).tolist()
        try:
            with SessionLocal() as session:
                user_service = UserService(session)
                user_service.create_employee(actor, full_name, email.strip() or None, embedding)
            st.session_state["registration_embeddings"] = []
            st.session_state["last_registration_capture_hash"] = None
            st.success(f"Registered {full_name}")
        except Exception as exc:
            st.error(str(exc))

if st.button("Clear captured samples"):
    st.session_state["registration_embeddings"] = []
    st.session_state["last_registration_capture_hash"] = None
    st.rerun()
