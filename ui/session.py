import streamlit as st

from core.db import SessionLocal
from db.repositories.user_repository import UserRepository


def current_user():
    user_id = st.session_state.get("user_id")
    if not user_id:
        return None
    with SessionLocal() as session:
        return UserRepository(session).get(user_id)


def require_roles(*roles: str):
    user = current_user()
    if user is None:
        st.error("Please log in from the Home page.")
        st.stop()
    if user.role not in roles:
        st.error("You do not have permission to access this page.")
        st.stop()
    return user
