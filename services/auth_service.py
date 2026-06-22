from core.security import verify_password
from db.repositories.user_repository import UserRepository


class AuthService:
    def __init__(self, session):
        self.users = UserRepository(session)

    def authenticate(self, email: str, password: str):
        user = self.users.get_by_email(email)
        if user is None or user.role not in {"owner", "hr"} or user.status != "active":
            return None
        if not user.password_hash or not verify_password(password, user.password_hash):
            return None
        return user
