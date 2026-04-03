from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine
from app.api.routers import health
from app.services.llm import router as llm_router
from app.api.routers.video import router as video_router
from app.api.routers.auth import router as auth_router
from app.api.routers.admin import router as admin_router
from app.api.routers.feedback import router as feedback_router
from app.api.routers.training import router as training_router
from app import models  # noqa: F401

app = FastAPI(
    title="Engarde AI API",
    description="API for Engarde AI - Fencing Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(llm_router)
app.include_router(video_router, prefix="/video")
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(training_router)


@app.middleware("http")
async def apply_no_store_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


def _validate_security_settings() -> None:
    secret = (settings.SECRET_KEY or "").strip()
    insecure_values = {
        "",
        "your-secret-key-change-in-production",
        "replace-with-a-long-random-string",
        "changeme",
        "secret",
    }
    if secret in insecure_values or len(secret) < settings.MIN_SECRET_KEY_LENGTH:
        raise RuntimeError(
            "Invalid SECRET_KEY: set a strong random secret (at least "
            f"{settings.MIN_SECRET_KEY_LENGTH} chars) before starting the server."
        )


def _drop_legacy_training_log_uniqueness() -> None:
    if engine.dialect.name != "postgresql":
        return

    # Legacy schema had a unique rule on (user_id, training_date), which blocks
    # multiple entries per day. Remove any leftover constraint/index variants.
    with engine.begin() as connection:
        constraint_rows = connection.execute(
            text(
                """
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = 'training_logs'
                  AND c.contype = 'u'
                  AND pg_get_constraintdef(c.oid) ~* '\\(user_id,\\s*training_date\\)'
                """
            )
        ).fetchall()

        for (constraint_name,) in constraint_rows:
            safe_name = constraint_name.replace('"', '""')
            connection.execute(
                text(f'ALTER TABLE training_logs DROP CONSTRAINT IF EXISTS "{safe_name}"')
            )

        index_rows = connection.execute(
            text(
                """
                SELECT schemaname, indexname
                FROM pg_indexes
                WHERE tablename = 'training_logs'
                  AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
                  AND indexdef ~* '\\(user_id,\\s*training_date\\)'
                """
            )
        ).fetchall()

        for schema_name, index_name in index_rows:
            safe_schema = schema_name.replace('"', '""')
            safe_index = index_name.replace('"', '""')
            connection.execute(
                text(f'DROP INDEX IF EXISTS "{safe_schema}"."{safe_index}"')
            )


def _ensure_chat_session_schema() -> None:
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(
                text("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(32)")
            )
            connection.execute(
                text(
                    "UPDATE chat_sessions "
                    "SET session_type = 'chat_qa' "
                    "WHERE session_type IS NULL OR session_type = ''"
                )
            )
            connection.execute(
                text("ALTER TABLE chat_sessions ALTER COLUMN session_type SET DEFAULT 'chat_qa'")
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_type_updated "
                    "ON chat_sessions (user_id, session_type, updated_at)"
                )
            )
            return

        if engine.dialect.name == "sqlite":
            columns = connection.execute(text("PRAGMA table_info(chat_sessions)")).fetchall()
            column_names = {row[1] for row in columns}
            if "session_type" not in column_names:
                connection.execute(
                    text("ALTER TABLE chat_sessions ADD COLUMN session_type VARCHAR(32) DEFAULT 'chat_qa'")
                )
            connection.execute(
                text(
                    "UPDATE chat_sessions "
                    "SET session_type = 'chat_qa' "
                    "WHERE session_type IS NULL OR session_type = ''"
                )
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_type_updated "
                    "ON chat_sessions (user_id, session_type, updated_at)"
                )
            )
            return

        # Generic fallback for other SQL engines.
        try:
            connection.execute(
                text("ALTER TABLE chat_sessions ADD COLUMN session_type VARCHAR(32)")
            )
        except Exception:
            pass
        connection.execute(
            text(
                "UPDATE chat_sessions "
                "SET session_type = 'chat_qa' "
                "WHERE session_type IS NULL OR session_type = ''"
            )
        )


def _ensure_auth_schema() -> None:
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(
                text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP")
            )
            return

        if engine.dialect.name == "sqlite":
            columns = connection.execute(text("PRAGMA table_info(users)")).fetchall()
            column_names = {row[1] for row in columns}
            if "verification_token_expires" not in column_names:
                connection.execute(text("ALTER TABLE users ADD COLUMN verification_token_expires DATETIME"))
            return

        try:
            connection.execute(text("ALTER TABLE users ADD COLUMN verification_token_expires DATETIME"))
        except Exception:
            pass


@app.on_event("startup")
def ensure_database_tables():
    _validate_security_settings()
    Base.metadata.create_all(bind=engine)
    _drop_legacy_training_log_uniqueness()
    _ensure_chat_session_schema()
    _ensure_auth_schema()


@app.get("/")
def read_root():
    return {"message": "Welcome to Engarde AI API"}
