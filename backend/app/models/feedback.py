from sqlalchemy import Column, String, Boolean, DateTime, Text
import uuid
from datetime import datetime
from app.core.database import Base
from app.core.types import GUID


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), nullable=True)  # Can be null for anonymous
    user_email = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False)  # bug, feature, general
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String(20), default="pending")  # pending, reviewed, resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
