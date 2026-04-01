from datetime import datetime
import uuid

from sqlalchemy import Column, Date, DateTime, Index, Integer, Text, Time

from app.core.database import Base
from app.core.types import GUID


class TrainingLog(Base):
    __tablename__ = "training_logs"
    __table_args__ = (
        Index("ix_training_logs_user_date", "user_id", "training_date"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), nullable=False, index=True)
    training_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=0)
    training_content = Column(Text, nullable=False)
    rpe = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
