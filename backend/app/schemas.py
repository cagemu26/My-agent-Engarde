from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Optional
from datetime import datetime
from enum import Enum


class WeaponType(str, Enum):
    FOIL = "foil"
    EPEE = "epee"
    SABRE = "sabre"


class AthleteSlot(str, Enum):
    LEFT = "left"
    RIGHT = "right"


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
    messages: list[ChatMessage] = Field(default_factory=list)
    session_id: Optional[str] = None
    message: Optional[str] = None
    context: Optional[str] = None  # Optional video analysis context
    video_id: Optional[str] = None
    weapon: Optional[str] = None
    use_kb: bool = False
    kb_filters: Optional[KBFilter] = None


class ChatResponse(BaseModel):
    message: str
    session_id: Optional[str] = None
    sources: Optional[list[str]] = None
    citations: Optional[list[Citation]] = None
    retrieval_meta: Optional[RetrievalMeta] = None


class ChatSessionCreateRequest(BaseModel):
    video_id: Optional[str] = None
    session_type: str = "chat_qa"
    title: Optional[str] = None
    context_summary: Optional[str] = None
    force_new: bool = False


class ChatSessionAssistantNoteRequest(BaseModel):
    content: str = Field(min_length=1, max_length=6000)


class ChatSessionMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ChatSessionResponse(BaseModel):
    id: str
    video_id: Optional[str] = None
    session_type: str = "chat_qa"
    title: Optional[str] = None
    context_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: Optional[datetime] = None
    message_count: int = 0


class ChatSessionDetailResponse(ChatSessionResponse):
    messages: list[ChatSessionMessageResponse] = Field(default_factory=list)


class ChatSessionListResponse(BaseModel):
    sessions: list[ChatSessionResponse]
    total: int


class ChatSessionDeleteResponse(BaseModel):
    deleted_scope: str
    deleted_session_count: int
    deleted_message_count: int
    video_id: Optional[str] = None
    message: str


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


class PoseAthlete(BaseModel):
    """Pose data for a tracked athlete within a frame."""
    slot: AthleteSlot
    track_id: str
    landmarks: list[PoseLandmark]
    visibility: list[float] = Field(default_factory=list)
    confidence: Optional[float] = None
    center_x: Optional[float] = None
    center_y: Optional[float] = None
    present: bool = True


class PoseFrame(BaseModel):
    """Pose data for a single frame"""
    frame_index: int
    timestamp: float
    athletes: list[PoseAthlete] = Field(default_factory=list)


class PosePlayerSummary(BaseModel):
    """Summary coverage for each tracked athlete slot."""
    slot: AthleteSlot
    track_id: str
    coverage_frames: int
    coverage_ratio: float
    average_confidence: float
    display_name: Optional[str] = None


class PoseDetectorInfo(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    provider: str
    model: str
    num_poses: int
    model_asset: Optional[str] = None


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
    schema_version: int = 2
    detector_info: Optional[PoseDetectorInfo] = None
    video_properties: VideoProperties
    processing: ProcessingInfo
    players: list[PosePlayerSummary] = Field(default_factory=list)
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


class PoseAnalysisJobCreateResponse(BaseModel):
    job_id: str
    video_id: str
    status: str
    created_at: datetime


class PoseAnalysisJobStatusResponse(BaseModel):
    job_id: str
    video_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    result: Optional[PoseAnalyzeResponse] = None


class PoseOverlayResponse(BaseModel):
    """Response with path to pose overlay video"""
    video_id: str
    overlay_video_path: str
    message: str


class AnalysisReportResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    report_id: str
    video_id: str
    athlete_slot: Optional[AthleteSlot] = None
    report: str
    summary: str
    status: str
    model_name: str
    prompt_version: str
    created_at: datetime
    updated_at: datetime


class AnalysisReportGenerateResponse(AnalysisReportResponse):
    cached: bool = False


class AnalysisReportJobCreateResponse(BaseModel):
    job_id: str
    video_id: str
    athlete_slot: Optional[AthleteSlot] = None
    status: str
    created_at: datetime


class AnalysisReportJobStatusResponse(BaseModel):
    job_id: str
    video_id: str
    athlete_slot: Optional[AthleteSlot] = None
    status: str
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    results: list[AnalysisReportGenerateResponse] = Field(default_factory=list)
