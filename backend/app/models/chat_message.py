from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text

from app.core.database import Base
from app.core.types import GUID


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_chat_messages_user_created", "user_id", "created_at"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(GUID(), ForeignKey("chat_sessions.id"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    citations_json = Column(Text, nullable=True)
    retrieval_meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
