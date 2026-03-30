import asyncio
import logging
import mimetypes
import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, status, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.schemas import (
    AthleteSlot,
    VideoUploadResponse,
    VideoAnalyzeRequest,
    VideoAnalyzeResponse,
    VideoListResponse,
    PoseAnalyzeRequest,
    PoseAnalyzeResponse,
    PoseAnalysisJobCreateResponse,
    PoseAnalysisJobStatusResponse,
    PoseOverlayResponse,
    AnalysisReportResponse,
    AnalysisReportGenerateResponse,
    AnalysisReportJobCreateResponse,
    AnalysisReportJobStatusResponse,
)
from app.services.video import video_service
from app.services.pose_analysis import pose_analysis_service
from app.services.analysis_report import analysis_report_service
from app.core.database import get_db, SessionLocal
from app.core.auth import verify_token
from app.models import User, AnalysisReportJob, PoseAnalysisJob


router = APIRouter(tags=["video"])
security_optional = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
}
ALLOWED_VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".webm",
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
REPORT_JOB_STATUS_PENDING = "pending"
REPORT_JOB_STATUS_RUNNING = "running"
REPORT_JOB_STATUS_COMPLETED = "completed"
REPORT_JOB_STATUS_FAILED = "failed"
POSE_JOB_STATUS_PENDING = "pending"
POSE_JOB_STATUS_RUNNING = "running"
POSE_JOB_STATUS_COMPLETED = "completed"
POSE_JOB_STATUS_FAILED = "failed"


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    access_token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Resolve current user from Bearer token or access_token query parameter."""
    token = credentials.credentials if credentials else access_token
    if not token:
        return None

    payload = verify_token(token)
    if payload is None:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    return user


def get_current_user_required(
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return current_user


def ensure_video_access(video_id: str, current_user: Optional[User]) -> dict:
    """Ensure the request can access video resources tied to an owner account."""
    metadata = video_service.get_video_metadata(video_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Video not found")

    owner_id = metadata.get("user_id")
    if owner_id:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        if str(current_user.id) != str(owner_id) and not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this video",
            )

    return metadata


def is_allowed_video_upload(file: UploadFile) -> bool:
    extension = (file.filename or "").lower()
    extension = extension[extension.rfind("."):] if "." in extension else ""
    return file.content_type in ALLOWED_VIDEO_TYPES or extension in ALLOWED_VIDEO_EXTENSIONS


def _parse_job_uuid(job_id: str) -> UUID:
    try:
        return UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid report job id") from exc


def _normalize_requested_slot(slot: Optional[AthleteSlot]) -> Optional[str]:
    if slot is None:
        return None
    return slot.value


def _serialize_report_job(
    job: AnalysisReportJob,
    results: list[AnalysisReportGenerateResponse],
) -> AnalysisReportJobStatusResponse:
    athlete_slot = None
    if job.requested_slot in {"left", "right"}:
        athlete_slot = AthleteSlot(job.requested_slot)
    return AnalysisReportJobStatusResponse(
        job_id=str(job.id),
        video_id=job.video_id,
        athlete_slot=athlete_slot,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error=job.error_message,
        results=results,
    )


def _decode_job_results(job: AnalysisReportJob) -> list[AnalysisReportGenerateResponse]:
    if not job.result_json:
        return []
    try:
        parsed = json.loads(job.result_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    results: list[AnalysisReportGenerateResponse] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            results.append(AnalysisReportGenerateResponse(**item))
        except Exception:
            continue
    return results


def _serialize_pose_job(
    job: PoseAnalysisJob,
    result: Optional[PoseAnalyzeResponse],
) -> PoseAnalysisJobStatusResponse:
    return PoseAnalysisJobStatusResponse(
        job_id=str(job.id),
        video_id=job.video_id,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error=job.error_message,
        result=result,
    )


def _decode_pose_job_result(job: PoseAnalysisJob) -> Optional[PoseAnalyzeResponse]:
    if not job.result_json:
        return None
    try:
        parsed = json.loads(job.result_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    try:
        return PoseAnalyzeResponse(**parsed)
    except Exception:
        return None


async def _run_pose_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        parsed_job_id = UUID(job_id)
    except ValueError:
        db.close()
        return

    try:
        job = (
            db.query(PoseAnalysisJob)
            .filter(PoseAnalysisJob.id == parsed_job_id)
            .first()
        )
        if job is None:
            return

        if job.status in {POSE_JOB_STATUS_RUNNING, POSE_JOB_STATUS_COMPLETED}:
            return

        job.status = POSE_JOB_STATUS_RUNNING
        job.started_at = datetime.utcnow()
        job.error_message = None
        db.commit()
        db.refresh(job)

        logger.info("pose_job_started job_id=%s video_id=%s", str(job.id), job.video_id)

        video_path = video_service.get_video_path(job.video_id)
        if not video_path:
            raise ValueError("Video not found. Please upload the video first.")

        result = await asyncio.to_thread(
            pose_analysis_service.analyze_pose,
            video_path,
            job.video_id,
        )

        payload = PoseAnalyzeResponse(
            video_id=job.video_id,
            message="Pose analysis completed successfully",
            pose_data_path=result["pose_data_path"],
            processed_frames=result["processing"]["processed_frames"],
            total_frames=result["processing"]["total_frames"],
        )
        job.result_json = json.dumps(payload.model_dump(), ensure_ascii=False, default=str)
        job.status = POSE_JOB_STATUS_COMPLETED
        job.completed_at = datetime.utcnow()
        job.error_message = None
        db.commit()
        logger.info("pose_job_completed job_id=%s video_id=%s", str(job.id), job.video_id)
    except Exception as exc:
        logger.exception("pose_job_failed job_id=%s error=%s", job_id, str(exc))
        job = (
            db.query(PoseAnalysisJob)
            .filter(PoseAnalysisJob.id == parsed_job_id)
            .first()
        )
        if job is not None:
            job.status = POSE_JOB_STATUS_FAILED
            job.completed_at = datetime.utcnow()
            job.error_message = str(exc)
            db.commit()
    finally:
        db.close()


async def _run_report_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        parsed_job_id = UUID(job_id)
    except ValueError:
        db.close()
        return

    try:
        job = (
            db.query(AnalysisReportJob)
            .filter(AnalysisReportJob.id == parsed_job_id)
            .first()
        )
        if job is None:
            return

        if job.status in {REPORT_JOB_STATUS_RUNNING, REPORT_JOB_STATUS_COMPLETED}:
            return

        job.status = REPORT_JOB_STATUS_RUNNING
        job.started_at = datetime.utcnow()
        job.error_message = None
        db.commit()
        db.refresh(job)
        logger.info("report_job_started job_id=%s video_id=%s", str(job.id), job.video_id)

        pose_data = pose_analysis_service.get_pose_data(job.video_id)
        if not pose_data:
            raise ValueError("Pose data not found. Please run pose analysis first.")

        report_tuples = await analysis_report_service.generate_pose_reports(
            db,
            user_id=job.user_id,
            video_id=job.video_id,
            pose_data=pose_data,
            athlete_slot=job.requested_slot,
            force_regenerate=bool(job.force_regenerate),
        )
        serialized_results = [
            analysis_report_service.serialize_report(
                report,
                athlete_slot=resolved_slot,
                cached=cached,
            )
            for report, cached, resolved_slot in report_tuples
        ]
        job.result_json = json.dumps(serialized_results, ensure_ascii=False, default=str)
        job.status = REPORT_JOB_STATUS_COMPLETED
        job.completed_at = datetime.utcnow()
        job.error_message = None
        db.commit()
        logger.info("report_job_completed job_id=%s video_id=%s", str(job.id), job.video_id)
    except Exception as exc:
        logger.exception("report_job_failed job_id=%s error=%s", job_id, str(exc))
        job = (
            db.query(AnalysisReportJob)
            .filter(AnalysisReportJob.id == parsed_job_id)
            .first()
        )
        if job is not None:
            job.status = REPORT_JOB_STATUS_FAILED
            job.completed_at = datetime.utcnow()
            job.error_message = "分析失败，请重新分析。"
            db.commit()
    finally:
        db.close()


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user_required),
):
    """
    Upload a video file for analysis.

    Supported formats: mp4, mov, avi, webm
    Max file size: 100MB
    """
    # Validate file type
    if not is_allowed_video_upload(file):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: MP4, MOV, AVI, WebM"
        )

    # Save the video (size check is done in video_service)
    try:
        metadata = {
            "title": file.filename,
            "athlete": "",
            "opponent": "",
            "weapon": "epee",
            "match_result": "",
            "score": "",
            "tournament": "",
            "user_id": str(current_user.id),
        }
        video_id, filename, file_path = await video_service.save_video(file, metadata=metadata, max_size=MAX_FILE_SIZE)

        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload video: {str(e)}"
        )


@router.post("/upload-with-metadata", response_model=VideoUploadResponse)
async def upload_video_with_metadata(
    file: UploadFile = File(...),
    title: str = File(""),
    athlete: str = File(""),
    opponent: str = File(""),
    weapon: str = File("epee"),
    match_result: str = File(""),
    score: str = File(""),
    tournament: str = File(""),
    current_user: User = Depends(get_current_user_required),
):
    """
    Upload a video file with metadata.

    Args:
        file: Video file
        title: Video title
        athlete: Athlete name
        opponent: Opponent name
        weapon: Weapon type (foil, epee, sabre)
        match_result: Match result (win, loss, draw)
        score: Match score (e.g., "15-12")
        tournament: Tournament name
    """
    # Validate file type
    if not is_allowed_video_upload(file):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: MP4, MOV, AVI, WebM"
        )

    # Validate weapon
    valid_weapons = ["foil", "epee", "sabre"]
    if weapon.lower() not in valid_weapons:
        weapon = "epee"

    # Validate match result
    valid_results = ["win", "loss", "draw"]
    if match_result.lower() not in valid_results:
        match_result = ""

    # Build metadata
    metadata = {
        "title": title or file.filename,
        "athlete": athlete,
        "opponent": opponent,
        "weapon": weapon,
        "match_result": match_result,
        "score": score,
        "tournament": tournament,
        "user_id": str(current_user.id),
    }

    # Save the video with metadata (size check included)
    try:
        video_id, filename, file_path = await video_service.save_video(file, metadata, max_size=MAX_FILE_SIZE)

        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully with metadata"
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload video: {str(e)}"
        )


@router.get("/list", response_model=VideoListResponse)
async def list_videos(current_user: User = Depends(get_current_user_required)):
    """
    List all uploaded videos with metadata.
    """
    try:
        videos = video_service.list_videos(user_id=str(current_user.id))
        return VideoListResponse(
            videos=videos,
            total=len(videos)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list videos: {str(e)}"
        )


@router.get("/{video_id}")
async def get_video(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get video details and metadata.
    """
    metadata = ensure_video_access(video_id, current_user)
    return metadata


