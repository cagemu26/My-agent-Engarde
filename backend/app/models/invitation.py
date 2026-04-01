from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base
from app.core.types import GUID


class InvitationCode(Base):
    __tablename__ = "invitation_codes"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    used_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
