import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    database_url: str
    app_secret_key: str
    camera_id: str | None
    bootstrap_owner_name: str | None
    bootstrap_owner_email: str | None
    bootstrap_owner_password: str | None
    bootstrap_in_camera_id: str | None
    bootstrap_out_camera_id: str | None
    face_match_threshold: float = 0.5
    duplicate_window_seconds: int = 60
    intra_op_num_threads: int = 4
    inter_op_num_threads: int = 1
    det_size: int = 320
    stream_executor_workers: int = 2
    sample_every_n: int = 10
    max_active_tracks: int = 10
    target_fps: int = 25
    log_frame_timing: int = 1
    spoof_threshold: float = 0.6
    

def _empty_to_none(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return value.strip()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_dotenv()

    database_url = _empty_to_none(os.getenv("DATABASE_URL"))
    app_secret_key = _empty_to_none(os.getenv("APP_SECRET_KEY"))
    if not database_url:
        raise ConfigError("DATABASE_URL is required")
    if not app_secret_key:
        raise ConfigError("APP_SECRET_KEY is required")

    return Settings(
        database_url=database_url,
        app_secret_key=app_secret_key,
        camera_id=_empty_to_none(os.getenv("CAMERA_ID")),
        bootstrap_owner_name=_empty_to_none(os.getenv("BOOTSTRAP_OWNER_NAME")),
        bootstrap_owner_email=_empty_to_none(os.getenv("BOOTSTRAP_OWNER_EMAIL")),
        bootstrap_owner_password=_empty_to_none(os.getenv("BOOTSTRAP_OWNER_PASSWORD")),
        bootstrap_in_camera_id=_empty_to_none(os.getenv("BOOTSTRAP_IN_CAMERA_ID")),
        bootstrap_out_camera_id=_empty_to_none(os.getenv("BOOTSTRAP_OUT_CAMERA_ID")),
        face_match_threshold=float(os.getenv("FACE_MATCH_THRESHOLD", "0.5")),
        duplicate_window_seconds=int(os.getenv("DUPLICATE_WINDOW_SECONDS", "60")),
        det_size=int(os.getenv("DET_SIZE", "320")),
        intra_op_num_threads=int(os.getenv("INTRA_OP_NUM_THREADS", "3")),
        inter_op_num_threads=int(os.getenv("INTER_OP_NUM_THREADS", "1")),
        stream_executor_workers=int(os.getenv("STREAM_EXECUTOR_WORKERS", "2")),
        sample_every_n=int(os.getenv("SAMPLE_EVERY_N", "15")),
        max_active_tracks=int(os.getenv("MAX_ACTIVE_TRACKS", "3")),
        target_fps=int(os.getenv("TARGET_FPS", "15")),
        log_frame_timing=os.getenv("LOG_FRAME_TIMING", "0") == "1",
        spoof_threshold=float(os.getenv("SPOOF_THRESHOLD", "0.6")),
    )


def require_bootstrap_owner(settings: Settings) -> None:
    missing = [
        name
        for name, value in (
            ("BOOTSTRAP_OWNER_NAME", settings.bootstrap_owner_name),
            ("BOOTSTRAP_OWNER_EMAIL", settings.bootstrap_owner_email),
            ("BOOTSTRAP_OWNER_PASSWORD", settings.bootstrap_owner_password),
        )
        if not value
    ]
    if missing:
        raise ConfigError(f"Missing first owner bootstrap variables: {', '.join(missing)}")
