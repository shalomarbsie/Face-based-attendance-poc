from core.config import ConfigError, get_settings, require_bootstrap_owner
from core.db import SessionLocal, init_database
from core.security import hash_password
from db.repositories.camera_repository import CameraRepository
from db.repositories.user_repository import UserRepository


def bootstrap_database() -> None:
    init_database()
    settings = get_settings()
    with SessionLocal() as session:
        users = UserRepository(session)
        cameras = CameraRepository(session)

        if not users.owner_exists():
            require_bootstrap_owner(settings)
            users.create(
                full_name=settings.bootstrap_owner_name,
                email=settings.bootstrap_owner_email,
                password_hash=hash_password(settings.bootstrap_owner_password),
                role="owner",
            )

        if not settings.bootstrap_in_camera_id or not settings.bootstrap_out_camera_id:
            raise ConfigError("BOOTSTRAP_IN_CAMERA_ID and BOOTSTRAP_OUT_CAMERA_ID are required")

        cameras.upsert(settings.bootstrap_in_camera_id, "Office Gate In", "in", "Office Gate")
        cameras.upsert(settings.bootstrap_out_camera_id, "Office Gate Out", "out", "Office Gate")
        session.commit()