@router.get("/{video_id}/file")
async def get_video_file(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Serve uploaded video file for playback."""
    metadata = ensure_video_access(video_id, current_user)
    video_path = metadata.get("file_path") or video_service.get_video_path(video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video file not found"
        )

    media_type, _ = mimetypes.guess_type(video_path)

    return FileResponse(
        video_path,
        media_type=media_type or "application/octet-stream",
        headers={"Accept-Ranges": "bytes"},
    )


@router.post("/analyze", response_model=VideoAnalyzeResponse)
async def analyze_video(
    request: VideoAnalyzeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Analyze a previously uploaded video.

    Args:
        video_id: ID of the video to analyze
        weapon: Weapon type (foil, epee, sabre)
        depth: Analysis depth level (1-5)
    """
    # Validate weapon type
    valid_weapons = ["foil", "epee", "sabre"]
    if request.weapon.lower() not in valid_weapons:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid weapon. Must be one of: {', '.join(valid_weapons)}"
        )

    # Validate depth
    if request.depth < 1 or request.depth > 5:
        raise HTTPException(
            status_code=400,
            detail="Depth must be between 1 and 5"
        )

    ensure_video_access(request.video_id, current_user)

    # Get video path
    video_path = video_service.get_video_path(request.video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Analyze the video
    try:
        analysis = await video_service.analyze_video(
            video_path=video_path,
            weapon=request.weapon,
            depth=request.depth
        )

        return VideoAnalyzeResponse(
            video_id=request.video_id,
            analysis=analysis,
            weapon=request.weapon,
            depth=request.depth
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze video: {str(e)}"
        )


# Pose Analysis Endpoints
@router.post("/analyze/pose", response_model=PoseAnalyzeResponse)
async def analyze_pose(
    request: PoseAnalyzeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Analyze human pose in a video using MediaPipe.

    Args:
        video_id: ID of the video to analyze
        sample_interval: Deprecated. Backend always processes every frame for quality.
    """
    ensure_video_access(request.video_id, current_user)

    # Get video path
    video_path = video_service.get_video_path(request.video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Run pose analysis
    try:
        result = pose_analysis_service.analyze_pose(
            video_path=video_path,
            video_id=request.video_id,
        )

        return PoseAnalyzeResponse(
            video_id=request.video_id,
            message="Pose analysis completed successfully",
            pose_data_path=result["pose_data_path"],
            processed_frames=result["processing"]["processed_frames"],
            total_frames=result["processing"]["total_frames"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze pose: {str(e)}"
        )


@router.post(
    "/{video_id}/analyze/pose/jobs",
    response_model=PoseAnalysisJobCreateResponse,
)
async def create_pose_analysis_job(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user)
    owner_id = metadata.get("user_id") or str(current_user.id)
    owner_uuid = analysis_report_service._parse_user_id(owner_id)

    job = PoseAnalysisJob(
        user_id=owner_uuid,
        video_id=video_id,
        status=POSE_JOB_STATUS_PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_pose_job, str(job.id))

    return PoseAnalysisJobCreateResponse(
        job_id=str(job.id),
        video_id=video_id,
        status=job.status,
        created_at=job.created_at,
    )


@router.get(
    "/{video_id}/analyze/pose/jobs/{job_id}",
    response_model=PoseAnalysisJobStatusResponse,
)
async def get_pose_analysis_job_status(
    video_id: str,
    job_id: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ensure_video_access(video_id, current_user)
    parsed_job_id = _parse_job_uuid(job_id)
    query = db.query(PoseAnalysisJob).filter(
        PoseAnalysisJob.id == parsed_job_id,
        PoseAnalysisJob.video_id == video_id,
    )
    if not current_user.is_admin:
        query = query.filter(PoseAnalysisJob.user_id == current_user.id)
    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Pose analysis job not found")

    result = _decode_pose_job_result(job)
    return _serialize_pose_job(job, result)


@router.get("/{video_id}/analysis-report", response_model=AnalysisReportResponse)
async def get_analysis_report(
    video_id: str,
    athlete_slot: Optional[AthleteSlot] = Query(default=None),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user)
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first.",
        )

    owner_id = metadata.get("user_id") or str(current_user.id)
    report, resolved_slot = analysis_report_service.get_report_for_slot(
        db,
        user_id=owner_id,
        video_id=video_id,
        pose_data=pose_data,
        athlete_slot=athlete_slot.value if athlete_slot else None,
    )

    if not report:
        raise HTTPException(status_code=404, detail="Analysis report not found")

    return AnalysisReportResponse(
        **analysis_report_service.serialize_report(report, athlete_slot=resolved_slot)
    )


@router.post("/{video_id}/analyze/pose/report", response_model=AnalysisReportGenerateResponse)
async def generate_pose_report(
    video_id: str,
    athlete_slot: Optional[AthleteSlot] = Query(default=None),
    force_regenerate: bool = Query(default=False),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """
    Generate a technical analysis report from pose data using LLM.

    This endpoint:
    1. Fetches pose data for the video
    2. Sends sampled pose data to LLM to generate an analysis report
    3. Returns the analysis text
    """
    metadata = ensure_video_access(video_id, current_user)

    # Get pose data
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    try:
        owner_id = metadata.get("user_id") or str(current_user.id)
        report, cached, resolved_slot = await analysis_report_service.generate_pose_report(
            db,
            user_id=owner_id,
            video_id=video_id,
            pose_data=pose_data,
            athlete_slot=athlete_slot.value if athlete_slot else None,
            force_regenerate=force_regenerate,
        )
        return AnalysisReportGenerateResponse(
            **analysis_report_service.serialize_report(
                report,
                athlete_slot=resolved_slot,
                cached=cached,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("generate_pose_report_failed video_id=%s error=%s", video_id, str(e))
        raise HTTPException(
            status_code=500,
            detail="分析失败，请重新分析。"
        )


@router.post(
    "/{video_id}/analyze/pose/report/jobs",
    response_model=AnalysisReportJobCreateResponse,
)
async def create_pose_report_job(
    video_id: str,
    background_tasks: BackgroundTasks,
    athlete_slot: Optional[AthleteSlot] = Query(default=None),
    force_regenerate: bool = Query(default=False),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user)
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first.",
        )

    owner_id = metadata.get("user_id") or str(current_user.id)
    owner_uuid = analysis_report_service._parse_user_id(owner_id)
    requested_slot = _normalize_requested_slot(athlete_slot)
    job = AnalysisReportJob(
        user_id=owner_uuid,
        video_id=video_id,
        requested_slot=requested_slot,
        force_regenerate=bool(force_regenerate),
        status=REPORT_JOB_STATUS_PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_report_job, str(job.id))

    response_slot = AthleteSlot(requested_slot) if requested_slot in {"left", "right"} else None
    return AnalysisReportJobCreateResponse(
        job_id=str(job.id),
        video_id=video_id,
        athlete_slot=response_slot,
        status=job.status,
        created_at=job.created_at,
    )


@router.get(
    "/{video_id}/analyze/pose/report/jobs/{job_id}",
    response_model=AnalysisReportJobStatusResponse,
)
async def get_pose_report_job_status(
    video_id: str,
    job_id: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ensure_video_access(video_id, current_user)
    parsed_job_id = _parse_job_uuid(job_id)
    query = db.query(AnalysisReportJob).filter(
        AnalysisReportJob.id == parsed_job_id,
        AnalysisReportJob.video_id == video_id,
    )
    if not current_user.is_admin:
        query = query.filter(AnalysisReportJob.user_id == current_user.id)
    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Report job not found")

    results = _decode_job_results(job)
    return _serialize_report_job(job, results)


@router.get("/{video_id}/pose-overlay", response_model=PoseOverlayResponse)
async def get_pose_overlay(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get or generate pose overlay video for a video.

    This endpoint generates a video with pose skeleton overlay.
    """
    ensure_video_access(video_id, current_user)

    # Get video path
    video_path = video_service.get_video_path(video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Check if overlay already exists
    existing_overlay = pose_analysis_service.get_overlay_path(video_id)
    if existing_overlay:
        return PoseOverlayResponse(
            video_id=video_id,
            overlay_video_path=existing_overlay,
            message="Pose overlay video (cached)"
        )

    # Generate overlay video
    try:
        overlay_path = pose_analysis_service.generate_pose_overlay(
            video_path=video_path,
            video_id=video_id
        )

        return PoseOverlayResponse(
            video_id=video_id,
            overlay_video_path=overlay_path,
            message="Pose overlay video generated successfully"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate pose overlay: {str(e)}"
        )


@router.get("/{video_id}/pose-overlay/file")
async def get_pose_overlay_file(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Serve pose overlay video for playback, generating it on demand if needed.
    """
    ensure_video_access(video_id, current_user)

    video_path = video_service.get_video_path(video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    overlay_path = pose_analysis_service.get_overlay_path(video_id)
    if not overlay_path:
        try:
            overlay_path = pose_analysis_service.generate_pose_overlay(
                video_path=video_path,
                video_id=video_id,
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate pose overlay: {str(e)}"
            )

    media_type, _ = mimetypes.guess_type(overlay_path)
    return FileResponse(
        overlay_path,
        media_type=media_type or "video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/{video_id}/pose-data")
async def get_pose_data(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get pose analysis data for a video.

    Returns the detected pose landmarks for each processed frame.
    """
    ensure_video_access(video_id, current_user)

    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    return pose_data
