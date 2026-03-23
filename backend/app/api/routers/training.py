from datetime import date, datetime, time
from typing import Optional
from uuid import UUID as PyUUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import verify_token
from app.core.database import get_db
from app.models import TrainingLog, User


router = APIRouter(prefix="/api/training", tags=["training"])
security = HTTPBearer()


class TrainingLogBasePayload(BaseModel):
    training_date: date
    start_time: Optional[str] = None  # HH:MM
    duration_minutes: int = Field(default=0, ge=0, le=720)
    training_content: str = Field(min_length=1, max_length=5000)
    rpe: int = Field(ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=5000)


class TrainingLogCreateRequest(TrainingLogBasePayload):
    pass


class TrainingLogUpdateRequest(TrainingLogBasePayload):
    pass


class TrainingLogResponse(BaseModel):
    id: str
    training_date: str
    start_time: Optional[str] = None
    duration_minutes: int
    training_content: str
    rpe: int
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class TrainingLogListResponse(BaseModel):
    logs: list[TrainingLogResponse]
    total: int


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )
    return user


def _parse_start_time(start_time_value: Optional[str]) -> Optional[time]:
    if start_time_value is None or start_time_value == "":
        return None
    try:
        parsed = datetime.strptime(start_time_value, "%H:%M")
        return parsed.time().replace(second=0, microsecond=0)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must use HH:MM format",
        ) from exc


def _sanitize_training_content(training_content: str) -> str:
    value = training_content.strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="training_content cannot be empty",
        )
    return value


def _sanitize_notes(notes: Optional[str]) -> Optional[str]:
    if notes is None:
        return None
    value = notes.strip()
    return value or None


def _serialize_log(training_log: TrainingLog) -> TrainingLogResponse:
    return TrainingLogResponse(
        id=str(training_log.id),
        training_date=training_log.training_date.isoformat(),
        start_time=training_log.start_time.strftime("%H:%M") if training_log.start_time else None,
        duration_minutes=training_log.duration_minutes,
        training_content=training_log.training_content,
        rpe=training_log.rpe,
        notes=training_log.notes,
        created_at=training_log.created_at.isoformat(),
        updated_at=training_log.updated_at.isoformat(),
    )


def _get_log_for_user(db: Session, current_user: User, log_id: PyUUID) -> TrainingLog:
    training_log = (
        db.query(TrainingLog)
        .filter(
            TrainingLog.id == log_id,
            TrainingLog.user_id == current_user.id,
        )
        .first()
    )
    if training_log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training log not found")
    return training_log


@router.get("/logs", response_model=TrainingLogListResponse)
def list_training_logs(
    training_date: Optional[date] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    limit: int = Query(default=120, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date",
        )

    query = db.query(TrainingLog).filter(TrainingLog.user_id == current_user.id)

    if training_date:
        query = query.filter(TrainingLog.training_date == training_date)
    else:
        if start_date:
            query = query.filter(TrainingLog.training_date >= start_date)
        if end_date:
            query = query.filter(TrainingLog.training_date <= end_date)

    logs = (
        query.order_by(TrainingLog.training_date.desc(), TrainingLog.start_time.desc(), TrainingLog.updated_at.desc())
        .limit(limit)
        .all()
    )
    return TrainingLogListResponse(logs=[_serialize_log(item) for item in logs], total=len(logs))


@router.get("/logs/{log_id}", response_model=TrainingLogResponse)
def get_training_log(
    log_id: PyUUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    training_log = _get_log_for_user(db, current_user, log_id)
    return _serialize_log(training_log)


@router.post("/logs", response_model=TrainingLogResponse, status_code=status.HTTP_201_CREATED)
def create_training_log(
    request: TrainingLogCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    training_log = TrainingLog(
        user_id=current_user.id,
        training_date=request.training_date,
        start_time=_parse_start_time(request.start_time),
        duration_minutes=request.duration_minutes,
        training_content=_sanitize_training_content(request.training_content),
        rpe=request.rpe,
        notes=_sanitize_notes(request.notes),
    )
    db.add(training_log)
    db.commit()
    db.refresh(training_log)
    return _serialize_log(training_log)


@router.put("/logs/{log_id}", response_model=TrainingLogResponse)
def update_training_log(
    log_id: PyUUID,
    request: TrainingLogUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    training_log = _get_log_for_user(db, current_user, log_id)
    training_log.training_date = request.training_date
    training_log.start_time = _parse_start_time(request.start_time)
    training_log.duration_minutes = request.duration_minutes
    training_log.training_content = _sanitize_training_content(request.training_content)
    training_log.rpe = request.rpe
    training_log.notes = _sanitize_notes(request.notes)
    training_log.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(training_log)
    return _serialize_log(training_log)


@router.delete("/logs/{log_id}")
def delete_training_log(
    log_id: PyUUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    training_log = _get_log_for_user(db, current_user, log_id)
    db.delete(training_log)
    db.commit()
    return {"message": "Training log deleted"}
