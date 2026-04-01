from sqlalchemy import Column, String, Boolean, DateTime
import uuid
from datetime import datetime
from app.core.database import Base
from app.core.types import GUID


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    email_verified = Column(Boolean, default=False)
    verification_token = Column(String(64), nullable=True)
    verification_token_expires = Column(DateTime, nullable=True)
    reset_token = Column(String(64), nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
