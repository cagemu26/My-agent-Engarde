import os
import json
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime
from fastapi import UploadFile
from app.core.config import settings


class VideoService:
    def __init__(self):
        self.upload_dir = Path(settings.VIDEO_UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir = self.upload_dir / "metadata"
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def _get_metadata_path(self, video_id: str) -> Path:
        """Get the path for video metadata file"""
        return self.metadata_dir / f"{video_id}.json"

    async def save_video(
        self,
        file: UploadFile,
        metadata: Optional[dict] = None,
        max_size: Optional[int] = None
    ) -> tuple[str, str, str]:
        """
        Save uploaded video file to storage.

        Args:
            file: Uploaded video file
            metadata: Optional metadata dictionary
            max_size: Optional maximum file size in bytes

        Returns:
            tuple: (video_id, filename, file_path)

        Raises:
            ValueError: If file exceeds max_size
        """
        # Generate unique ID for the video
        video_id = str(uuid.uuid4())

        # Get file extension
        file_ext = Path(file.filename).suffix or ".mp4"
        filename = f"{video_id}{file_ext}"
        file_path = self.upload_dir / filename

        # Read and validate file size
        content = await file.read()
        if max_size and len(content) > max_size:
            raise ValueError(f"File too large. Maximum size is {max_size // (1024*1024)}MB")

        # Save the file
        with open(file_path, "wb") as f:
            f.write(content)

        # Save metadata if provided
        if metadata:
            metadata["video_id"] = video_id
            metadata["filename"] = filename
            metadata["file_path"] = str(file_path)
            metadata["upload_time"] = datetime.now().isoformat()

            metadata_path = self._get_metadata_path(video_id)
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

        return video_id, filename, str(file_path)

    def get_video_metadata(self, video_id: str) -> Optional[dict]:
        """Get video metadata by ID"""
        metadata_path = self._get_metadata_path(video_id)
        if metadata_path.exists():
            with open(metadata_path, encoding="utf-8") as f:
                return json.load(f)
        return None

    def list_videos(self, user_id: Optional[str] = None) -> list[dict]:
        """List uploaded videos with optional owner filter."""
        videos = []
        for metadata_file in self.metadata_dir.glob("*.json"):
            try:
                with open(metadata_file, encoding="utf-8") as f:
                    metadata = json.load(f)
                    if user_id is not None and str(metadata.get("user_id", "")) != str(user_id):
                        continue
                    videos.append(metadata)
            except Exception:
                continue

        # Sort by upload time (newest first)
        videos.sort(key=lambda x: x.get("upload_time", ""), reverse=True)
        return videos

    async def analyze_video(
        self,
        video_path: str,
        weapon: str,
        depth: int = 3
    ) -> str:
        """
        Analyze the video for fencing technique.

        Args:
            video_path: Path to the video file
            weapon: Weapon type (foil, epee, sabre)
            depth: Analysis depth level

        Returns:
            str: Analysis result
        """
        # TODO: Implement actual video analysis with AI
        # For now, return a placeholder analysis

        weapon_descriptions = {
            "foil": "Foil fencing emphasizes precision and timing. The target area is the torso.",
            "epee": "Épée fencing is about the whole body as target. It encourages strategic fencing.",
            "sabre": "Sabre fencing is about speed and attacks above the waist. Cuts and thrusts are both valid."
        }

        weapon_desc = weapon_descriptions.get(weapon.lower(), "fencing")

        analysis = f"""Video Analysis Complete

Weapon: {weapon.upper()}
Analysis Depth: {depth}/5

Key Observations:
1. The fencer demonstrates proper en garde position
2. Footwork appears fluid with good weight distribution
3. The stance shows awareness of {weapon_desc}

Recommendations:
- Continue practicing basic footwork drills
- Focus on maintaining proper distance
- Work on blade work specific to {weapon}

Note: This is a basic analysis. For detailed feedback, please consult with a certified fencing coach.

File analyzed: {video_path}"""

        return analysis

    def get_video_path(self, video_id: str) -> Optional[str]:
        """
        Get the file path for a video by its ID.

        Args:
            video_id: The video ID

        Returns:
            str or None: The file path if found
        """
        # Search for file with this ID prefix
        for file_path in self.upload_dir.iterdir():
            if file_path.stem == video_id:
                return str(file_path)
        return None

    def delete_video(self, video_id: str) -> bool:
        """
        Delete a video file.

        Args:
            video_id: The video ID

        Returns:
            bool: True if deleted, False if not found
        """
        file_path = self.get_video_path(video_id)
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False


video_service = VideoService()
