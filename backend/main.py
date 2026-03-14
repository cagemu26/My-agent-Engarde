from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import settings
from app.api.routers import health
from app.services.llm import router as llm_router
from app.api.routers.video import router as video_router
from app.api.routers.auth import router as auth_router
from app.api.routers.admin import router as admin_router
from app.api.routers.feedback import router as feedback_router

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

# Video directory
VIDEO_DIR = Path(settings.VIDEO_UPLOAD_DIR)


@app.get("/")
def read_root():
    return {"message": "Welcome to Engarde AI API"}


@app.get("/video/{video_id}")
async def get_video_file(video_id: str):
    """Serve video file for playback"""
    video_path = VIDEO_DIR / f"{video_id}.mp4"
    if video_path.exists():
        return FileResponse(
            video_path,
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"}
        )
    return {"error": "Video not found"}, 404
