from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class WeaponType(str, Enum):
    FOIL = "foil"
    EPEE = "epee"
    SABRE = "sabre"


class MatchResult(str, Enum):
    WIN = "win"
    LOSS = "loss"
    DRAW = "draw"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: Optional[str] = None  # Optional video analysis context


class ChatResponse(BaseModel):
    message: str
    sources: Optional[list[str]] = None


# Video metadata schema
class VideoMetadata(BaseModel):
    title: Optional[str] = None
    athlete: Optional[str] = None
    opponent: Optional[str] = None
    weapon: WeaponType = WeaponType.EPEE
    match_result: Optional[MatchResult] = None
    score: Optional[str] = None
    tournament: Optional[str] = None
    notes: Optional[str] = None


# Video-related schemas
class VideoUploadResponse(BaseModel):
    video_id: str
    filename: str
    file_path: str
    message: str


class VideoUploadWithMetadataRequest(BaseModel):
    """Request body for uploading video with metadata"""
    metadata: VideoMetadata


class VideoAnalyzeRequest(BaseModel):
    video_id: str
    weapon: str  # foil, epee, sabre
    depth: Optional[int] = 3  # analysis depth level


class VideoAnalyzeResponse(BaseModel):
    video_id: str
    analysis: str
    weapon: str
    depth: int


class VideoListResponse(BaseModel):
    """Response for listing videos"""
    videos: list[dict]
    total: int


# Pose Analysis schemas
class PoseLandmark(BaseModel):
    """Single pose landmark point"""
    name: str
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


class PoseFrame(BaseModel):
    """Pose data for a single frame"""
    frame_index: int
    timestamp: float
    landmarks: list[PoseLandmark]


class VideoProperties(BaseModel):
    """Video file properties"""
    fps: int
    frame_count: int
    width: int
    height: int
    duration: float


class ProcessingInfo(BaseModel):
    """Processing metadata"""
    sample_interval: int
    processed_frames: int
    total_frames: int


class PoseAnalysisData(BaseModel):
    """Complete pose analysis result"""
    video_id: str
    video_path: str
    analysis_type: str
    timestamp: str
    video_properties: VideoProperties
    processing: ProcessingInfo
    pose_sequence: list[PoseFrame]
    pose_data_path: str


class PoseAnalyzeRequest(BaseModel):
    """Request to analyze pose in a video"""
    video_id: str
    sample_interval: Optional[int] = 5  # Process every N frames


class PoseAnalyzeResponse(BaseModel):
    """Response from pose analysis"""
    video_id: str
    message: str
    pose_data_path: str
    processed_frames: int
    total_frames: int


class PoseOverlayResponse(BaseModel):
    """Response with path to pose overlay video"""
    video_id: str
    overlay_video_path: str
    message: str


class FencingMetrics(BaseModel):
    """Fencing-specific metrics computed from pose data"""
    frame_count: int
    avg_visibility: float
    movement_metrics: dict
