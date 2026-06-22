import streamlit as st

from core.db import SessionLocal
from services.user_service import UserService
from ui.session import require_roles


st.set_page_config(page_title="HR Management", layout="wide")
actor = require_roles("owner")
st.subheader("HR Management")

with st.form("create_hr"):
    full_name = st.text_input("HR full name")
    email = st.text_input("HR email")
    password = st.text_input("Temporary password", type="password")
    submitted = st.form_submit_button("Create HR")

if submitted:
    if not full_name.strip() or not email.strip() or not password:
        st.error("Name, email, and password are required")
    else:
        try:
            with SessionLocal() as session:
                service = UserService(session)
                service.create_hr(actor, full_name, email, password)
            st.success(f"Created HR user {full_name}")
        except Exception as exc:
            st.error(str(exc))

with SessionLocal() as session:
    admins = UserService(session).list_admins()

st.subheader("Admin Users")
st.dataframe(
    [
        {"Name": user.full_name, "Email": user.email, "Role": user.role, "Status": user.status}
        for user in admins
    ],
    use_container_width=True,
)
