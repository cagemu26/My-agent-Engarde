from datetime import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text

from app.core.database import Base
from app.core.types import GUID


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_chat_sessions_user_updated", "user_id", "updated_at"),
        Index("ix_chat_sessions_user_video_updated", "user_id", "video_id", "updated_at"),
        Index("ix_chat_sessions_user_type_updated", "user_id", "session_type", "updated_at"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(String(64), nullable=True, index=True)
    session_type = Column(String(32), nullable=False, default="chat_qa", index=True)
    title = Column(String(255), nullable=True)
    context_summary = Column(Text, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    last_message_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
