import logging
import mimetypes
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, status, BackgroundTasks, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import or_
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
from app.services.asset_delivery import asset_delivery_service
from app.services.storage import storage_service
from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.core.auth import verify_token
from app.models import (
    User,
    AnalysisReportJob,
    PoseAnalysisJob,
    Video,
    ChatSession,
    ChatMessage,
)


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
UPLOAD_STATUS_INITIATED = "initiated"
UPLOAD_STATUS_UPLOADED = "uploaded"
UPLOAD_STATUS_FAILED = "failed"
CHAT_SESSION_TYPE_VIDEO = "video_analysis"
ANALYSIS_COMPLETION_NOTICE = "分析已完成，可前往历史详情页面查看分析细节。"
DERIVED_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable"


class UploadInitiateRequest(BaseModel):
    filename: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    title: Optional[str] = None
    athlete: Optional[str] = ""
    opponent: Optional[str] = ""
    weapon: Optional[str] = "epee"
    match_result: Optional[str] = ""
    score: Optional[str] = ""
    tournament: Optional[str] = ""
    notes: Optional[str] = ""


class UploadInitiateResponse(BaseModel):
    video_id: str
    bucket: str
    object_key: str
    upload_url: str
    expires_in: int
    method: str = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)
    message: str


class UploadCompleteRequest(BaseModel):
    video_id: str
    file_size: Optional[int] = None
    content_type: Optional[str] = None


class UploadCompleteResponse(BaseModel):
    success: bool
    video_id: str
    message: str


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
    require_verified = getattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    if require_verified and not user.email_verified:
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


def _get_video_record(db: Session, video_id: str) -> Optional[Video]:
    return db.query(Video).filter(Video.id == video_id).first()


def _serialize_video(video: Video) -> dict:
    return video_service.to_metadata_dict(video)


def _assert_video_access(owner_id: Optional[str], current_user: Optional[User]) -> None:
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


