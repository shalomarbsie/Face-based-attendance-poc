from core.security import hash_password
from db.repositories.embedding_repository import EmbeddingRepository
from db.repositories.user_repository import UserRepository


class PermissionError(RuntimeError):
    pass


class UserService:
    def __init__(self, session):
        self.session = session
        self.users = UserRepository(session)
        self.embeddings = EmbeddingRepository(session)

    def create_hr(self, actor, full_name: str, email: str, password: str):
        if actor.role != "owner":
            raise PermissionError("Only owners can create HR users")
        if self.users.get_by_email(email):
            raise ValueError("A user with this email already exists")
        user = self.users.create(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role="hr",
            created_by=actor.id,
        )
        self.session.commit()
        return user

    def create_employee(self, actor, full_name: str, email: str | None, embedding: list[float]):
        if actor.role not in {"owner", "hr"}:
            raise PermissionError("Only owners and HR users can create employees")
        if email and self.users.get_by_email(email):
            raise ValueError("A user with this email already exists")
        user = self.users.create(full_name=full_name, email=email, role="employee", created_by=actor.id)
        self.embeddings.save(user.id, embedding, model_name="buffalo_sc")
        self.session.commit()
        return user

    def list_employees(self):
        return self.users.list_by_role("employee")

    def list_admins(self):
        return self.users.list_admins()
