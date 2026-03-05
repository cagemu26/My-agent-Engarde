import json
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.schemas import (
    VideoUploadResponse,
    VideoUploadWithMetadataRequest,
    VideoAnalyzeRequest,
    VideoAnalyzeResponse,
    VideoListResponse,
    WeaponType,
    PoseAnalyzeRequest,
    PoseAnalyzeResponse,
    PoseOverlayResponse,
    FencingMetrics,
)
from app.services.video import video_service
from app.services.pose_analysis import pose_analysis_service
from app.services.llm import llm_service


router = APIRouter(tags=["video"])


ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file for analysis.

    Supported formats: mp4, mov, avi, webm
    Max file size: 100MB
    """
    # Validate file type
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_TYPES)}"
        )

    # Save the video (size check is done in video_service)
    try:
        video_id, filename, file_path = await video_service.save_video(file, max_size=MAX_FILE_SIZE)

        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload video: {str(e)}"
        )


@router.post("/upload-with-metadata", response_model=VideoUploadResponse)
async def upload_video_with_metadata(
    file: UploadFile = File(...),
    title: str = File(""),
    athlete: str = File(""),
    opponent: str = File(""),
    weapon: str = File("epee"),
    match_result: str = File(""),
    score: str = File(""),
    tournament: str = File(""),
):
    """
    Upload a video file with metadata.

    Args:
        file: Video file
        title: Video title
        athlete: Athlete name
        opponent: Opponent name
        weapon: Weapon type (foil, epee, sabre)
        match_result: Match result (win, loss, draw)
        score: Match score (e.g., "15-12")
        tournament: Tournament name
    """
    # Validate file type
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_TYPES)}"
        )

    # Validate weapon
    valid_weapons = ["foil", "epee", "sabre"]
    if weapon.lower() not in valid_weapons:
        weapon = "epee"

    # Validate match result
    valid_results = ["win", "loss", "draw"]
    if match_result.lower() not in valid_results:
        match_result = ""

    # Build metadata
    metadata = {
        "title": title or file.filename,
        "athlete": athlete,
        "opponent": opponent,
        "weapon": weapon,
        "match_result": match_result,
        "score": score,
        "tournament": tournament,
    }

    # Save the video with metadata (size check included)
    try:
        video_id, filename, file_path = await video_service.save_video(file, metadata, max_size=MAX_FILE_SIZE)

        return VideoUploadResponse(
            video_id=video_id,
            filename=filename,
            file_path=file_path,
            message="Video uploaded successfully with metadata"
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload video: {str(e)}"
        )


@router.get("/list", response_model=VideoListResponse)
async def list_videos():
    """
    List all uploaded videos with metadata.
    """
    try:
        videos = video_service.list_videos()
        return VideoListResponse(
            videos=videos,
            total=len(videos)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list videos: {str(e)}"
        )


@router.get("/{video_id}")
async def get_video(video_id: str):
    """
    Get video details and metadata.
    """
    metadata = video_service.get_video_metadata(video_id)
    if not metadata:
        raise HTTPException(
            status_code=404,
            detail="Video not found"
        )
    return metadata


@router.post("/analyze", response_model=VideoAnalyzeResponse)
async def analyze_video(request: VideoAnalyzeRequest):
    """
    Analyze a previously uploaded video.

    Args:
        video_id: ID of the video to analyze
        weapon: Weapon type (foil, epee, sabre)
        depth: Analysis depth level (1-5)
    """
    # Validate weapon type
    valid_weapons = ["foil", "epee", "sabre"]
    if request.weapon.lower() not in valid_weapons:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid weapon. Must be one of: {', '.join(valid_weapons)}"
        )

    # Validate depth
    if request.depth < 1 or request.depth > 5:
        raise HTTPException(
            status_code=400,
            detail="Depth must be between 1 and 5"
        )

    # Get video path
    video_path = video_service.get_video_path(request.video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Analyze the video
    try:
        analysis = await video_service.analyze_video(
            video_path=video_path,
            weapon=request.weapon,
            depth=request.depth
        )

        return VideoAnalyzeResponse(
            video_id=request.video_id,
            analysis=analysis,
            weapon=request.weapon,
            depth=request.depth
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze video: {str(e)}"
        )


# Pose Analysis Endpoints
@router.post("/analyze/pose", response_model=PoseAnalyzeResponse)
async def analyze_pose(request: PoseAnalyzeRequest):
    """
    Analyze human pose in a video using MediaPipe.

    Args:
        video_id: ID of the video to analyze
        sample_interval: Process every N frames (default 5)
    """
    # Get video path
    video_path = video_service.get_video_path(request.video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Run pose analysis
    try:
        result = pose_analysis_service.analyze_pose(
            video_path=video_path,
            video_id=request.video_id,
            sample_interval=request.sample_interval
        )

        return PoseAnalyzeResponse(
            video_id=request.video_id,
            message="Pose analysis completed successfully",
            pose_data_path=result["pose_data_path"],
            processed_frames=result["processing"]["processed_frames"],
            total_frames=result["processing"]["total_frames"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze pose: {str(e)}"
        )


@router.post("/{video_id}/analyze/pose/report")
async def generate_pose_report(video_id: str):
    """
    Generate a technical analysis report from pose data using LLM.

    This endpoint:
    1. Fetches pose data for the video
    2. Fetches computed fencing metrics
    3. Sends the full pose data to LLM to generate an analysis report
    4. Returns the analysis text
    """
    # Get pose data
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    # Get metrics
    try:
        metrics = pose_analysis_service.compute_fencing_metrics(pose_data)
    except Exception as e:
        metrics = {}

    # Build complete pose data for LLM
    pose_sequence = pose_data.get("pose_sequence", [])
    video_props = pose_data.get("video_properties", {})

    # Limit frames to avoid token overflow (max 100 frames)
    max_frames = 100
    if len(pose_sequence) > max_frames:
        # Sample frames evenly across the entire sequence
        # Use numpy linspace for even distribution
        import numpy as np
        indices = np.linspace(0, len(pose_sequence) - 1, max_frames, dtype=int)
        sampled_sequence = [pose_sequence[i] for i in indices]
    else:
        sampled_sequence = pose_sequence

    # Build structured pose data for LLM
    pose_frames = []
    for frame in sampled_sequence:
        landmarks = frame.get("landmarks", [])
        # Extract key fencing-relevant points: shoulders, hips, elbows, wrists, knees, ankles
        key_points = {}
        key_indices = {
            "nose": 0,
            "left_shoulder": 11, "right_shoulder": 12,
            "left_elbow": 13, "right_elbow": 14,
            "left_wrist": 15, "right_wrist": 16,
            "left_hip": 23, "right_hip": 24,
            "left_knee": 25, "right_knee": 26,
            "left_ankle": 27, "right_ankle": 28,
        }
        for name, idx in key_indices.items():
            if idx < len(landmarks):
                lm = landmarks[idx]
                key_points[name] = {
                    "x": round(lm["x"], 3),
                    "y": round(lm["y"], 3),
                    "z": round(lm["z"], 3),
                    "visibility": round(lm["visibility"], 2)
                }

        pose_frames.append({
            "frame_index": frame.get("frame_index"),
            "timestamp": round(frame.get("timestamp", 0), 2),
            "key_points": key_points
        })

    # Convert to JSON string for prompt
    pose_json = json.dumps(pose_frames, ensure_ascii=False, indent=2)
    metrics_json = json.dumps(metrics, ensure_ascii=False, indent=2)

    # Build analysis prompt with full pose data
    prompt = f"""你是一位专业的击剑教练AI助手。请分析以下击剑视频的姿态数据，并提供详细的技术改进建议。

