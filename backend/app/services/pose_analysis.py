"""
Pose analysis service using MediaPipe Pose Landmarker.

This service detects up to two athletes, keeps them in stable left/right slots,
and generates overlay assets and normalized pose data for downstream reports.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import cv2
import httpx
import mediapipe as mp
from mediapipe.framework.formats import landmark_pb2
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
from mediapipe.tasks.python.vision.pose_landmarker import PoseLandmarker, PoseLandmarkerOptions

from app.core.config import settings


SCHEMA_VERSION = 2
POSE_TRACK_SLOTS = ("left", "right")
POSE_LANDMARKER_NAME = "pose_landmarker_heavy.task"
POSE_LANDMARKER_NUM_POSES = 2
POSE_DETECTION_THRESHOLD = 0.45
DUAL_SLOT_LOCK_THRESHOLD = 2
TRACK_MEMORY_MAX_MISSES = 24
BROWSER_COMPATIBLE_MP4_CODECS = {"h264"}


logger = logging.getLogger(__name__)


class PoseAnalysisService:
    """Service for detecting and analyzing human pose in fencing videos."""

    FIXED_SAMPLE_INTERVAL = 1

    LANDMARK_NAMES = [
        "nose", "left_eye_inner", "left_eye", "left_eye_outer",
        "right_eye_inner", "right_eye", "right_eye_outer",
        "left_ear", "right_ear",
        "mouth_left", "mouth_right",
        "left_shoulder", "right_shoulder",
        "left_elbow", "right_elbow",
        "left_wrist", "right_wrist",
        "left_pinky", "right_pinky",
        "left_index", "right_index",
        "left_thumb", "right_thumb",
        "left_hip", "right_hip",
        "left_knee", "right_knee",
        "left_ankle", "right_ankle",
        "left_heel", "right_heel",
        "left_foot_index", "right_foot_index",
    ]

    POSE_CONNECTIONS = [
        (0, 1), (0, 2), (1, 3), (2, 4),
        (4, 6), (3, 5), (5, 6),
        (9, 10),
        (11, 12),
        (11, 13), (13, 15),
        (15, 17), (15, 19), (15, 21), (17, 19),
        (12, 14), (14, 16),
        (16, 18), (16, 20), (16, 22), (18, 20),
        (11, 23), (12, 24),
        (23, 24),
        (23, 25), (25, 27),
        (27, 29), (27, 31), (29, 31),
        (24, 26), (26, 28),
        (28, 30), (28, 32), (30, 32),
    ]

    SLOT_COLORS = {
        "left": ((38, 38, 220), (125, 211, 252)),
        "right": ((16, 185, 129), (253, 224, 71)),
    }

    def __init__(self) -> None:
        self.upload_dir = Path(settings.VIDEO_UPLOAD_DIR)
        self.analysis_dir = self.upload_dir / "analyses"
        self.analysis_dir.mkdir(parents=True, exist_ok=True)

        self.mp_drawing = mp.solutions.drawing_utils
        self.model_path = Path(settings.POSE_LANDMARKER_MODEL_PATH)
        self.model_url = settings.POSE_LANDMARKER_MODEL_URL

    def _get_analysis_dir(self, video_id: str) -> Path:
        video_analysis_dir = self.analysis_dir / video_id / "pose"
        video_analysis_dir.mkdir(parents=True, exist_ok=True)
        return video_analysis_dir

    def _get_pose_data_path(self, video_id: str) -> Path:
        return self._get_analysis_dir(video_id) / "pose_data.json"

    def _get_overlay_video_path(self, video_id: str) -> Path:
        return self._get_analysis_dir(video_id) / "pose_overlay.mp4"

    def _probe_video_codec(self, video_path: Path) -> Optional[str]:
        ffprobe_bin = shutil.which("ffprobe")
        if not ffprobe_bin or not video_path.exists():
            return None

        command = [
            ffprobe_bin,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
            )
        except (subprocess.CalledProcessError, OSError):
            return None

        codec_name = completed.stdout.strip().lower()
        return codec_name or None

    def _is_browser_compatible_overlay(self, video_path: Path) -> bool:
        codec_name = self._probe_video_codec(video_path)
        if codec_name is None:
            return True
        return codec_name in BROWSER_COMPATIBLE_MP4_CODECS

    def _transcode_overlay_for_web(self, source_path: Path, output_path: Path) -> bool:
        ffmpeg_bin = shutil.which("ffmpeg")
        if not ffmpeg_bin:
            logger.warning("ffmpeg unavailable, falling back to raw overlay at %s", source_path)
            return False

        command = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(source_path),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
            )
        except (subprocess.CalledProcessError, OSError) as exc:
            stderr = ""
            if isinstance(exc, subprocess.CalledProcessError):
                stderr = (exc.stderr or "").strip()
            logger.warning("Overlay transcode failed for %s: %s", source_path, stderr or exc)
            return False

        if completed.stderr:
            logger.debug("Overlay transcode output for %s: %s", source_path, completed.stderr.strip())
        return output_path.exists()

    def _ensure_model_asset(self) -> Path:
        if self.model_path.exists():
            return self.model_path

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", self.model_url, follow_redirects=True, timeout=90.0) as response:
            response.raise_for_status()
            with open(self.model_path, "wb") as file_handle:
                for chunk in response.iter_bytes():
                    if chunk:
                        file_handle.write(chunk)
        return self.model_path

    def _create_pose_landmarker(self) -> PoseLandmarker:
        model_path = self._ensure_model_asset()
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=VisionTaskRunningMode.VIDEO,
            num_poses=POSE_LANDMARKER_NUM_POSES,
            min_pose_detection_confidence=POSE_DETECTION_THRESHOLD,
            min_pose_presence_confidence=POSE_DETECTION_THRESHOLD,
            min_tracking_confidence=POSE_DETECTION_THRESHOLD,
            output_segmentation_masks=False,
        )
        return PoseLandmarker.create_from_options(options)

    def _compute_center_and_scale(self, landmarks: list[dict[str, float]]) -> tuple[float, float, float]:
        visible_points = [
            landmark
            for landmark in landmarks
            if float(landmark.get("visibility", 0.0)) >= 0.2
        ]
        if not visible_points:
            visible_points = landmarks

        xs = [float(landmark.get("x", 0.0)) for landmark in visible_points]
        ys = [float(landmark.get("y", 0.0)) for landmark in visible_points]
        if not xs or not ys:
            return 0.5, 0.5, 0.0

        center_x = sum(xs) / len(xs)
        center_y = sum(ys) / len(ys)
        scale = max(max(xs) - min(xs), max(ys) - min(ys))
        return center_x, center_y, scale

    def _normalize_detection(self, athlete_landmarks: list[Any]) -> dict[str, Any]:
        normalized_landmarks: list[dict[str, float]] = []
        visibility_values: list[float] = []

        for index, landmark in enumerate(athlete_landmarks):
            visibility = float(getattr(landmark, "visibility", 0.0) or 0.0)
            normalized_landmarks.append(
                {
                    "name": self.LANDMARK_NAMES[index] if index < len(self.LANDMARK_NAMES) else f"landmark_{index}",
                    "x": float(getattr(landmark, "x", 0.0) or 0.0),
                    "y": float(getattr(landmark, "y", 0.0) or 0.0),
                    "z": float(getattr(landmark, "z", 0.0) or 0.0),
                    "visibility": visibility,
                }
            )
            visibility_values.append(visibility)

        center_x, center_y, scale = self._compute_center_and_scale(normalized_landmarks)
        confidence = sum(visibility_values) / len(visibility_values) if visibility_values else 0.0
        return {
            "landmarks": normalized_landmarks,
            "visibility": visibility_values,
            "confidence": confidence,
            "center_x": center_x,
            "center_y": center_y,
            "scale": scale,
        }

    def _sort_detections(self, detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            detections,
            key=lambda item: (item.get("confidence", 0.0), -(item.get("scale", 0.0))),
            reverse=True,
        )[:POSE_LANDMARKER_NUM_POSES]

    def _slot_cost(
        self,
        slot: str,
        detection: dict[str, Any],
        memory: dict[str, Optional[dict[str, float]]],
    ) -> float:
        last_seen = memory.get(slot)
        center_x = float(detection.get("center_x", 0.5))
        center_y = float(detection.get("center_y", 0.5))
        scale = float(detection.get("scale", 0.0))

        if last_seen is None:
            anchor_x = 0.3 if slot == "left" else 0.7
            return abs(center_x - anchor_x)

        distance_cost = ((center_x - last_seen["center_x"]) ** 2 + (center_y - last_seen["center_y"]) ** 2) ** 0.5
        scale_cost = abs(scale - last_seen["scale"]) * 0.35
        miss_penalty = float(last_seen.get("missed_frames", 0.0)) * 0.01
        return distance_cost + scale_cost + miss_penalty

    def _assign_slots(
        self,
        detections: list[dict[str, Any]],
        slot_memory: dict[str, Optional[dict[str, float]]],
        slots_locked: bool,
        stable_dual_frames: int,
    ) -> tuple[dict[str, dict[str, Any]], bool, int]:
        assignments: dict[str, dict[str, Any]] = {}
        ranked = self._sort_detections(detections)

        if not ranked:
            return assignments, slots_locked, 0

        if not slots_locked and len(ranked) >= 2:
            ordered = sorted(ranked[:2], key=lambda item: item.get("center_x", 0.5))
            stable_dual_frames += 1
            assignments = {"left": ordered[0], "right": ordered[1]}
            if stable_dual_frames >= DUAL_SLOT_LOCK_THRESHOLD:
                slots_locked = True
            return assignments, slots_locked, stable_dual_frames

        stable_dual_frames = 0

        if not slots_locked:
            single = ranked[0]
            inferred_slot = "left" if float(single.get("center_x", 0.5)) <= 0.5 else "right"
            assignments[inferred_slot] = single
            return assignments, slots_locked, stable_dual_frames

        if len(ranked) == 1:
            single = ranked[0]
            left_cost = self._slot_cost("left", single, slot_memory)
            right_cost = self._slot_cost("right", single, slot_memory)
            assignments["left" if left_cost <= right_cost else "right"] = single
            return assignments, slots_locked, stable_dual_frames

        left_first_cost = self._slot_cost("left", ranked[0], slot_memory) + self._slot_cost("right", ranked[1], slot_memory)
        right_first_cost = self._slot_cost("left", ranked[1], slot_memory) + self._slot_cost("right", ranked[0], slot_memory)

        if left_first_cost <= right_first_cost:
            assignments["left"] = ranked[0]
            assignments["right"] = ranked[1]
        else:
            assignments["left"] = ranked[1]
            assignments["right"] = ranked[0]
        return assignments, slots_locked, stable_dual_frames

    def _build_frame_athletes(
        self,
        assignments: dict[str, dict[str, Any]],
        slot_memory: dict[str, Optional[dict[str, float]]],
        player_stats: dict[str, dict[str, float]],
    ) -> list[dict[str, Any]]:
        frame_athletes: list[dict[str, Any]] = []
        for slot in POSE_TRACK_SLOTS:
            assigned = assignments.get(slot)
            if assigned is None:
                last_seen = slot_memory.get(slot)
                if last_seen is not None:
                    last_seen["missed_frames"] = float(last_seen.get("missed_frames", 0.0)) + 1.0
                    if last_seen["missed_frames"] > TRACK_MEMORY_MAX_MISSES:
                        slot_memory[slot] = None
                continue

            slot_memory[slot] = {
                "center_x": float(assigned.get("center_x", 0.5)),
                "center_y": float(assigned.get("center_y", 0.5)),
                "scale": float(assigned.get("scale", 0.0)),
                "missed_frames": 0.0,
            }
            player_stats[slot]["coverage_frames"] += 1.0
            player_stats[slot]["confidence_total"] += float(assigned.get("confidence", 0.0))

            frame_athletes.append(
                {
                    "slot": slot,
                    "track_id": slot,
                    "landmarks": assigned["landmarks"],
                    "visibility": assigned.get("visibility", []),
                    "confidence": assigned.get("confidence", 0.0),
                    "center_x": assigned.get("center_x", 0.5),
                    "center_y": assigned.get("center_y", 0.5),
                    "present": True,
                }
            )

        return frame_athletes

    def _summarize_players(
        self,
        player_stats: dict[str, dict[str, float]],
        frame_count: int,
    ) -> list[dict[str, Any]]:
        players: list[dict[str, Any]] = []
        safe_frame_count = max(frame_count, 1)
        for slot in POSE_TRACK_SLOTS:
            coverage_frames = int(player_stats[slot]["coverage_frames"])
            if coverage_frames <= 0:
                continue
            average_confidence = player_stats[slot]["confidence_total"] / coverage_frames
            players.append(
                {
                    "slot": slot,
                    "track_id": slot,
                    "coverage_frames": coverage_frames,
                    "coverage_ratio": coverage_frames / safe_frame_count,
                    "average_confidence": average_confidence,
                    "display_name": f"{slot.capitalize()} Athlete",
                }
            )
        return players

    def normalize_pose_data(self, pose_data: dict[str, Any]) -> dict[str, Any]:
        if not pose_data:
            return pose_data

        if pose_data.get("schema_version") == SCHEMA_VERSION and all(
            isinstance(frame.get("athletes", []), list) for frame in pose_data.get("pose_sequence", [])
        ):
            if pose_data.get("players"):
                return pose_data

            normalized_stats = {slot: {"coverage_frames": 0.0, "confidence_total": 0.0} for slot in POSE_TRACK_SLOTS}
            for frame in pose_data.get("pose_sequence", []):
                for athlete in frame.get("athletes", []):
                    slot = athlete.get("slot")
                    if slot not in normalized_stats:
                        continue
                    normalized_stats[slot]["coverage_frames"] += 1.0
                    normalized_stats[slot]["confidence_total"] += float(athlete.get("confidence", 0.0) or 0.0)

            pose_data["players"] = self._summarize_players(
                normalized_stats,
                int(pose_data.get("video_properties", {}).get("frame_count", 0) or 0),
            )
            return pose_data

        pose_sequence = pose_data.get("pose_sequence", [])
        normalized_sequence: list[dict[str, Any]] = []
        player_stats = {slot: {"coverage_frames": 0.0, "confidence_total": 0.0} for slot in POSE_TRACK_SLOTS}

        for frame in pose_sequence:
            landmarks = frame.get("landmarks", [])
            visibility = [
                float(landmark.get("visibility", 0.0) or 0.0)
                for landmark in landmarks
                if isinstance(landmark, dict)
            ]
            confidence = sum(visibility) / len(visibility) if visibility else 0.0
            center_x, center_y, _ = self._compute_center_and_scale(landmarks)
            if landmarks:
                player_stats["left"]["coverage_frames"] += 1.0
                player_stats["left"]["confidence_total"] += confidence

            normalized_sequence.append(
                {
                    "frame_index": frame.get("frame_index", 0),
                    "timestamp": frame.get("timestamp", 0),
                    "athletes": [
                        {
                            "slot": "left",
                            "track_id": "left",
                            "landmarks": landmarks,
                            "visibility": visibility,
                            "confidence": confidence,
                            "center_x": center_x,
                            "center_y": center_y,
                            "present": bool(landmarks),
                        }
                    ] if landmarks else [],
                }
            )

        normalized = {
            "video_id": pose_data.get("video_id"),
            "video_path": pose_data.get("video_path"),
            "analysis_type": pose_data.get("analysis_type", "pose"),
            "timestamp": pose_data.get("timestamp", datetime.now().isoformat()),
            "schema_version": SCHEMA_VERSION,
            "detector_info": pose_data.get("detector_info") or {
                "provider": "mediapipe-legacy",
                "model": "mp.solutions.pose",
                "num_poses": 1,
                "model_asset": None,
            },
            "video_properties": pose_data.get("video_properties", {}),
            "processing": pose_data.get("processing", {}),
            "players": self._summarize_players(
                player_stats,
                int(pose_data.get("video_properties", {}).get("frame_count", 0) or 0),
            ),
            "pose_sequence": normalized_sequence,
            "pose_data_path": pose_data.get("pose_data_path"),
        }
        return normalized

    def get_available_slots(self, pose_data: dict[str, Any]) -> list[str]:
        normalized = self.normalize_pose_data(pose_data)
        slots = [
            str(player.get("slot"))
            for player in normalized.get("players", [])
            if player.get("slot") in POSE_TRACK_SLOTS
        ]
        if slots:
            return slots

        discovered_slots: list[str] = []
        for frame in normalized.get("pose_sequence", []):
            for athlete in frame.get("athletes", []):
                slot = athlete.get("slot")
                if slot in POSE_TRACK_SLOTS and slot not in discovered_slots:
                    discovered_slots.append(slot)
        return discovered_slots

    def extract_slot_pose_data(self, pose_data: dict[str, Any], athlete_slot: Optional[str]) -> dict[str, Any]:
        normalized = self.normalize_pose_data(pose_data)
        requested_slot = athlete_slot or "left"
        available_slots = self.get_available_slots(normalized)
        if requested_slot not in available_slots:
            if requested_slot == "right" and "left" in available_slots and len(available_slots) == 1:
                raise ValueError("Right athlete data is not available for this video.")
            requested_slot = available_slots[0] if available_slots else requested_slot

        player_summary = next(
            (player for player in normalized.get("players", []) if player.get("slot") == requested_slot),
            None,
        )

        extracted_sequence: list[dict[str, Any]] = []
        for frame in normalized.get("pose_sequence", []):
            matched_athlete = next(
                (athlete for athlete in frame.get("athletes", []) if athlete.get("slot") == requested_slot),
                None,
            )
            if not matched_athlete:
                continue
            extracted_sequence.append(
                {
                    "frame_index": frame.get("frame_index", 0),
                    "timestamp": frame.get("timestamp", 0),
                    "landmarks": matched_athlete.get("landmarks", []),
                    "visibility": matched_athlete.get("visibility", []),
                    "slot": requested_slot,
                    "track_id": matched_athlete.get("track_id", requested_slot),
                    "confidence": matched_athlete.get("confidence"),
                }
            )

        return {
            "video_id": normalized.get("video_id"),
            "video_path": normalized.get("video_path"),
            "analysis_type": normalized.get("analysis_type", "pose"),
            "timestamp": normalized.get("timestamp"),
            "schema_version": 1,
            "detector_info": normalized.get("detector_info"),
            "video_properties": normalized.get("video_properties", {}),
            "processing": {
                **normalized.get("processing", {}),
                "selected_athlete_slot": requested_slot,
                "selected_athlete_track_id": player_summary.get("track_id") if player_summary else requested_slot,
            },
            "player_summary": player_summary,
            "pose_sequence": extracted_sequence,
            "pose_data_path": normalized.get("pose_data_path"),
        }

    def analyze_pose(
        self,
        video_path: str,
        video_id: str,
        sample_interval: int = 1,
    ) -> dict[str, Any]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        landmarker = self._create_pose_landmarker()

        try:
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0

            pose_sequence: list[dict[str, Any]] = []
            frame_idx = 0
            processed_frames = 0
            effective_interval = self.FIXED_SAMPLE_INTERVAL

            slots_locked = False
            stable_dual_frames = 0
            slot_memory: dict[str, Optional[dict[str, float]]] = {slot: None for slot in POSE_TRACK_SLOTS}
            player_stats = {slot: {"coverage_frames": 0.0, "confidence_total": 0.0} for slot in POSE_TRACK_SLOTS}

            print(f"Processing video: {video_path}")
            print(f"Total frames: {frame_count}, FPS: {fps}, Duration: {duration:.2f}s")

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % effective_interval == 0:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                    timestamp_ms = int((frame_idx * 1000) / fps) if fps > 0 else frame_idx * 33
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)
                    detections = [
                        self._normalize_detection(athlete_landmarks)
                        for athlete_landmarks in result.pose_landmarks
                    ]
                    assignments, slots_locked, stable_dual_frames = self._assign_slots(
                        detections,
                        slot_memory,
                        slots_locked,
                        stable_dual_frames,
                    )
                    frame_athletes = self._build_frame_athletes(assignments, slot_memory, player_stats)

                    if frame_athletes:
                        pose_sequence.append(
                            {
                                "frame_index": frame_idx,
                                "timestamp": frame_idx / fps if fps > 0 else 0,
                                "athletes": frame_athletes,
                            }
                        )
                        processed_frames += 1

                    if processed_frames and processed_frames % 10 == 0:
                        print(f"Processed {processed_frames} pose frames...")

                frame_idx += 1
        finally:
            close = getattr(landmarker, "close", None)
            if callable(close):
                close()
            cap.release()

        pose_data_path = self._get_pose_data_path(video_id)
        analysis_result = {
            "video_id": video_id,
            "video_path": video_path,
            "analysis_type": "pose",
            "timestamp": datetime.now().isoformat(),
            "schema_version": SCHEMA_VERSION,
            "detector_info": {
                "provider": "mediapipe-tasks",
                "model": "pose_landmarker_heavy",
                "num_poses": POSE_LANDMARKER_NUM_POSES,
                "model_asset": self.model_path.name if self.model_path else POSE_LANDMARKER_NAME,
            },
            "video_properties": {
                "fps": fps,
                "frame_count": frame_count,
                "width": width,
                "height": height,
                "duration": duration,
            },
            "processing": {
                "sample_interval": effective_interval,
                "processed_frames": processed_frames,
                "total_frames": frame_count,
            },
            "players": self._summarize_players(player_stats, frame_count),
            "pose_sequence": pose_sequence,
            "pose_data_path": str(pose_data_path),
        }

        with open(pose_data_path, "w", encoding="utf-8") as file_handle:
            json.dump(analysis_result, file_handle, ensure_ascii=False, indent=2)

        print(f"Pose analysis complete. Processed {processed_frames} frames.")
        print(f"Pose data saved to: {pose_data_path}")
        return analysis_result

    def _draw_athlete_landmarks(self, frame: Any, athlete: dict[str, Any]) -> None:
        landmarks = athlete.get("landmarks", [])
        if not landmarks:
            return

        landmark_list = landmark_pb2.NormalizedLandmarkList()
        for landmark in landmarks:
            point = landmark_list.landmark.add()
            point.x = float(landmark.get("x", 0.0))
            point.y = float(landmark.get("y", 0.0))
            point.z = float(landmark.get("z", 0.0))
            point.visibility = float(landmark.get("visibility", 0.0))

        slot = athlete.get("slot", "left")
        connection_color, landmark_color = self.SLOT_COLORS.get(slot, self.SLOT_COLORS["left"])
        self.mp_drawing.draw_landmarks(
            frame,
            landmark_list,
            self.POSE_CONNECTIONS,
            landmark_drawing_spec=self.mp_drawing.DrawingSpec(color=landmark_color, thickness=2, circle_radius=2),
            connection_drawing_spec=self.mp_drawing.DrawingSpec(color=connection_color, thickness=3, circle_radius=2),
        )

    def generate_pose_overlay(
        self,
        video_path: str,
        video_id: str,
        pose_data: Optional[dict[str, Any]] = None,
        sample_interval: int = 5,
        output_format: str = "mp4",
    ) -> str:
        del sample_interval, output_format

        if pose_data is None:
            pose_data = self.get_pose_data(video_id)
            if pose_data is None:
                pose_data = self.analyze_pose(video_path, video_id)

        normalized_pose_data = self.normalize_pose_data(pose_data)
        pose_by_frame = {
            frame["frame_index"]: frame for frame in normalized_pose_data.get("pose_sequence", [])
        }

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        output_path = self._get_overlay_video_path(video_id)
        raw_output_path = output_path.with_name(f"{output_path.stem}.raw.mp4")
        if raw_output_path.exists():
            raw_output_path.unlink()
        if output_path.exists():
            output_path.unlink()

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(str(raw_output_path), fourcc, fps, (width, height))
        if not out.isOpened():
            cap.release()
            raise ValueError(f"Cannot create overlay video at {raw_output_path}")

        frame_idx = 0
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                pose_frame = pose_by_frame.get(frame_idx)
                if pose_frame:
                    for athlete in pose_frame.get("athletes", []):
                        self._draw_athlete_landmarks(frame, athlete)

                out.write(frame)
                frame_idx += 1
        finally:
            cap.release()
            out.release()

        if not self._transcode_overlay_for_web(raw_output_path, output_path):
            raw_output_path.replace(output_path)
        elif raw_output_path.exists():
            raw_output_path.unlink()

        print(f"Pose overlay video saved to: {output_path}")
        return str(output_path)

    def get_pose_data(self, video_id: str) -> Optional[dict[str, Any]]:
        pose_data_path = self._get_pose_data_path(video_id)
        if not pose_data_path.exists():
            return None

        with open(pose_data_path, encoding="utf-8") as file_handle:
            raw_pose_data = json.load(file_handle)
        return self.normalize_pose_data(raw_pose_data)

    def get_overlay_path(self, video_id: str) -> Optional[str]:
        overlay_path = self._get_overlay_video_path(video_id)
        if overlay_path.exists() and self._is_browser_compatible_overlay(overlay_path):
            return str(overlay_path)
        return None

    def delete_analysis_assets(self, video_id: str) -> dict[str, Any]:
        video_analysis_dir = self.analysis_dir / video_id
        removed = False
        try:
            if video_analysis_dir.exists():
                shutil.rmtree(video_analysis_dir)
                removed = True
        except OSError:
            removed = False

        return {
            "video_id": video_id,
            "deleted_analysis_dir": removed,
        }


pose_analysis_service = PoseAnalysisService()
