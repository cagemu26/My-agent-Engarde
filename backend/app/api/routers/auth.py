from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password
from app.core.auth import create_access_token, verify_token
from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit, get_client_ip
from app.models import User, InvitationCode

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


# Pydantic schemas
class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    invitation_code: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegisterResponse(BaseModel):
    success: bool
    message: str


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime


class InvitationVerifyResponse(BaseModel):
    valid: bool
    message: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user."""
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
    return user


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, http_request: Request, db: Session = Depends(get_db)):
    """Register a new user with an invitation code."""
    client_ip = get_client_ip(http_request)
    enforce_rate_limit(
        key=f"auth:register:ip:{client_ip}",
        limit=settings.AUTH_REGISTER_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_REGISTER_WINDOW_SECONDS,
    )

    # Verify invitation code
    invitation = db.query(InvitationCode).filter(
        InvitationCode.code == payload.invitation_code,
        InvitationCode.is_active == True
    ).first()

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation code"
        )

    if invitation.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation code has expired"
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Generate verification token
    from app.services.email import email_service
    verification_token = email_service.generate_verification_token()

    # Create new user (email not verified yet)
    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        is_active=True,
        email_verified=False,
        verification_token=verification_token,
        verification_token_expires=datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS),
    )
    db.add(user)
    db.flush()

    # Send verification email
    sent = email_service.send_verification_email(payload.email, verification_token)
    if not sent:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email, please try again"
        )

    # Mark invitation as used
    invitation.used_by = user.id
    invitation.used_at = datetime.utcnow()
    invitation.is_active = False
    db.commit()

    return RegisterResponse(
        success=True,
        message="Registration successful. Please verify your email before logging in."
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    """Login with email and password."""
    client_ip = get_client_ip(http_request)
    email_key = payload.email.lower()
    enforce_rate_limit(
        key=f"auth:login:ip:{client_ip}",
        limit=settings.AUTH_LOGIN_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_LOGIN_WINDOW_SECONDS,
    )
    enforce_rate_limit(
        key=f"auth:login:email:{email_key}",
        limit=settings.AUTH_LOGIN_EMAIL_RATE_LIMIT,
        window_seconds=settings.AUTH_LOGIN_WINDOW_SECONDS,
    )

    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Check if email is verified (optional, can be enforced in production)
    require_verified = getattr(settings, 'REQUIRE_EMAIL_VERIFICATION', False)
    if require_verified and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in"
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return AuthResponse(
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat()
        }
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        username=current_user.username,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at
    )


@router.get("/codes/verify/{code}", response_model=InvitationVerifyResponse)
def verify_invitation_code(code: str, db: Session = Depends(get_db)):
    """Verify if an invitation code is valid."""
    invitation = db.query(InvitationCode).filter(
        InvitationCode.code == code,
        InvitationCode.is_active == True
    ).first()

    if not invitation:
        return InvitationVerifyResponse(
            valid=False,
            message="Invalid invitation code"
        )

    if invitation.expires_at < datetime.utcnow():
        return InvitationVerifyResponse(
            valid=False,
            message="Invitation code has expired"
        )

    return InvitationVerifyResponse(
        valid=True,
        message="Invitation code is valid"
    )


# Email verification endpoints
class VerifyEmailResponse(BaseModel):
    success: bool
    message: str


class ResendVerificationResponse(BaseModel):
    success: bool
    message: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.get("/verify/{token}", response_model=VerifyEmailResponse)
def verify_email(token: str, http_request: Request, db: Session = Depends(get_db)):
    """Verify user's email with the token."""
    client_ip = get_client_ip(http_request)
    enforce_rate_limit(
        key=f"auth:verify:ip:{client_ip}",
        limit=settings.AUTH_VERIFY_EMAIL_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_VERIFY_EMAIL_WINDOW_SECONDS,
    )

    user = db.query(User).filter(User.verification_token == token).first()

    if not user:
        return VerifyEmailResponse(
            success=False,
            message="Invalid verification token"
        )

    if user.verification_token_expires and user.verification_token_expires < datetime.utcnow():
        user.verification_token = None
        user.verification_token_expires = None
        db.commit()
        return VerifyEmailResponse(
            success=False,
            message="Verification token has expired. Please request a new verification email."
        )

    if user.email_verified:
        return VerifyEmailResponse(
            success=True,
            message="Email already verified"
        )

    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()

    # Send welcome email
    from app.services.email import email_service
    email_service.send_welcome_email(user.email, user.username)

    return VerifyEmailResponse(
        success=True,
        message="Email verified successfully"
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
def resend_verification(
    payload: ResendVerificationRequest,
    http_request: Request,
    db: Session = Depends(get_db)
):
    """Resend verification email."""
    client_ip = get_client_ip(http_request)
    email_key = payload.email.lower()
    enforce_rate_limit(
        key=f"auth:resend-verification:ip:{client_ip}",
        limit=settings.AUTH_RESEND_VERIFICATION_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_RESEND_VERIFICATION_WINDOW_SECONDS,
    )
    enforce_rate_limit(
        key=f"auth:resend-verification:email:{email_key}",
        limit=settings.AUTH_RESEND_VERIFICATION_EMAIL_RATE_LIMIT,
        window_seconds=settings.AUTH_RESEND_VERIFICATION_WINDOW_SECONDS,
    )

    generic_message = "If your account exists and is not verified, we sent a verification email."
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return ResendVerificationResponse(success=True, message=generic_message)
    if user.email_verified:
        return ResendVerificationResponse(success=True, message=generic_message)

    # Generate new token
    from app.services.email import email_service
    token = email_service.generate_verification_token()
    user.verification_token = token
    user.verification_token_expires = datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS)

    sent = email_service.send_verification_email(user.email, token)
    if not sent:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email, please try again"
        )
    db.commit()

    return ResendVerificationResponse(
        success=True,
        message=generic_message
    )


