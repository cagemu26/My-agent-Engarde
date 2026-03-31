from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import verify_token
from app.core.config import settings
from app.models import User, Feedback

router = APIRouter(prefix="/api/feedback", tags=["feedback"])
security = HTTPBearer()


# Pydantic schemas
class FeedbackCreate(BaseModel):
    category: str  # bug, feature, general
    title: str
    content: str
    user_email: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    user_email: Optional[str]
    category: str
    title: str
    content: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FeedbackUpdate(BaseModel):
    status: Optional[str] = None  # pending, reviewed, resolved


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, otherwise return None."""
    if not credentials:
        return None

    token = credentials.credentials
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


# User endpoints (submit feedback)
@router.post("", response_model=FeedbackResponse)
def create_feedback(
    request: FeedbackCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Submit user feedback."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to submit feedback",
        )

    feedback = Feedback(
        user_id=current_user.id,
        user_email=current_user.email,
        category=request.category,
        title=request.title,
        content=request.content,
        status="pending"
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return FeedbackResponse(
        id=str(feedback.id),
        user_email=feedback.user_email,
        category=feedback.category,
        title=feedback.title,
        content=feedback.content,
        status=feedback.status,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at
    )


# Admin endpoints (manage feedback)
def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated admin user."""
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
    require_verified = getattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    if require_verified and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email is not verified",
        )
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


@router.get("", response_model=List[FeedbackResponse])
def get_all_feedback(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    status_filter: Optional[str] = None
):
    """Get all feedback (admin only)."""
    query = db.query(Feedback).order_by(Feedback.created_at.desc())

    if status_filter:
        query = query.filter(Feedback.status == status_filter)

    feedbacks = query.all()
    return [
        FeedbackResponse(
            id=str(f.id),
            user_email=f.user_email,
            category=f.category,
            title=f.title,
            content=f.content,
            status=f.status,
            created_at=f.created_at,
            updated_at=f.updated_at
        )
        for f in feedbacks
    ]


@router.patch("/{feedback_id}", response_model=FeedbackResponse)
def update_feedback(
    feedback_id: str,
    request: FeedbackUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update feedback status (admin only)."""
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )

    if request.status:
        feedback.status = request.status
        feedback.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(feedback)

    return FeedbackResponse(
        id=str(feedback.id),
        user_email=feedback.user_email,
        category=feedback.category,
        title=feedback.title,
        content=feedback.content,
        status=feedback.status,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at
    )


@router.delete("/{feedback_id}")
def delete_feedback(
    feedback_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete feedback (admin only)."""
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )

    db.delete(feedback)
    db.commit()

    return {"message": "Feedback deleted successfully"}
