from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"
    __table_args__ = (
        Index("ix_analysis_reports_user_video_created", "user_id", "video_id", "created_at"),
        UniqueConstraint(
            "user_id",
            "video_id",
            "report_type",
            "source_pose_hash",
            "model_name",
            "prompt_version",
            "report_version",
            name="uq_analysis_reports_version",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(String(64), nullable=False, index=True)
    report_type = Column(String(50), nullable=False, default="pose_analysis")
    status = Column(String(20), nullable=False, default="completed", index=True)
    report_version = Column(Integer, nullable=False, default=1)
    report_body_md = Column(Text, nullable=False)
    summary = Column(Text, nullable=False)
    model_name = Column(String(100), nullable=False)
    prompt_version = Column(String(50), nullable=False)
    source_pose_hash = Column(String(64), nullable=False, index=True)
    source_pose_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
