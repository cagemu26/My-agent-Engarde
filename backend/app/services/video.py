from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from app.core.config import settings
from app.models.video import Video
from app.services.storage import storage_service


class VideoService:
    def __init__(self) -> None:
        # Legacy local filesystem paths (kept for migration and fallback compatibility).
        self.upload_dir = Path(settings.VIDEO_UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir = self.upload_dir / "metadata"
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def new_video_id(self) -> str:
        return str(uuid.uuid4())

    def _get_metadata_path(self, video_id: str) -> Path:
        return self.metadata_dir / f"{video_id}.json"

    def _raw_prefix(self) -> str:
        return settings.COS_RAW_PREFIX or "raw"

    def _derived_prefix(self) -> str:
        return settings.COS_DERIVED_PREFIX or "derived"

    def build_source_key(self, *, user_id: str, video_id: str, original_filename: str) -> str:
        filename = storage_service.safe_filename(original_filename or f"{video_id}.mp4")
        path = f"users/{user_id}/videos/{video_id}/{self._raw_prefix()}/{filename}"
        return storage_service.normalize_key(path)

    def build_pose_data_key(self, *, user_id: str, video_id: str, version: Optional[str] = None) -> str:
        if version:
            path = f"users/{user_id}/videos/{video_id}/{self._derived_prefix()}/{version}/pose_data.json"
        else:
            path = f"users/{user_id}/videos/{video_id}/{self._derived_prefix()}/pose_data.json"
        return storage_service.normalize_key(path)

    def build_overlay_key(self, *, user_id: str, video_id: str, version: Optional[str] = None) -> str:
        if version:
            path = f"users/{user_id}/videos/{video_id}/{self._derived_prefix()}/{version}/pose_overlay.mp4"
        else:
            path = f"users/{user_id}/videos/{video_id}/{self._derived_prefix()}/pose_overlay.mp4"
        return storage_service.normalize_key(path)

    def make_storage_uri(self, *, bucket: str, key: str) -> str:
        provider = storage_service.provider_name
        if provider == "cos":
            return f"cos://{bucket}/{key}"
        return f"local://{bucket}/{key}"

    def to_metadata_dict(self, video: Video) -> dict:
        return {
            "video_id": video.id,
            "title": video.title or video.original_filename or video.id,
            "athlete": video.athlete or "",
            "opponent": video.opponent or "",
            "weapon": video.weapon or "epee",
            "match_result": video.match_result or "",
            "score": video.score or "",
            "tournament": video.tournament or "",
            "notes": video.notes or "",
            "filename": video.original_filename or "",
            "original_filename": video.original_filename or "",
            "content_type": video.content_type or "",
            "file_size": video.file_size or 0,
            "upload_status": video.upload_status,
            "pose_status": video.pose_status,
            "report_status": video.report_status,
            "source_bucket": video.source_bucket,
            "source_key": video.source_key,
            "overlay_bucket": video.overlay_bucket,
            "overlay_key": video.overlay_key,
            "pose_data_bucket": video.pose_data_bucket,
            "pose_data_key": video.pose_data_key,
            "user_id": str(video.user_id),
            "upload_time": video.created_at.isoformat() if video.created_at else None,
            "created_at": video.created_at.isoformat() if video.created_at else None,
            "updated_at": video.updated_at.isoformat() if video.updated_at else None,
            "file_path": self.make_storage_uri(
                bucket=video.source_bucket or storage_service.default_bucket,
                key=video.source_key or "",
            )
            if video.source_key
            else None,
        }

    # ---------------------------------------------------------------------
    # Legacy local storage methods (fallback only)
    # ---------------------------------------------------------------------
    async def save_video(
        self,
        file: UploadFile,
        metadata: Optional[dict] = None,
        max_size: Optional[int] = None,
    ) -> tuple[str, str, str]:
        video_id = self.new_video_id()
        file_ext = Path(file.filename).suffix or ".mp4"
        filename = f"{video_id}{file_ext}"
        file_path = self.upload_dir / filename

        content = await file.read()
        if max_size and len(content) > max_size:
            raise ValueError(f"File too large. Maximum size is {max_size // (1024 * 1024)}MB")

        with open(file_path, "wb") as fh:
            fh.write(content)

        if metadata:
            metadata["video_id"] = video_id
            metadata["filename"] = filename
            metadata["file_path"] = str(file_path)
            metadata["upload_time"] = datetime.now().isoformat()
            metadata_path = self._get_metadata_path(video_id)
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh, ensure_ascii=False, indent=2)

        return video_id, filename, str(file_path)

    def get_video_metadata(self, video_id: str) -> Optional[dict]:
        metadata_path = self._get_metadata_path(video_id)
        if metadata_path.exists():
            with open(metadata_path, encoding="utf-8") as fh:
                return json.load(fh)
        return None

    def list_videos(self, user_id: Optional[str] = None) -> list[dict]:
        videos: list[dict] = []
        for metadata_file in self.metadata_dir.glob("*.json"):
            try:
                with open(metadata_file, encoding="utf-8") as fh:
                    metadata = json.load(fh)
                    if user_id is not None and str(metadata.get("user_id", "")) != str(user_id):
                        continue
                    videos.append(metadata)
            except Exception:
                continue

        videos.sort(key=lambda item: item.get("upload_time", ""), reverse=True)
        return videos

    async def analyze_video(self, video_path: str, weapon: str, depth: int = 3) -> str:
        weapon_descriptions = {
            "foil": "Foil fencing emphasizes precision and timing. The target area is the torso.",
            "epee": "Epee fencing is about the whole body as target. It encourages strategic fencing.",
            "sabre": "Sabre fencing is about speed and attacks above the waist. Cuts and thrusts are both valid.",
        }

        weapon_desc = weapon_descriptions.get(weapon.lower(), "fencing")
        return f"""Video Analysis Complete

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

    def get_video_path(self, video_id: str) -> Optional[str]:
        for file_path in self.upload_dir.iterdir():
            if file_path.stem == video_id:
                return str(file_path)
        return None

    def delete_video(self, video_id: str) -> bool:
        file_path = self.get_video_path(video_id)
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False

    def delete_video_assets(self, video_id: str) -> dict:
        deleted_video = False
        deleted_metadata = False

        metadata = self.get_video_metadata(video_id) or {}
        preferred_path = metadata.get("file_path")
        candidate_paths: list[Path] = []
        if preferred_path:
            candidate_paths.append(Path(preferred_path))

        for file_path in self.upload_dir.glob(f"{video_id}.*"):
            if file_path.is_file():
                candidate_paths.append(file_path)

        unique_paths: list[Path] = []
        seen: set[str] = set()
        for file_path in candidate_paths:
            raw = str(file_path)
            if raw in seen:
                continue
            seen.add(raw)
            unique_paths.append(file_path)

        for file_path in unique_paths:
            try:
                if file_path.exists():
                    file_path.unlink()
                    deleted_video = True
            except OSError:
                continue

        metadata_path = self._get_metadata_path(video_id)
        try:
            if metadata_path.exists():
                metadata_path.unlink()
                deleted_metadata = True
        except OSError:
            deleted_metadata = False

        return {
            "video_id": video_id,
            "deleted_video_file": deleted_video,
            "deleted_metadata_file": deleted_metadata,
        }


video_service = VideoService()
