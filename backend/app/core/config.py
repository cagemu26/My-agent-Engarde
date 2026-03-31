import json
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fencing AI"
    VERSION: str = "1.0.0"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/fencing_ai"
    REDIS_URL: str = "redis://localhost:6379/0"

    CHROMA_PERSIST_DIR: str = "./data/chroma"
    KB_DATA_DIR: str = "./knowledge"
    KB_COLLECTION: str = "fencing_knowledge"

    VIDEO_UPLOAD_DIR: str = "./data/videos"
    POSE_LANDMARKER_MODEL_PATH: str = "./data/models/pose_landmarker_heavy.task"
    POSE_LANDMARKER_MODEL_URL: str = (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
    )

    MINIMAX_API_KEY: str = ""
    MINIMAX_BASE_URL: str = "https://api.minimaxi.com/v1"
    RAG_ENABLED: bool = True
    RAG_TOP_K: int = 6
    RAG_SCORE_THRESHOLD: float = 0.25
    RAG_CHUNK_SIZE: int = 1400
    RAG_CHUNK_OVERLAP: int = 220
    RAG_EMBED_BATCH_SIZE: int = 16

    QIANFAN_API_BASE: str = "https://qianfan.baidubce.com/v2/embeddings"
    QIANFAN_BEARER_TOKEN: str = ""
    QIANFAN_EMBED_MODEL: str = "qwen3-embedding-4b"

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]

    # JWT Settings
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    MIN_SECRET_KEY_LENGTH: int = 32

    # Email verification (set to True in production)
    REQUIRE_EMAIL_VERIFICATION: bool = True
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24

    FRONTEND_PUBLIC_URL: str = "http://localhost:3000"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Engarde AI <noreply@engarde.ai>"

    RATE_LIMIT_ENABLED: bool = True
    AUTH_REGISTER_IP_RATE_LIMIT: int = 10
    AUTH_REGISTER_WINDOW_SECONDS: int = 3600
    AUTH_LOGIN_IP_RATE_LIMIT: int = 20
    AUTH_LOGIN_EMAIL_RATE_LIMIT: int = 10
    AUTH_LOGIN_WINDOW_SECONDS: int = 300
    AUTH_RESEND_VERIFICATION_IP_RATE_LIMIT: int = 10
    AUTH_RESEND_VERIFICATION_EMAIL_RATE_LIMIT: int = 5
    AUTH_RESEND_VERIFICATION_WINDOW_SECONDS: int = 3600
    AUTH_VERIFY_EMAIL_IP_RATE_LIMIT: int = 60
    AUTH_VERIFY_EMAIL_WINDOW_SECONDS: int = 3600
    AUTH_PASSWORD_RESET_IP_RATE_LIMIT: int = 10
    AUTH_PASSWORD_RESET_EMAIL_RATE_LIMIT: int = 5
    AUTH_PASSWORD_RESET_WINDOW_SECONDS: int = 3600
    AUTH_PASSWORD_RESET_CONFIRM_IP_RATE_LIMIT: int = 20
    AUTH_PASSWORD_RESET_CONFIRM_WINDOW_SECONDS: int = 3600

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                parsed = json.loads(raw)
                if not isinstance(parsed, list):
                    raise ValueError("CORS_ORIGINS JSON value must be a list")
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in raw.split(",") if item.strip()]
        raise ValueError("Unsupported CORS_ORIGINS format")

    class Config:
        env_file = ".env"


settings = Settings()