# Password reset endpoints

class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetResponse(BaseModel):
    success: bool
    message: str


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str


@router.post("/password-reset", response_model=PasswordResetResponse)
def request_password_reset(payload: PasswordResetRequest, http_request: Request, db: Session = Depends(get_db)):
    """Request a password reset email."""
    client_ip = get_client_ip(http_request)
    email_key = payload.email.lower()
    enforce_rate_limit(
        key=f"auth:password-reset:ip:{client_ip}",
        limit=settings.AUTH_PASSWORD_RESET_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_PASSWORD_RESET_WINDOW_SECONDS,
    )
    enforce_rate_limit(
        key=f"auth:password-reset:email:{email_key}",
        limit=settings.AUTH_PASSWORD_RESET_EMAIL_RATE_LIMIT,
        window_seconds=settings.AUTH_PASSWORD_RESET_WINDOW_SECONDS,
    )

    user = db.query(User).filter(User.email == payload.email).first()

    # Always return success to prevent email enumeration
    if user:
        from app.services.email import email_service
        token = email_service.generate_verification_token()
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()

        # Send password reset email
        email_service.send_password_reset_email(payload.email, token)

    return PasswordResetResponse(
        success=True,
        message="If an account with that email exists, a password reset link has been sent"
    )


@router.post("/password-reset/confirm", response_model=PasswordResetResponse)
def confirm_password_reset(payload: PasswordResetConfirmRequest, http_request: Request, db: Session = Depends(get_db)):
    """Confirm password reset with new password."""
    client_ip = get_client_ip(http_request)
    enforce_rate_limit(
        key=f"auth:password-reset-confirm:ip:{client_ip}",
        limit=settings.AUTH_PASSWORD_RESET_CONFIRM_IP_RATE_LIMIT,
        window_seconds=settings.AUTH_PASSWORD_RESET_CONFIRM_WINDOW_SECONDS,
    )

    user = db.query(User).filter(User.reset_token == payload.token).first()

    if not user:
        return PasswordResetResponse(
            success=False,
            message="Invalid or expired reset token"
        )

    if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        return PasswordResetResponse(
            success=False,
            message="Reset token has expired"
        )

    # Update password
    user.password_hash = get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return PasswordResetResponse(
        success=True,
        message="Password reset successfully"
    )
