from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fencing AI"
    VERSION: str = "0.1.0"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/fencing_ai"
    REDIS_URL: str = "redis://localhost:6379/0"

    CHROMA_PERSIST_DIR: str = "./data/chroma"

    VIDEO_UPLOAD_DIR: str = "./data/videos"

    MINIMAX_API_KEY: str = ""
    MINIMAX_BASE_URL: str = "https://api.minimaxi.com/v1"

    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