def ensure_video_access(video_id: str, current_user: Optional[User], db: Session) -> dict:
    """Ensure request can access video and return merged metadata (DB first, local fallback)."""
    video_record = _get_video_record(db, video_id)
    if video_record:
        _assert_video_access(str(video_record.user_id), current_user)
        return _serialize_video(video_record)

    metadata = video_service.get_video_metadata(video_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Video not found")

    _assert_video_access(str(metadata.get("user_id")) if metadata.get("user_id") else None, current_user)
    return metadata


def _ensure_video_uploaded(metadata: dict) -> None:
    raw_status = metadata.get("upload_status")
    if raw_status is None:
        return
    normalized = str(raw_status).strip().lower()
    if normalized and normalized != UPLOAD_STATUS_UPLOADED:
        raise HTTPException(
            status_code=409,
            detail="Video upload not completed yet. Please complete upload first.",
        )


def _is_storage_not_found_error(exc: Exception) -> bool:
    if isinstance(exc, FileNotFoundError):
        return True

    status_code = getattr(exc, "status_code", None)
    if status_code == 404:
        return True

    get_status_code = getattr(exc, "get_status_code", None)
    if callable(get_status_code):
        try:
            if int(get_status_code()) == 404:
                return True
        except Exception:
            pass

    raw_error_code = getattr(exc, "error_code", None)
    if raw_error_code is None:
        get_error_code = getattr(exc, "get_error_code", None)
        if callable(get_error_code):
            try:
                raw_error_code = get_error_code()
            except Exception:
                raw_error_code = None

    if raw_error_code is not None:
        normalized_code = str(raw_error_code).strip().lower()
        if normalized_code in {"nosuchkey", "notfound", "nosuchresource", "no_such_key"}:
            return True

    message = str(exc).lower()
    if (
        "404" in message
        or "not found" in message
        or "no such key" in message
        or "nosuchkey" in message
    ):
        return True
    return False


def _object_exists(bucket: str, key: str) -> bool:
    try:
        storage_service.provider.head_object(bucket=bucket, key=key)
        return True
    except Exception as exc:
        if _is_storage_not_found_error(exc):
            return False
        logger.exception(
            "storage_object_check_failed bucket=%s key=%s error=%s",
            bucket,
            key,
            str(exc),
        )
        raise HTTPException(
            status_code=503,
            detail="Storage service unavailable. Please retry later.",
        ) from exc


def _build_signed_url(bucket: str, key: str) -> str:
    return asset_delivery_service.generate_media_get_url(
        bucket=bucket,
        key=key,
    )


def _sample_pose_sequence_evenly(frames: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or len(frames) <= limit:
        return frames
    if limit == 1:
        return [frames[len(frames) // 2]]

    step = (len(frames) - 1) / (limit - 1)
    return [frames[round(index * step)] for index in range(limit)]


def _upload_path_to_storage(
    *,
    bucket: str,
    key: str,
    local_path: str,
    content_type: Optional[str],
    cache_control: Optional[str] = None,
) -> None:
    storage_service.provider.put_file(
        bucket=bucket,
        key=key,
        file_path=local_path,
        content_type=content_type,
        cache_control=cache_control,
    )


def _create_temp_workspace(prefix: str) -> str:
    return storage_service.make_temp_dir(prefix=prefix)


def _cleanup_temp_workspace(temp_dir: Optional[str]) -> None:
    if temp_dir:
        storage_service.cleanup_temp_dir(temp_dir)


def _queue_pose_analysis_job(
    *,
    db: Session,
    video_id: str,
    owner_id: str,
    background_tasks: BackgroundTasks,
) -> PoseAnalysisJob:
    active_job = (
        db.query(PoseAnalysisJob)
        .filter(
            PoseAnalysisJob.video_id == video_id,
            PoseAnalysisJob.status.in_([POSE_JOB_STATUS_PENDING, POSE_JOB_STATUS_RUNNING]),
        )
        .order_by(PoseAnalysisJob.created_at.desc())
        .first()
    )
    if active_job:
        return active_job

    owner_uuid = analysis_report_service._parse_user_id(owner_id)
    job = PoseAnalysisJob(
        user_id=owner_uuid,
        video_id=video_id,
        status=POSE_JOB_STATUS_PENDING,
    )
    db.add(job)
    video_record = _get_video_record(db, video_id)
    if video_record:
        video_record.pose_status = POSE_JOB_STATUS_PENDING
        video_record.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    background_tasks.add_task(_run_pose_job, str(job.id))
    return job


def _run_pose_pipeline_for_record(
    *,
    db: Session,
    video_record: Video,
    work_id: str,
) -> dict[str, Any]:
    if not video_record.source_bucket or not video_record.source_key:
        raise ValueError("Video source object is missing")

    temp_dir = _create_temp_workspace(prefix=f"pose-{work_id}")
    try:
        video_record.pose_status = POSE_JOB_STATUS_RUNNING
        db.commit()

        raw_filename = video_record.original_filename or f"{video_record.id}.mp4"
        local_video_path = storage_service.provider.download_to_temp(
            bucket=video_record.source_bucket,
            key=video_record.source_key,
            temp_dir=temp_dir,
            filename=raw_filename,
        )

        derived_dir = str(Path(temp_dir) / "derived")
        analysis_result = pose_analysis_service.analyze_pose(
            video_path=local_video_path,
            video_id=video_record.id,
            output_dir=derived_dir,
        )
        overlay_path = pose_analysis_service.generate_pose_overlay(
            video_path=local_video_path,
            video_id=video_record.id,
            pose_data=analysis_result,
            output_dir=derived_dir,
        )

        pose_data_path = analysis_result.get("pose_data_path")
        if not pose_data_path:
            raise ValueError("Pose analysis output missing pose_data_path")

        owner_id = str(video_record.user_id)
        pose_key = video_service.build_pose_data_key(
            user_id=owner_id,
            video_id=video_record.id,
            version=work_id,
        )
        overlay_key = video_service.build_overlay_key(
            user_id=owner_id,
            video_id=video_record.id,
            version=work_id,
        )
        target_bucket = video_record.source_bucket or storage_service.default_bucket

        _upload_path_to_storage(
            bucket=target_bucket,
            key=pose_key,
            local_path=pose_data_path,
            content_type="application/json",
            cache_control=DERIVED_OBJECT_CACHE_CONTROL,
        )
        _upload_path_to_storage(
            bucket=target_bucket,
            key=overlay_key,
            local_path=overlay_path,
            content_type="video/mp4",
            cache_control=DERIVED_OBJECT_CACHE_CONTROL,
        )

        video_record.pose_data_bucket = target_bucket
        video_record.pose_data_key = pose_key
        video_record.overlay_bucket = target_bucket
        video_record.overlay_key = overlay_key
        video_record.pose_status = POSE_JOB_STATUS_COMPLETED
        video_record.updated_at = datetime.utcnow()
        db.commit()

        analysis_result["pose_data_path"] = video_service.make_storage_uri(
            bucket=target_bucket,
            key=pose_key,
        )
        return analysis_result
    except Exception:
        video_record.pose_status = POSE_JOB_STATUS_FAILED
        db.commit()
        raise
    finally:
        _cleanup_temp_workspace(temp_dir)


def is_allowed_video_upload(file: UploadFile) -> bool:
    return _is_allowed_video_metadata(content_type=file.content_type, filename=file.filename)


def _extract_file_extension(filename: Optional[str]) -> str:
    normalized = (filename or "").lower().strip()
    if "." not in normalized:
        return ""
    return normalized[normalized.rfind("."):]


def _is_allowed_video_metadata(*, content_type: Optional[str], filename: Optional[str]) -> bool:
    extension = _extract_file_extension(filename)
    return (content_type in ALLOWED_VIDEO_TYPES) or (extension in ALLOWED_VIDEO_EXTENSIONS)


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


def _normalize_optional_session_id(raw_session_id: Optional[str]) -> Optional[str]:
    if raw_session_id is None:
        return None
    value = raw_session_id.strip()
    return value or None


def _resolve_video_chat_session(
    db: Session,
    *,
    user_id: UUID,
    video_id: str,
    preferred_session_id: Optional[str] = None,
) -> Optional[ChatSession]:
    if preferred_session_id:
        try:
            preferred_uuid = UUID(preferred_session_id)
        except ValueError:
            preferred_uuid = None
        if preferred_uuid:
            preferred_session = (
                db.query(ChatSession)
                .filter(
                    ChatSession.id == preferred_uuid,
                    ChatSession.user_id == user_id,
                    ChatSession.video_id == video_id,
                    ChatSession.session_type == CHAT_SESSION_TYPE_VIDEO,
                    ChatSession.is_archived.is_(False),
                )
                .first()
            )
            if preferred_session:
                return preferred_session

    return (
        db.query(ChatSession)
        .filter(
            ChatSession.user_id == user_id,
            ChatSession.video_id == video_id,
            ChatSession.session_type == CHAT_SESSION_TYPE_VIDEO,
            ChatSession.is_archived.is_(False),
        )
        .order_by(ChatSession.updated_at.desc())
        .first()
    )


def _append_analysis_completion_notice(
    db: Session,
    *,
    user_id: UUID,
    video_id: str,
    preferred_session_id: Optional[str] = None,
) -> bool:
    session = _resolve_video_chat_session(
        db,
        user_id=user_id,
        video_id=video_id,
        preferred_session_id=preferred_session_id,
    )
    if not session:
        return False

    existing_notice = (
        db.query(ChatMessage.id)
        .filter(
            ChatMessage.session_id == session.id,
            ChatMessage.role == "assistant",
            ChatMessage.content == ANALYSIS_COMPLETION_NOTICE,
        )
        .first()
    )
    if existing_notice:
        return False

    now = datetime.utcnow()
    db.add(
        ChatMessage(
            session_id=session.id,
            user_id=user_id,
            role="assistant",
            content=ANALYSIS_COMPLETION_NOTICE,
        )
    )
    session.last_message_at = now
    session.updated_at = now
    return True


def _run_pose_job(job_id: str) -> None:
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

        video_record = _get_video_record(db, job.video_id)
        if video_record and video_record.source_bucket and video_record.source_key:
            result = _run_pose_pipeline_for_record(
                db=db,
                video_record=video_record,
                work_id=str(job.id),
            )
        else:
            video_path = video_service.get_video_path(job.video_id)
            if not video_path:
                raise ValueError("Video not found. Please upload the video first.")
            result = pose_analysis_service.analyze_pose(
                video_path,
                job.video_id,
            )
            pose_analysis_service.generate_pose_overlay(
                video_path=video_path,
                video_id=job.video_id,
                pose_data=result,
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
        video_record = _get_video_record(db, job.video_id)
        if video_record:
            video_record.pose_status = POSE_JOB_STATUS_COMPLETED
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
            video_record = _get_video_record(db, job.video_id)
            if video_record:
                video_record.pose_status = POSE_JOB_STATUS_FAILED
            db.commit()
    finally:
        db.close()


async def _run_report_job(job_id: str, preferred_chat_session_id: Optional[str] = None) -> None:
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
        video_record = _get_video_record(db, job.video_id)
        if video_record:
            video_record.report_status = REPORT_JOB_STATUS_RUNNING
        db.commit()
        db.refresh(job)
        logger.info("report_job_started job_id=%s video_id=%s", str(job.id), job.video_id)

        pose_data = pose_analysis_service.get_pose_data(job.video_id, db=db)
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
        if video_record:
            video_record.report_status = REPORT_JOB_STATUS_COMPLETED
        _append_analysis_completion_notice(
            db,
            user_id=job.user_id,
            video_id=job.video_id,
            preferred_session_id=preferred_chat_session_id,
        )
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
            video_record = _get_video_record(db, job.video_id)
            if video_record:
                video_record.report_status = REPORT_JOB_STATUS_FAILED
            db.commit()
    finally:
        db.close()


def _validate_weapon(raw_weapon: str) -> str:
    valid_weapons = {"foil", "epee", "sabre"}
    weapon = (raw_weapon or "epee").lower()
    return weapon if weapon in valid_weapons else "epee"


def _validate_match_result(raw_result: str) -> str:
    valid = {"win", "loss", "draw"}
    result = (raw_result or "").lower()
    return result if result in valid else ""


def _create_video_row(
    *,
    db: Session,
    current_user: User,
    video_id: str,
    filename: str,
    content_type: Optional[str],
    file_size: Optional[int],
    title: Optional[str],
    athlete: Optional[str],
    opponent: Optional[str],
    weapon: Optional[str],
    match_result: Optional[str],
    score: Optional[str],
    tournament: Optional[str],
    notes: Optional[str],
    source_bucket: str,
    source_key: str,
    upload_status: str,
) -> Video:
    existing = _get_video_record(db, video_id)
    normalized_weapon = _validate_weapon(weapon or "epee")
    normalized_result = _validate_match_result(match_result or "")
    if existing:
        if str(existing.user_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Video ID collision with another user")
        existing.title = title or existing.title
        existing.athlete = athlete if athlete is not None else existing.athlete
        existing.opponent = opponent if opponent is not None else existing.opponent
        existing.weapon = normalized_weapon
        existing.match_result = normalized_result
        existing.score = score if score is not None else existing.score
        existing.tournament = tournament if tournament is not None else existing.tournament
        existing.notes = notes if notes is not None else existing.notes
        existing.original_filename = filename or existing.original_filename
        existing.content_type = content_type or existing.content_type
        existing.file_size = file_size if file_size is not None else existing.file_size
        existing.source_bucket = source_bucket
        existing.source_key = source_key
        existing.upload_status = upload_status
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    record = Video(
        id=video_id,
        user_id=current_user.id,
        title=title or filename,
        athlete=athlete or "",
        opponent=opponent or "",
        weapon=normalized_weapon,
        match_result=normalized_result,
        score=score or "",
        tournament=tournament or "",
        notes=notes or "",
        original_filename=filename,
        content_type=content_type,
        file_size=file_size,
        source_bucket=source_bucket,
        source_key=source_key,
        upload_status=upload_status,
        pose_status=POSE_JOB_STATUS_PENDING,
        report_status=REPORT_JOB_STATUS_PENDING,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/uploads/initiate", response_model=UploadInitiateResponse)
async def initiate_video_upload(
    payload: UploadInitiateRequest,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    if storage_service.provider_name != "cos":
        raise HTTPException(status_code=400, detail="Direct upload initiate is only enabled when STORAGE_PROVIDER=cos")
    if not payload.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    if not _is_allowed_video_metadata(content_type=payload.content_type, filename=payload.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: MP4, MOV, AVI, WebM")
    if payload.file_size and payload.file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    video_id = video_service.new_video_id()
    bucket = storage_service.default_bucket
    object_key = video_service.build_source_key(
        user_id=str(current_user.id),
        video_id=video_id,
        original_filename=payload.filename,
    )

    _create_video_row(
        db=db,
        current_user=current_user,
        video_id=video_id,
        filename=payload.filename,
        content_type=payload.content_type,
        file_size=payload.file_size,
        title=payload.title,
        athlete=payload.athlete,
        opponent=payload.opponent,
        weapon=payload.weapon,
        match_result=payload.match_result,
        score=payload.score,
        tournament=payload.tournament,
        notes=payload.notes,
        source_bucket=bucket,
        source_key=object_key,
        upload_status=UPLOAD_STATUS_INITIATED,
    )

    upload_url = storage_service.provider.generate_presigned_put_url(
        bucket=bucket,
        key=object_key,
        expires_seconds=storage_service.upload_url_expire_seconds,
        content_type=payload.content_type,
    )
    headers: dict[str, str] = {}
    if payload.content_type:
        headers["Content-Type"] = payload.content_type

    return UploadInitiateResponse(
        video_id=video_id,
        bucket=bucket,
        object_key=object_key,
        upload_url=upload_url,
        expires_in=storage_service.upload_url_expire_seconds,
        headers=headers,
        message="Upload initiated",
    )


@router.post("/uploads/complete", response_model=UploadCompleteResponse)
async def complete_video_upload(
    payload: UploadCompleteRequest,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    if storage_service.provider_name != "cos":
        raise HTTPException(status_code=400, detail="Upload complete endpoint is only enabled when STORAGE_PROVIDER=cos")
    video_record = _get_video_record(db, payload.video_id)
    if not video_record:
        raise HTTPException(status_code=404, detail="Video record not found")
    _assert_video_access(str(video_record.user_id), current_user)
    if not video_record.source_bucket or not video_record.source_key:
        raise HTTPException(status_code=400, detail="Invalid video source key")

    if not _object_exists(
        bucket=video_record.source_bucket,
        key=video_record.source_key,
    ):
        raise HTTPException(status_code=400, detail="Uploaded object not found in storage")

    try:
        object_head = storage_service.provider.head_object(
            bucket=video_record.source_bucket,
            key=video_record.source_key,
        )
    except Exception as exc:
        if _is_storage_not_found_error(exc):
            raise HTTPException(status_code=400, detail="Uploaded object not found in storage") from exc
        logger.exception(
            "storage_head_failed bucket=%s key=%s error=%s",
            video_record.source_bucket,
            video_record.source_key,
            str(exc),
        )
        raise HTTPException(
            status_code=503,
            detail="Storage service unavailable. Please retry later.",
        ) from exc
    content_length_raw = object_head.get("Content-Length")
    try:
        actual_size = int(str(content_length_raw)) if content_length_raw is not None else None
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Unable to verify uploaded file size") from exc
    if actual_size is None:
        raise HTTPException(status_code=400, detail="Unable to verify uploaded file size")
    if actual_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB")

    expected_size = payload.file_size if payload.file_size is not None else video_record.file_size
    if expected_size is not None and expected_size != actual_size:
        raise HTTPException(status_code=400, detail="Uploaded file size mismatch")

    resolved_content_type = (
        str(object_head.get("Content-Type") or "").strip()
        or payload.content_type
        or video_record.content_type
    )
    if not _is_allowed_video_metadata(
        content_type=resolved_content_type,
        filename=video_record.original_filename,
    ):
        raise HTTPException(status_code=400, detail="Invalid uploaded file type")

    video_record.file_size = actual_size
    if resolved_content_type:
        video_record.content_type = resolved_content_type
    video_record.upload_status = UPLOAD_STATUS_UPLOADED
    video_record.updated_at = datetime.utcnow()
    db.commit()

    return UploadCompleteResponse(
        success=True,
        video_id=payload.video_id,
        message="Upload completed",
    )


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    if not is_allowed_video_upload(file):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: MP4, MOV, AVI, WebM")

    if storage_service.provider_name != "cos":
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
        try:
            video_id, filename, file_path = await video_service.save_video(file, metadata=metadata, max_size=MAX_FILE_SIZE)
        except ValueError as exc:
            raise HTTPException(status_code=413, detail=str(exc))
        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB")

    video_id = video_service.new_video_id()
    filename = file.filename or f"{video_id}.mp4"
    bucket = storage_service.default_bucket
    source_key = video_service.build_source_key(
        user_id=str(current_user.id),
        video_id=video_id,
        original_filename=filename,
    )
    storage_service.provider.put_object(
        bucket=bucket,
        key=source_key,
        data=content,
        content_type=file.content_type,
    )
    video_record = _create_video_row(
        db=db,
        current_user=current_user,
        video_id=video_id,
        filename=filename,
        content_type=file.content_type,
        file_size=len(content),
        title=filename,
        athlete="",
        opponent="",
        weapon="epee",
        match_result="",
        score="",
        tournament="",
        notes="",
        source_bucket=bucket,
        source_key=source_key,
        upload_status=UPLOAD_STATUS_UPLOADED,
    )

    return VideoUploadResponse(
        video_id=video_record.id,
        filename=video_record.original_filename or filename,
        file_path=video_service.make_storage_uri(bucket=bucket, key=source_key),
        message="Video uploaded successfully",
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
    db: Session = Depends(get_db),
):
    if not is_allowed_video_upload(file):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: MP4, MOV, AVI, WebM")

    normalized_weapon = _validate_weapon(weapon)
    normalized_result = _validate_match_result(match_result)

    if storage_service.provider_name != "cos":
        legacy_metadata = {
            "title": title or file.filename,
            "athlete": athlete,
            "opponent": opponent,
            "weapon": normalized_weapon,
            "match_result": normalized_result,
            "score": score,
            "tournament": tournament,
            "user_id": str(current_user.id),
        }
        try:
            video_id, filename, file_path = await video_service.save_video(file, legacy_metadata, max_size=MAX_FILE_SIZE)
        except ValueError as exc:
            raise HTTPException(status_code=413, detail=str(exc))
        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully with metadata",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB")

    video_id = video_service.new_video_id()
    filename = file.filename or f"{video_id}.mp4"
    bucket = storage_service.default_bucket
    source_key = video_service.build_source_key(
        user_id=str(current_user.id),
        video_id=video_id,
        original_filename=filename,
    )
    storage_service.provider.put_object(
        bucket=bucket,
        key=source_key,
        data=content,
        content_type=file.content_type,
    )

    video_record = _create_video_row(
        db=db,
        current_user=current_user,
        video_id=video_id,
        filename=filename,
        content_type=file.content_type,
        file_size=len(content),
        title=title or filename,
        athlete=athlete,
        opponent=opponent,
        weapon=normalized_weapon,
        match_result=normalized_result,
        score=score,
        tournament=tournament,
        notes="",
        source_bucket=bucket,
        source_key=source_key,
        upload_status=UPLOAD_STATUS_UPLOADED,
    )

    return VideoUploadResponse(
        video_id=video_record.id,
        filename=video_record.original_filename or filename,
        file_path=video_service.make_storage_uri(bucket=bucket, key=source_key),
        message="Video uploaded successfully with metadata",
    )


@router.get("/list", response_model=VideoListResponse)
async def list_videos(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    try:
        db_videos = (
            db.query(Video)
            .filter(
                Video.user_id == current_user.id,
                Video.upload_status == UPLOAD_STATUS_UPLOADED,
            )
            .order_by(Video.created_at.desc())
            .all()
        )
        merged: list[dict] = [_serialize_video(item) for item in db_videos]
        seen_ids = {item["video_id"] for item in merged}

        # Legacy fallback during migration period.
        legacy = video_service.list_videos(user_id=str(current_user.id))
        for item in legacy:
            raw_id = item.get("video_id")
            if raw_id and raw_id in seen_ids:
                continue
            legacy_status = str(item.get("upload_status") or "").strip().lower()
            if legacy_status and legacy_status != UPLOAD_STATUS_UPLOADED:
                continue
            merged.append(item)

        merged.sort(key=lambda item: item.get("upload_time", "") or "", reverse=True)
        return VideoListResponse(videos=merged, total=len(merged))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list videos: {str(exc)}")


@router.get("/{video_id}")
async def get_video(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user, db=db)
    return metadata


@router.get("/{video_id}/file")
async def get_video_file(
    video_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    if storage_service.provider_name == "cos" and metadata.get("source_bucket") and metadata.get("source_key"):
        source_bucket = str(metadata["source_bucket"])
        source_key = str(metadata["source_key"])
        if _object_exists(bucket=source_bucket, key=source_key):
            signed_url = _build_signed_url(
                bucket=source_bucket,
                key=source_key,
            )
            return RedirectResponse(url=signed_url, status_code=302)

    video_path = metadata.get("file_path")
    if isinstance(video_path, str) and (video_path.startswith("cos://") or video_path.startswith("local://")):
        video_path = None
    video_path = video_path or video_service.get_video_path(video_id)
    if not video_path:
        raise HTTPException(status_code=404, detail="Video file not found")
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
    db: Session = Depends(get_db),
):
    valid_weapons = ["foil", "epee", "sabre"]
    if request.weapon.lower() not in valid_weapons:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid weapon. Must be one of: {', '.join(valid_weapons)}",
        )
    if request.depth < 1 or request.depth > 5:
        raise HTTPException(status_code=400, detail="Depth must be between 1 and 5")

    metadata = ensure_video_access(request.video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    temp_dir: Optional[str] = None
    try:
        if metadata.get("source_bucket") and metadata.get("source_key"):
            temp_dir = _create_temp_workspace(prefix=f"analyze-{request.video_id}")
            video_path = storage_service.provider.download_to_temp(
                bucket=str(metadata["source_bucket"]),
                key=str(metadata["source_key"]),
                temp_dir=temp_dir,
                filename=metadata.get("original_filename") or f"{request.video_id}.mp4",
            )
        else:
            video_path = video_service.get_video_path(request.video_id)
        if not video_path:
            raise HTTPException(status_code=404, detail="Video not found. Please upload the video first.")

        analysis = await video_service.analyze_video(
            video_path=video_path,
            weapon=request.weapon,
            depth=request.depth,
        )
        return VideoAnalyzeResponse(
            video_id=request.video_id,
            analysis=analysis,
            weapon=request.weapon,
            depth=request.depth,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to analyze video: {str(exc)}")
    finally:
        _cleanup_temp_workspace(temp_dir)


# Pose Analysis Endpoints
@router.post("/analyze/pose", response_model=PoseAnalyzeResponse)
async def analyze_pose(
    request: PoseAnalyzeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Analyze human pose in a video using MediaPipe.

    Args:
        video_id: ID of the video to analyze
        sample_interval: Deprecated. Backend always processes every frame for quality.
    """
    metadata = ensure_video_access(request.video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    try:
        video_record = _get_video_record(db, request.video_id)
        if video_record and video_record.source_bucket and video_record.source_key:
            result = _run_pose_pipeline_for_record(
                db=db,
                video_record=video_record,
                work_id=f"sync-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
            )
        else:
            video_path = video_service.get_video_path(request.video_id)
            if not video_path:
                raise HTTPException(
                    status_code=404,
                    detail="Video not found. Please upload the video first."
                )
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
    except HTTPException:
        raise
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
    metadata = ensure_video_access(video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    owner_id = str(metadata.get("user_id") or current_user.id)
    job = _queue_pose_analysis_job(
        db=db,
        video_id=video_id,
        owner_id=owner_id,
        background_tasks=background_tasks,
    )

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
    ensure_video_access(video_id, current_user, db=db)
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
    request: Request,
    athlete_slot: Optional[AthleteSlot] = Query(default=None),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user, db=db)
    requested_slot = athlete_slot.value if athlete_slot else "auto"
    report_etag = f'W/"report:{video_id}:{requested_slot}:{metadata.get("updated_at") or ""}"'
    report_headers = {
        "Cache-Control": "private, max-age=120",
        "ETag": report_etag,
        "Vary": "Authorization",
    }
    if request.headers.get("if-none-match") == report_etag:
        return Response(status_code=304, headers=report_headers)

    pose_data = pose_analysis_service.get_pose_data(video_id, db=db)
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

    payload = AnalysisReportResponse(
        **analysis_report_service.serialize_report(report, athlete_slot=resolved_slot)
    )
    return JSONResponse(content=jsonable_encoder(payload), headers=report_headers)


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
    metadata = ensure_video_access(video_id, current_user, db=db)

    # Get pose data
    pose_data = pose_analysis_service.get_pose_data(video_id, db=db)
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
        video_record = _get_video_record(db, video_id)
        if video_record:
            video_record.report_status = REPORT_JOB_STATUS_COMPLETED
            db.commit()
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
        video_record = _get_video_record(db, video_id)
        if video_record:
            video_record.report_status = REPORT_JOB_STATUS_FAILED
            db.commit()
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
    chat_session_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    metadata = ensure_video_access(video_id, current_user, db=db)
    pose_data = pose_analysis_service.get_pose_data(video_id, db=db)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first.",
        )

    owner_id = metadata.get("user_id") or str(current_user.id)
    owner_uuid = analysis_report_service._parse_user_id(owner_id)
    requested_slot = _normalize_requested_slot(athlete_slot)
    preferred_chat_session_id = _normalize_optional_session_id(chat_session_id)
    if preferred_chat_session_id:
        try:
            preferred_chat_session_uuid = UUID(preferred_chat_session_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="Invalid chat_session_id",
            ) from exc
        session = _resolve_video_chat_session(
            db,
            user_id=owner_uuid,
            video_id=video_id,
            preferred_session_id=preferred_chat_session_id,
        )
        if not session or session.id != preferred_chat_session_uuid:
            raise HTTPException(
                status_code=404,
                detail="Chat session not found for this video",
            )

    job = AnalysisReportJob(
        user_id=owner_uuid,
        video_id=video_id,
        requested_slot=requested_slot,
        force_regenerate=bool(force_regenerate),
        status=REPORT_JOB_STATUS_PENDING,
    )
    db.add(job)
    video_record = _get_video_record(db, video_id)
    if video_record:
        video_record.report_status = REPORT_JOB_STATUS_PENDING
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_report_job, str(job.id), preferred_chat_session_id)

    response_slot = AthleteSlot(requested_slot) if requested_slot in {"left", "right"} else None
    return AnalysisReportJobCreateResponse(
        job_id=str(job.id),
        video_id=video_id,
        athlete_slot=response_slot,
        status=job.status,
        created_at=job.created_at,
    )


@router.get(
    "/{video_id}/analyze/pose/report/jobs/latest",
    response_model=AnalysisReportJobStatusResponse,
)
async def get_latest_pose_report_job(
    video_id: str,
    athlete_slot: Optional[AthleteSlot] = Query(default=None),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ensure_video_access(video_id, current_user, db=db)

    query = db.query(AnalysisReportJob).filter(AnalysisReportJob.video_id == video_id)
    if athlete_slot is not None:
        query = query.filter(
            or_(
                AnalysisReportJob.requested_slot == athlete_slot.value,
                AnalysisReportJob.requested_slot.is_(None),
            )
        )
    if not current_user.is_admin:
        query = query.filter(AnalysisReportJob.user_id == current_user.id)

    running_job = (
        query.filter(AnalysisReportJob.status.in_([REPORT_JOB_STATUS_PENDING, REPORT_JOB_STATUS_RUNNING]))
        .order_by(AnalysisReportJob.created_at.desc())
        .first()
    )
    job = running_job or query.order_by(AnalysisReportJob.created_at.desc()).first()
    if not job:
        raise HTTPException(status_code=404, detail="Report job not found")

    results = _decode_job_results(job)
    return _serialize_report_job(job, results)


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
    ensure_video_access(video_id, current_user, db=db)
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
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Return cached pose overlay url/path when available.
    If not available, enqueue async pose job and return 202.
    """
    metadata = ensure_video_access(video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    if storage_service.provider_name == "cos" and metadata.get("overlay_bucket") and metadata.get("overlay_key"):
        overlay_bucket = str(metadata["overlay_bucket"])
        overlay_key = str(metadata["overlay_key"])
        if _object_exists(bucket=overlay_bucket, key=overlay_key):
            signed_url = _build_signed_url(
                bucket=overlay_bucket,
                key=overlay_key,
            )
            return PoseOverlayResponse(
                video_id=video_id,
                overlay_video_path=signed_url,
                message="Pose overlay video (cached)",
                status=POSE_JOB_STATUS_COMPLETED,
            )
    else:
        overlay_path = pose_analysis_service.get_overlay_path(video_id)
        if overlay_path:
            return PoseOverlayResponse(
                video_id=video_id,
                overlay_video_path=overlay_path,
                message="Pose overlay video (cached)",
                status=POSE_JOB_STATUS_COMPLETED,
            )

    owner_id = metadata.get("user_id")
    if not owner_id and current_user:
        owner_id = str(current_user.id)
    if not owner_id:
        raise HTTPException(status_code=500, detail="Unable to resolve video owner for pose job")

    job = _queue_pose_analysis_job(
        db=db,
        video_id=video_id,
        owner_id=str(owner_id),
        background_tasks=background_tasks,
    )
    payload = PoseOverlayResponse(
        video_id=video_id,
        overlay_video_path=None,
        message="Pose overlay is not ready. Pose analysis job is queued.",
        status=job.status,
        job_id=str(job.id),
    )
    return JSONResponse(status_code=202, content=payload.model_dump())


@router.get("/{video_id}/pose-overlay/file")
async def get_pose_overlay_file(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Serve cached pose overlay for playback.
    If overlay is missing, enqueue async pose job and return 409.
    """
    metadata = ensure_video_access(video_id, current_user, db=db)
    _ensure_video_uploaded(metadata)
    if storage_service.provider_name == "cos" and metadata.get("overlay_bucket") and metadata.get("overlay_key"):
        overlay_bucket = str(metadata["overlay_bucket"])
        overlay_key = str(metadata["overlay_key"])
        if _object_exists(bucket=overlay_bucket, key=overlay_key):
            signed_url = _build_signed_url(
                bucket=overlay_bucket,
                key=overlay_key,
            )
            return RedirectResponse(url=signed_url, status_code=302)
    else:
        overlay_path = pose_analysis_service.get_overlay_path(video_id)
        if overlay_path:
            media_type, _ = mimetypes.guess_type(overlay_path)
            return FileResponse(
                overlay_path,
                media_type=media_type or "video/mp4",
                headers={"Accept-Ranges": "bytes"},
            )

    owner_id = metadata.get("user_id")
    if not owner_id and current_user:
        owner_id = str(current_user.id)
    if not owner_id:
        raise HTTPException(status_code=500, detail="Unable to resolve video owner for pose job")

    job = _queue_pose_analysis_job(
        db=db,
        video_id=video_id,
        owner_id=str(owner_id),
        background_tasks=background_tasks,
    )
    raise HTTPException(
        status_code=409,
        detail={
            "message": "Pose overlay is generating. Retry playback shortly.",
            "job_id": str(job.id),
            "status": job.status,
        },
    )


@router.get("/{video_id}/pose-data")
async def get_pose_data(
    video_id: str,
    request: Request,
    max_frames: Optional[int] = Query(default=None, ge=1, le=2000),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Get pose analysis data for a video.

    Returns the detected pose landmarks for each processed frame.
    """
    metadata = ensure_video_access(video_id, current_user, db=db)
    pose_etag = f'W/"pose:{video_id}:{max_frames or "full"}:{metadata.get("updated_at") or ""}"'
    pose_headers = {
        "Cache-Control": "private, max-age=300",
        "ETag": pose_etag,
        "Vary": "Authorization",
    }
    if request.headers.get("if-none-match") == pose_etag:
        return Response(status_code=304, headers=pose_headers)

    pose_data = pose_analysis_service.get_pose_data(video_id, db=db)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    payload: dict[str, Any] = pose_data
    sequence = pose_data.get("pose_sequence")
    if isinstance(sequence, list) and max_frames and len(sequence) > max_frames:
        sampled_sequence = _sample_pose_sequence_evenly(sequence, max_frames)
        payload = {**pose_data, "pose_sequence": sampled_sequence}
        processing = dict(payload.get("processing") or {})
        processing["sampled_frames"] = len(sampled_sequence)
        processing["original_frames"] = len(sequence)
        payload["processing"] = processing

    return JSONResponse(content=jsonable_encoder(payload), headers=pose_headers)
