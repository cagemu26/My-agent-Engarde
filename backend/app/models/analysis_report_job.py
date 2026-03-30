from datetime import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AnalysisReportJob(Base):
    __tablename__ = "analysis_report_jobs"
    __table_args__ = (
        Index("ix_report_jobs_user_video_created", "user_id", "video_id", "created_at"),
        Index("ix_report_jobs_status_updated", "status", "updated_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(String(64), nullable=False, index=True)
    requested_slot = Column(String(16), nullable=True)
    force_regenerate = Column(Boolean, nullable=False, default=False)
    status = Column(String(24), nullable=False, default="pending", index=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
