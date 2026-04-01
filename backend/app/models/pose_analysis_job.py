from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text

from app.core.database import Base
from app.core.types import GUID


class PoseAnalysisJob(Base):
    __tablename__ = "pose_analysis_jobs"
    __table_args__ = (
        Index("ix_pose_jobs_user_video_created", "user_id", "video_id", "created_at"),
        Index("ix_pose_jobs_status_updated", "status", "updated_at"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(String(64), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="pending", index=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
