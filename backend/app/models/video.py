from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.core.database import Base
from app.core.types import GUID


class Video(Base):
    __tablename__ = "videos"
    __table_args__ = (
        Index("ix_videos_user_created", "user_id", "created_at"),
        Index("ix_videos_upload_status_created", "upload_status", "created_at"),
        Index("ix_videos_pose_status_updated", "pose_status", "updated_at"),
        Index("ix_videos_report_status_updated", "report_status", "updated_at"),
    )

    id = Column(String(64), primary_key=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String(255), nullable=True)
    athlete = Column(String(255), nullable=True)
    opponent = Column(String(255), nullable=True)
    weapon = Column(String(32), nullable=True)
    match_result = Column(String(32), nullable=True)
    score = Column(String(64), nullable=True)
    tournament = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    original_filename = Column(String(255), nullable=True)
    content_type = Column(String(128), nullable=True)
    file_size = Column(Integer, nullable=True)

    source_bucket = Column(String(128), nullable=True)
    source_key = Column(String(1024), nullable=True)
    overlay_bucket = Column(String(128), nullable=True)
    overlay_key = Column(String(1024), nullable=True)
    pose_data_bucket = Column(String(128), nullable=True)
    pose_data_key = Column(String(1024), nullable=True)

    upload_status = Column(String(32), nullable=False, default="initiated")
    pose_status = Column(String(32), nullable=False, default="pending")
    report_status = Column(String(32), nullable=False, default="pending")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
