from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Optional
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


class KBFilter(BaseModel):
    weapon: Optional[str] = None
    topic: Optional[str] = None
    level: Optional[str] = None
    language: Optional[str] = None


class Citation(BaseModel):
    chunk_id: str
    doc_id: str
    title: str
    source: str
    snippet: str
    score: float


class RetrievalMeta(BaseModel):
    use_kb: bool = False
    provider: Optional[str] = None
    collection: Optional[str] = None
    hit_count: int = 0
    degraded: bool = False
    degrade_reason: Optional[str] = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: Optional[str] = None  # Optional video analysis context
    video_id: Optional[str] = None
    weapon: Optional[str] = None
    use_kb: bool = False
    kb_filters: Optional[KBFilter] = None


class ChatResponse(BaseModel):
    message: str
    sources: Optional[list[str]] = None
    citations: Optional[list[Citation]] = None
    retrieval_meta: Optional[RetrievalMeta] = None


class KBIngestRequest(BaseModel):
    path: Optional[str] = None
    reindex: bool = False


class KBIngestResponse(BaseModel):
    message: str
    stats: dict[str, Any]


class KBSearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=6, ge=1, le=20)
    kb_filters: Optional[KBFilter] = None


class KBSearchResponse(BaseModel):
    query: str
    total: int
    hits: list[Citation]
    retrieval_meta: RetrievalMeta


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
    sample_interval: Optional[int] = 1  # Deprecated, ignored by backend (fixed high-quality sampling)


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


class AnalysisReportResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    report_id: str
    video_id: str
    report: str
    summary: str
    status: str
    model_name: str
    prompt_version: str
    created_at: datetime
    updated_at: datetime


class AnalysisReportGenerateResponse(AnalysisReportResponse):
    cached: bool = False
