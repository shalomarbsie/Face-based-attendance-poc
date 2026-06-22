import streamlit as st

from core.bootstrap import bootstrap_database
from core.config import ConfigError
from core.db import SessionLocal
from services.auth_service import AuthService
from ui.session import current_user


st.set_page_config(page_title="Office Attendance", layout="wide")
st.title("Office Attendance Admin")

try:
    bootstrap_database()
except ConfigError as exc:
    st.error(str(exc))
    st.stop()
except Exception as exc:
    st.error(f"Database initialization failed: {exc}")
    st.stop()


user = current_user()
if user:
    st.success(f"Logged in as {user.full_name} ({user.role})")
    if st.button("Log out"):
        st.session_state.pop("user_id", None)
        st.rerun()

    st.subheader("Dashboard")
    st.write("Use the sidebar to manage HR users, register employees, and view attendance reports.")
    st.info("Camera attendance instances run separately with a fixed CAMERA_ID and do not require admin login.")
else:
    st.subheader("Owner / HR Login")
    with st.form("login_form"):
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Log in")

    if submitted:
        with SessionLocal() as session:
            auth = AuthService(session)
            user = auth.authenticate(email, password)
            if user is None:
                st.error("Invalid credentials")
            else:
                st.session_state["user_id"] = user.id
                st.rerun()
