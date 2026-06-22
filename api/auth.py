import base64
import hmac
import json
import time
from hashlib import sha256

from fastapi import Cookie, Depends, HTTPException, status

from core.config import get_settings
from core.db import SessionLocal
from db.repositories.user_repository import UserRepository


AUTH_COOKIE = "attendance_session"
TOKEN_TTL_SECONDS = 60 * 60 * 12


def _sign(payload: bytes) -> str:
    settings = get_settings()
    return hmac.new(settings.app_secret_key.encode("utf-8"), payload, sha256).hexdigest()


def create_session_token(user_id: str) -> str:
    payload = json.dumps({"sub": user_id, "iat": int(time.time())}, separators=(",", ":")).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii")
    signature = _sign(payload)
    return f"{encoded_payload}.{signature}"


def verify_session_token(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    encoded_payload, signature = token.rsplit(".", 1)
    try:
        payload = base64.urlsafe_b64decode(encoded_payload.encode("ascii"))
        if not hmac.compare_digest(_sign(payload), signature):
            return None
        data = json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        return None

    if int(time.time()) - int(data.get("iat", 0)) > TOKEN_TTL_SECONDS:
        return None
    return data.get("sub")


def current_user(attendance_session: str | None = Cookie(default=None)):
    user_id = verify_session_token(attendance_session)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    with SessionLocal() as session:
        user = UserRepository(session).get(user_id)
        if user is None or user.status != "active" or user.role not in {"owner", "hr"}:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        session.expunge(user)
        return user


def require_roles(*roles: str):
    def dependency(user=Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return dependency
