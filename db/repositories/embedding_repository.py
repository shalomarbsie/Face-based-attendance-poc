from sqlalchemy import select, text
from core.config import get_settings
from db.models import FaceEmbedding, User


class EmbeddingRepository:
    def __init__(self, session):
        self.session = session
        self.settings = get_settings()

    def save(self, user_id: str, embedding: list[float], model_name: str, model_version: str | None = None) -> FaceEmbedding:
        self.session.query(FaceEmbedding).filter(
            FaceEmbedding.user_id == user_id,
            FaceEmbedding.is_active.is_(True),
        ).update({"is_active": False})
        row = FaceEmbedding(
            user_id=user_id,
            embedding=embedding,
            model_name=model_name,
            model_version=model_version,
            is_active=True,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def find_nearest_employee(self, embedding: list[float]) -> tuple[User, float] | None:
        # Set ef_search for this transaction only.
        # Controls recall vs speed tradeoff for the HNSW index.
        self.session.execute(
            text(f"SET LOCAL hnsw.ef_search = {self.settings.hnsw_ef_search}")
        )
        
        distance = FaceEmbedding.embedding.cosine_distance(embedding)
        stmt = (
            select(User, (1 - distance).label("confidence"))
            .join(FaceEmbedding, FaceEmbedding.user_id == User.id)
            .where(
                User.role == "employee",
                User.status == "active",
                FaceEmbedding.is_active.is_(True),
            )
            .order_by(distance)
            .limit(1)
        )
        result = self.session.execute(stmt).first()
        if result is None:
            return None
        return result[0], float(result[1])

    def list_active_employee_embeddings(self) -> list[tuple[User, FaceEmbedding]]:
        stmt = (
            select(User, FaceEmbedding)
            .join(FaceEmbedding, FaceEmbedding.user_id == User.id)
            .where(User.role == "employee", User.status == "active", FaceEmbedding.is_active.is_(True))
            .order_by(User.full_name)
        )
        return list(self.session.execute(stmt).all())
