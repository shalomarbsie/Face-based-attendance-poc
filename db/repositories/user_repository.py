from sqlalchemy import select

from db.models import User


class UserRepository:
    def __init__(self, session):
        self.session = session

    def get(self, user_id: str) -> User | None:
        return self.session.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalar(select(User).where(User.email == email.lower().strip()))

    def owner_exists(self) -> bool:
        return self.session.scalar(select(User.id).where(User.role == "owner").limit(1)) is not None

    def list_by_role(self, role: str) -> list[User]:
        return list(self.session.scalars(select(User).where(User.role == role).order_by(User.full_name)))

    def list_admins(self) -> list[User]:
        return list(
            self.session.scalars(
                select(User).where(User.role.in_(["owner", "hr"])).order_by(User.role, User.full_name)
            )
        )

    def create(
        self,
        full_name: str,
        role: str,
        email: str | None = None,
        password_hash: str | None = None,
        created_by: str | None = None,
    ) -> User:
        user = User(
            full_name=full_name.strip(),
            email=email.lower().strip() if email else None,
            password_hash=password_hash,
            role=role,
            created_by=created_by,
        )
        self.session.add(user)
        self.session.flush()
        return user
