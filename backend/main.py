from fastapi import FastAPI
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
    version="0.1.0"
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


@app.on_event("startup")
def ensure_database_tables():
    Base.metadata.create_all(bind=engine)
    _drop_legacy_training_log_uniqueness()


@app.get("/")
def read_root():
    return {"message": "Welcome to Engarde AI API"}
