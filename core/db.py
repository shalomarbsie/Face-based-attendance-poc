from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_database() -> None:
    from db import models  # noqa: F401

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)

    # Create HNSW index outside the transaction block.
    # CREATE INDEX cannot run inside a transaction block when using
    # CONCURRENTLY; we use a plain connection with manual commit here
    # so the same pattern works safely for both dev and production.
    # IF NOT EXISTS makes this idempotent — safe to run on every startup.
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS face_embeddings_embedding_hnsw_idx
            ON face_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
        print("[startup] HNSW index on face_embeddings.embedding is ready")