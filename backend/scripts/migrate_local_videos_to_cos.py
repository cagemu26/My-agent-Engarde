#!/usr/bin/env python3
"""
One-time migration tool:
- Reads legacy local video metadata/files
- Uploads raw/overlay/pose_data assets to object storage (COS/local provider)
- Writes/updates rows in the videos table

Idempotent behavior:
- Existing DB rows are reused
- Existing objects in storage are skipped
- Safe to rerun
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Optional

from app.core.database import SessionLocal
from app.models.video import Video
from app.services.storage import storage_service
from app.services.video import video_service


def _find_raw_file(videos_dir: Path, video_id: str, preferred_path: Optional[str]) -> Optional[Path]:
    if preferred_path:
        candidate = Path(preferred_path)
        if candidate.exists():
            return candidate
    for candidate in videos_dir.glob(f"{video_id}.*"):
        if candidate.is_file():
            return candidate
    return None


def _load_metadata(path: Path) -> Optional[dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def _put_if_missing(local_path: Path, *, bucket: str, key: str, content_type: Optional[str], force: bool) -> str:
    exists = storage_service.provider.object_exists(bucket=bucket, key=key)
    if exists and not force:
        return "skipped"
    storage_service.provider.put_file(
        bucket=bucket,
        key=key,
        file_path=str(local_path),
        content_type=content_type,
    )
    return "uploaded"


def migrate(
    *,
    videos_dir: Path,
    metadata_dir: Path,
    analyses_dir: Path,
    force: bool,
) -> dict[str, Any]:
    if storage_service.provider_name != "cos":
        raise RuntimeError("Set STORAGE_PROVIDER=cos before running migration")

    bucket = storage_service.default_bucket
    summary = {
        "provider": storage_service.provider_name,
        "bucket": bucket,
        "processed": 0,
        "migrated": 0,
        "skipped": 0,
        "failed": 0,
        "details": [],
    }

    session = SessionLocal()
    try:
        metadata_files = sorted(metadata_dir.glob("*.json"))
        for metadata_file in metadata_files:
            video_id = metadata_file.stem
            summary["processed"] += 1
            row = {
                "video_id": video_id,
                "status": "skipped",
                "reason": "",
                "raw": "missing",
                "overlay": "missing",
                "pose_data": "missing",
            }
            try:
                metadata = _load_metadata(metadata_file)
                if not metadata:
                    row["reason"] = "invalid metadata json"
                    summary["failed"] += 1
                    row["status"] = "failed"
                    summary["details"].append(row)
                    continue

                user_id = metadata.get("user_id")
                if not user_id:
                    row["reason"] = "missing user_id"
                    summary["failed"] += 1
                    row["status"] = "failed"
                    summary["details"].append(row)
                    continue

                raw_file = _find_raw_file(videos_dir, video_id, metadata.get("file_path"))
                if not raw_file:
                    row["reason"] = "raw video file not found"
                    summary["failed"] += 1
                    row["status"] = "failed"
                    summary["details"].append(row)
                    continue

                existing = session.query(Video).filter(Video.id == video_id).first()
                source_key = video_service.build_source_key(
                    user_id=str(user_id),
                    video_id=video_id,
                    original_filename=raw_file.name,
                )
                if existing:
                    record = existing
                    record.user_id = user_id
                else:
                    record = Video(id=video_id, user_id=user_id)
                    session.add(record)

                record.title = metadata.get("title") or raw_file.name
                record.athlete = metadata.get("athlete") or ""
                record.opponent = metadata.get("opponent") or ""
                record.weapon = metadata.get("weapon") or "epee"
                record.match_result = metadata.get("match_result") or ""
                record.score = metadata.get("score") or ""
                record.tournament = metadata.get("tournament") or ""
                record.notes = metadata.get("notes") or ""
                record.original_filename = raw_file.name
                record.content_type = record.content_type or "video/mp4"
                record.file_size = int(raw_file.stat().st_size)
                record.source_bucket = bucket
                record.source_key = source_key
                record.upload_status = "uploaded"

                row["raw"] = _put_if_missing(
                    raw_file,
                    bucket=bucket,
                    key=source_key,
                    content_type="video/mp4",
                    force=force,
                )

                pose_path = analyses_dir / video_id / "pose" / "pose_data.json"
                if pose_path.exists():
                    pose_key = video_service.build_pose_data_key(user_id=str(user_id), video_id=video_id)
                    row["pose_data"] = _put_if_missing(
                        pose_path,
                        bucket=bucket,
                        key=pose_key,
                        content_type="application/json",
                        force=force,
                    )
                    record.pose_data_bucket = bucket
                    record.pose_data_key = pose_key
                    record.pose_status = "completed"

                overlay_path = analyses_dir / video_id / "pose" / "pose_overlay.mp4"
                if overlay_path.exists():
                    overlay_key = video_service.build_overlay_key(user_id=str(user_id), video_id=video_id)
                    row["overlay"] = _put_if_missing(
                        overlay_path,
                        bucket=bucket,
                        key=overlay_key,
                        content_type="video/mp4",
                        force=force,
                    )
                    record.overlay_bucket = bucket
                    record.overlay_key = overlay_key
                    if record.pose_status != "completed":
                        record.pose_status = "completed"

                session.commit()
                row["status"] = "migrated"
                summary["migrated"] += 1
            except Exception as exc:
                session.rollback()
                row["status"] = "failed"
                row["reason"] = str(exc)
                summary["failed"] += 1
            finally:
                summary["details"].append(row)

        summary["skipped"] = max(
            summary["processed"] - summary["migrated"] - summary["failed"],
            0,
        )
        return summary
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate local video assets to COS-backed storage.")
    parser.add_argument("--videos-dir", default="/data/fencing-ai/videos")
    parser.add_argument("--metadata-dir", default="/data/fencing-ai/videos/metadata")
    parser.add_argument("--analyses-dir", default="/data/fencing-ai/videos/analyses")
    parser.add_argument("--force", action="store_true", help="Re-upload even if object already exists")
    parser.add_argument("--report", default="", help="Optional path to write migration JSON report")
    args = parser.parse_args()

    summary = migrate(
        videos_dir=Path(args.videos_dir),
        metadata_dir=Path(args.metadata_dir),
        analyses_dir=Path(args.analyses_dir),
        force=bool(args.force),
    )

    report_json = json.dumps(summary, ensure_ascii=False, indent=2)
    print(report_json)
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_json, encoding="utf-8")


if __name__ == "__main__":
    main()
