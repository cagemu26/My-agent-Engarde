import json
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fencing AI"
    VERSION: str = "1.0.0"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/fencing_ai"
    REDIS_URL: str = "redis://localhost:6379/0"

    STORAGE_PROVIDER: str = "local"  # local | cos
    LOCAL_STORAGE_ROOT: str = "./data/storage"
    LOCAL_STORAGE_BUCKET: str = "local-bucket"
    LOCAL_TEMP_DIR: str = "/tmp/engarde-ai"

    COS_BUCKET: str = ""
    COS_REGION: str = ""
    COS_APP_ID: str = ""
    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_KEY_PREFIX: str = "prod"
    COS_RAW_PREFIX: str = "raw"
    COS_DERIVED_PREFIX: str = "derived"
    COS_STS_EXPIRE_SECONDS: int = 900
    COS_SIGNED_URL_EXPIRE_SECONDS: int = 900

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
    MINIMAX_MODEL: str = "MiniMax-M2.7"
    MINIMAX_CONTEXT_WINDOW_TOKENS: int = 204800
    LLM_MAX_COMPLETION_TOKENS: int = 10240
    LLM_MAX_CONTEXT_CHARS: int = 180000
    LLM_MAX_SINGLE_MESSAGE_CHARS: int = 40000
    LLM_MAX_TOTAL_MESSAGES_CHARS: int = 120000
    LLM_MAX_SESSION_HISTORY_MESSAGES: int = 80
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

    @field_validator("STORAGE_PROVIDER", mode="before")
    @classmethod
    def _normalize_storage_provider(cls, value: Any) -> str:
        normalized = str(value or "local").strip().lower()
        if normalized not in {"local", "cos"}:
            raise ValueError("STORAGE_PROVIDER must be either 'local' or 'cos'")
        return normalized

    @field_validator("COS_KEY_PREFIX", "COS_RAW_PREFIX", "COS_DERIVED_PREFIX", mode="before")
    @classmethod
    def _normalize_cos_prefix(cls, value: Any) -> str:
        return str(value or "").strip().strip("/")

    @field_validator("COS_STS_EXPIRE_SECONDS", "COS_SIGNED_URL_EXPIRE_SECONDS", mode="before")
    @classmethod
    def _validate_positive_expire_seconds(cls, value: Any) -> int:
        parsed = int(value)
        if parsed <= 0:
            raise ValueError("COS expiry seconds must be greater than 0")
        return parsed

    class Config:
        env_file = ".env"


settings = Settings()