## 视频信息
- Video ID: {video_id}
- 总帧数: {video_props.get('frame_count', 'N/A')}
- FPS: {video_props.get('fps', 'N/A')}
- 时长: {video_props.get('duration', 0):.2f}秒
- 分析帧数: {len(sampled_sequence)}/{len(pose_sequence)} (已采样)

## 击剑指标
{metrics_json}

## 姿态关键点数据 (每帧33点中的关键点)
以下是采样帧的姿态数据，包含以下关键点坐标 (x, y, z为归一化坐标 0-1, visibility为可见度):
- nose: 鼻子
- left_shoulder/right_shoulder: 左/右肩
- left_elbow/right_elbow: 左/右肘
- left_wrist/right_wrist: 左/右手腕
- left_hip/right_hip: 左/右髋
- left_knee/right_knee: 左/右膝
- left_ankle/right_ankle: 左/右踝

{pose_json}

请根据以上完整的姿态数据提供:
1. **整体姿态分析** - 运动员的基本姿势和重心
2. **动作识别** - 识别出具体动作（如弓步lunge、冲刺advance、撤退retreat、进攻attack、防守parry等）
3. **技术优点** - 动作中做得好的地方
4. **技术问题** - 需要改进的地方
5. **训练建议** - 具体的技术训练重点

请用中文回复，分析要详细具体，基于实际数据。"""

    try:
        # Call LLM to generate report
        response = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            context="Pose analysis report generation"
        )
        # Extract key metrics for response
        avg_visibility = metrics.get("avg_visibility", 0)
        frame_count = len(pose_sequence)

        return {
            "video_id": video_id,
            "report": response,
            "metrics": {
                "frame_count": frame_count,
                "avg_visibility": avg_visibility,
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate report: {str(e)}"
        )


@router.get("/{video_id}/pose-overlay", response_model=PoseOverlayResponse)
async def get_pose_overlay(video_id: str):
    """
    Get or generate pose overlay video for a video.

    This endpoint generates a video with pose skeleton overlay.
    """
    # Get video path
    video_path = video_service.get_video_path(video_id)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Video not found. Please upload the video first."
        )

    # Check if overlay already exists
    existing_overlay = pose_analysis_service.get_overlay_path(video_id)
    if existing_overlay:
        return PoseOverlayResponse(
            video_id=video_id,
            overlay_video_path=existing_overlay,
            message="Pose overlay video (cached)"
        )

    # Generate overlay video
    try:
        overlay_path = pose_analysis_service.generate_pose_overlay(
            video_path=video_path,
            video_id=video_id
        )

        return PoseOverlayResponse(
            video_id=video_id,
            overlay_video_path=overlay_path,
            message="Pose overlay video generated successfully"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate pose overlay: {str(e)}"
        )


@router.get("/{video_id}/pose-data")
async def get_pose_data(video_id: str):
    """
    Get pose analysis data for a video.

    Returns the detected pose landmarks for each processed frame.
    """
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    return pose_data


@router.get("/{video_id}/pose-metrics", response_model=FencingMetrics)
async def get_pose_metrics(video_id: str):
    """
    Get fencing-specific metrics computed from pose data.

    This includes movement metrics, visibility scores, etc.
    """
    pose_data = pose_analysis_service.get_pose_data(video_id)
    if not pose_data:
        raise HTTPException(
            status_code=404,
            detail="Pose data not found. Please run pose analysis first."
        )

    try:
        metrics = pose_analysis_service.compute_fencing_metrics(pose_data)
        return FencingMetrics(**metrics)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute metrics: {str(e)}"
        )
