from datetime import datetime, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from app.core.database import get_db
from app.core.auth import verify_token
from app.core.config import settings
from app.models import User, InvitationCode
from app.schemas import (
    KBIngestRequest,
    KBIngestResponse,
    KBSearchRequest,
    KBSearchResponse,
    Citation,
    RetrievalMeta,
)
from app.services.rag import rag_service
import secrets
import uuid

router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBearer()


# Pydantic schemas
class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime

    @field_validator('id', mode='before')
    @classmethod
    def parse_id(cls, v: Any) -> str:
        if isinstance(v, uuid.UUID):
            return str(v)
        return v

    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class InvitationResponse(BaseModel):
    id: str
    code: str
    used_by: Optional[str] = None
    used_at: Optional[datetime] = None
    expires_at: datetime
    is_active: bool

    @field_validator('id', 'used_by', mode='before')
    @classmethod
    def parse_uuid(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, uuid.UUID):
            return str(v)
        return str(v) if v else None

    class Config:
        from_attributes = True


class InvitationCreateRequest(BaseModel):
    count: int = 1
    days_valid: int = 30


class InvitationCreateResponse(BaseModel):
    invitations: List[dict]
    message: str


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


# User management endpoints
@router.get("/users", response_model=List[UserResponse])
def get_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get a specific user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    request: UserUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if request.email is not None:
        user.email = request.email
    if request.username is not None:
        user.username = request.username
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.is_admin is not None:
        # Prevent removing own admin status
        if user.id == current_admin.id and not request.is_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own admin status"
            )
        user.is_admin = request.is_admin

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/toggle", response_model=UserResponse)
def toggle_user(
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Toggle user active status (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent deactivating yourself
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


# Invitation code management endpoints
@router.get("/invitations", response_model=List[InvitationResponse])
def get_invitations(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all invitation codes (admin only)."""
    invitations = db.query(InvitationCode).order_by(InvitationCode.created_at.desc()).all()
    return invitations


@router.post("/invitations", response_model=InvitationCreateResponse)
def create_invitations(
    request: InvitationCreateRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create new invitation codes (admin only)."""
    invitations = []
    for _ in range(request.count):
        code = secrets.token_urlsafe(8)
        invitation = InvitationCode(
            code=code,
            expires_at=datetime.utcnow() + timedelta(days=request.days_valid),
            is_active=True
        )
        db.add(invitation)
        invitations.append({
            "code": code,
            "expires_at": (datetime.utcnow() + timedelta(days=request.days_valid)).isoformat()
        })

    db.commit()
    return InvitationCreateResponse(
        invitations=invitations,
        message=f"Created {request.count} invitation code(s)"
    )


@router.delete("/invitations/{invitation_id}")
def delete_invitation(
    invitation_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete an invitation code (admin only)."""
    invitation = db.query(InvitationCode).filter(InvitationCode.id == invitation_id).first()
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation code not found"
        )

    db.delete(invitation)
    db.commit()
    return {"message": "Invitation code deleted successfully"}


@router.post("/kb/ingest", response_model=KBIngestResponse)
async def ingest_knowledge_base(
    request: KBIngestRequest = Body(default_factory=KBIngestRequest),
    current_admin: User = Depends(get_current_admin),
):
    """Ingest knowledge documents into vector storage."""
    try:
        stats = await rag_service.ingest_knowledge(
            data_dir=request.path,
            reindex=request.reindex,
        )
        return KBIngestResponse(
            message="Knowledge base ingestion completed",
            stats=stats,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"KB ingest failed: {exc}",
        )


@router.post("/kb/reindex", response_model=KBIngestResponse)
async def reindex_knowledge_base(
    request: KBIngestRequest = Body(default_factory=KBIngestRequest),
    current_admin: User = Depends(get_current_admin),
):
    """Rebuild knowledge base index from source files."""
    try:
        stats = await rag_service.ingest_knowledge(
            data_dir=request.path,
            reindex=True,
        )
        return KBIngestResponse(
            message="Knowledge base reindex completed",
            stats=stats,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"KB reindex failed: {exc}",
        )


@router.post("/kb/search", response_model=KBSearchResponse)
async def search_knowledge_base(
    request: KBSearchRequest,
    current_admin: User = Depends(get_current_admin),
):
    """Run retrieval-only query against knowledge base."""
    filters = request.kb_filters.model_dump(exclude_none=True) if request.kb_filters else {}
    hits, retrieval_meta = await rag_service.search_knowledge(
        query=request.query,
        top_k=request.top_k,
        kb_filters=filters,
    )
    return KBSearchResponse(
        query=request.query,
        total=len(hits),
        hits=[Citation(**item) for item in hits],
        retrieval_meta=RetrievalMeta(**retrieval_meta),
    )
