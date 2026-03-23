from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fencing AI"
    VERSION: str = "0.1.0"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/fencing_ai"
    REDIS_URL: str = "redis://localhost:6379/0"

    CHROMA_PERSIST_DIR: str = "./data/chroma"
    KB_DATA_DIR: str = "./knowledge"
    KB_COLLECTION: str = "fencing_knowledge"

    VIDEO_UPLOAD_DIR: str = "./data/videos"

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

    # Email verification (set to True in production)
    REQUIRE_EMAIL_VERIFICATION: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
