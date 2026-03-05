"""
Pose Analysis Service using MediaPipe.

This service provides human pose detection and visualization for fencing videos.
"""

import os
import json
import cv2
import numpy as np
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
import mediapipe as mp
from mediapipe.framework.formats import landmark_pb2

from app.core.config import settings


class PoseAnalysisService:
    """Service for detecting and analyzing human pose in videos."""

    # MediaPipe Pose landmark indices
    # https://google.github.io/mediapipe/solutions/pose.html
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
        "left_foot_index", "right_foot_index"
    ]

    # Connections for drawing skeleton
    POSE_CONNECTIONS = [
        # Face
        (0, 1), (0, 2), (1, 3), (2, 4),
        (4, 6), (3, 5), (5, 6),
        (9, 10),
        # Body
        (11, 12),  # Shoulders
        (11, 13), (13, 15),  # Left arm
        (15, 17), (15, 19), (15, 21), (17, 19),  # Left wrist
        (12, 14), (14, 16),  # Right arm
        (16, 18), (16, 20), (16, 22), (18, 20),  # Right wrist
        (11, 23), (12, 24),  # Torso
        (23, 24),
        (23, 25), (25, 27),  # Left leg
        (27, 29), (27, 31), (29, 31),
        (24, 26), (26, 28),  # Right leg
        (28, 30), (28, 32), (30, 32)
    ]

    def __init__(self):
        self.upload_dir = Path(settings.VIDEO_UPLOAD_DIR)
        self.analysis_dir = self.upload_dir / "analyses"
        self.analysis_dir.mkdir(parents=True, exist_ok=True)

        # Initialize MediaPipe Pose
        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles

        # Pose detection parameters optimized for fencing
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=2,  # Most accurate model
            smooth_landmarks=True,
            enable_segmentation=False,
            smooth_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    def _get_analysis_dir(self, video_id: str) -> Path:
        """Get the analysis directory for a video."""
        video_analysis_dir = self.analysis_dir / video_id / "pose"
        video_analysis_dir.mkdir(parents=True, exist_ok=True)
        return video_analysis_dir

    def _get_pose_data_path(self, video_id: str) -> Path:
        """Get the path for pose data JSON file."""
        return self._get_analysis_dir(video_id) / "pose_data.json"

    def _get_overlay_video_path(self, video_id: str) -> Path:
        """Get the path for pose overlay video."""
        return self._get_analysis_dir(video_id) / "pose_overlay.mp4"

    def analyze_pose(
        self,
        video_path: str,
        video_id: str,
        sample_interval: int = 5
    ) -> Dict[str, Any]:
        """
        Analyze pose in a video file.

        Args:
            video_path: Path to the video file
            video_id: Unique identifier for the video
            sample_interval: Process every N frames (default 5 for performance)

        Returns:
            Dictionary containing analysis results and paths
        """
        # Open video with proper resource cleanup
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        try:
            # Get video properties
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0

            # Process frames
            pose_sequence = []
            frame_idx = 0
            processed_frames = 0

            print(f"Processing video: {video_path}")
            print(f"Total frames: {frame_count}, FPS: {fps}, Duration: {duration:.2f}s")

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Process every Nth frame
                if frame_idx % sample_interval == 0:
                    # Convert to RGB for MediaPipe
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                    # Detect pose
                    results = self.pose.process(rgb_frame)

                    if results.pose_landmarks:
                        # Extract landmark data
                        landmarks = results.pose_landmarks.landmark
                        pose_data = {
                            "frame_index": frame_idx,
                            "timestamp": frame_idx / fps if fps > 0 else 0,
                            "landmarks": [
                                {
                                    "name": self.LANDMARK_NAMES[i] if i < len(self.LANDMARK_NAMES) else f"landmark_{i}",
                                    "x": lm.x,
                                    "y": lm.y,
                                    "z": lm.z,
                                    "visibility": lm.visibility
                                }
                                for i, lm in enumerate(landmarks)
                            ]
                        }
                        pose_sequence.append(pose_data)
                        processed_frames += 1

                    # Print progress
                    if processed_frames % 10 == 0:
                        print(f"Processed {processed_frames} frames...")

                frame_idx += 1
        finally:
            cap.release()

        # Save pose data
        pose_data_path = self._get_pose_data_path(video_id)
        analysis_result = {
            "video_id": video_id,
            "video_path": video_path,
            "analysis_type": "pose",
            "timestamp": datetime.now().isoformat(),
            "video_properties": {
                "fps": fps,
                "frame_count": frame_count,
                "width": width,
                "height": height,
                "duration": duration
            },
            "processing": {
                "sample_interval": sample_interval,
                "processed_frames": processed_frames,
                "total_frames": frame_count
            },
            "pose_sequence": pose_sequence,
            "pose_data_path": str(pose_data_path)
        }

        with open(pose_data_path, "w", encoding="utf-8") as f:
            json.dump(analysis_result, f, indent=2)

        print(f"Pose analysis complete. Processed {processed_frames} frames.")
        print(f"Pose data saved to: {pose_data_path}")

        return analysis_result

    def generate_pose_overlay(
        self,
        video_path: str,
        video_id: str,
        pose_data: Optional[Dict[str, Any]] = None,
        sample_interval: int = 5,
        output_format: str = "mp4"
    ) -> str:
        """
        Generate a video with pose skeleton overlay.

        Args:
            video_path: Path to the input video
            video_id: Unique identifier for the video
            pose_data: Pre-computed pose data (if None, will run detection)
            sample_interval: Process every N frames
            output_format: Output format (mp4, avi)

        Returns:
            Path to the generated overlay video
        """
        # Load pose data if not provided
        if pose_data is None:
            pose_data_path = self._get_pose_data_path(video_id)
            if pose_data_path.exists():
                with open(pose_data_path, encoding="utf-8") as f:
                    pose_data = json.load(f)
            else:
                # Run pose analysis first
                pose_data = self.analyze_pose(video_path, video_id, sample_interval)

        # Create pose index for quick lookup
        pose_by_frame = {
            p["frame_index"]: p for p in pose_data.get("pose_sequence", [])
        }

        # Open input video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Setup video writer
        output_path = self._get_overlay_video_path(video_id)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Check if we have pose data for this frame
            if frame_idx in pose_by_frame:
                pose_frame = pose_by_frame[frame_idx]

                # Convert landmarks to MediaPipe format
                landmarks = pose_frame["landmarks"]
                landmark_list = landmark_pb2.NormalizedLandmarkList()

                for lm in landmarks:
                    landmark = landmark_list.landmark.add()
                    landmark.x = lm["x"]
                    landmark.y = lm["y"]
                    landmark.z = lm.get("z", 0)
                    landmark.visibility = lm.get("visibility", 1.0)

                # Draw pose on frame
                self.mp_drawing.draw_landmarks(
                    frame,
                    landmark_list,
                    self.mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=self.mp_drawing_styles.get_default_pose_landmarks_style()
                )

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

        print(f"Pose overlay video saved to: {output_path}")
        return str(output_path)

    def get_pose_data(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get pose analysis data for a video."""
        pose_data_path = self._get_pose_data_path(video_id)
        if pose_data_path.exists():
            with open(pose_data_path, encoding="utf-8") as f:
                return json.load(f)
        return None

    def get_overlay_path(self, video_id: str) -> Optional[str]:
        """Get the path to the pose overlay video."""
        overlay_path = self._get_overlay_video_path(video_id)
        if overlay_path.exists():
            return str(overlay_path)
        return None

    def compute_fencing_metrics(self, pose_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute fencing-specific metrics from pose data.

        Args:
            pose_data: The pose analysis data

        Returns:
            Dictionary with computed metrics
        """
        pose_sequence = pose_data.get("pose_sequence", [])
        if not pose_sequence:
            return {}

        metrics = {
            "frame_count": len(pose_sequence),
            "avg_visibility": 0,
            "movement_metrics": {}
        }

        # Compute average visibility
        all_visibilities = []
        for frame in pose_sequence:
            for lm in frame.get("landmarks", []):
                all_visibilities.append(lm.get("visibility", 0))

        if all_visibilities:
            metrics["avg_visibility"] = sum(all_visibilities) / len(all_visibilities)

        # Compute movement metrics (simplified)
        # Calculate vertical movement (likely lunging)
        if len(pose_sequence) >= 2:
            shoulder_y_values = []
            ankle_y_values = []

            for frame in pose_sequence:
                # Find left shoulder (index 11) and right shoulder (index 12)
                for lm in frame.get("landmarks", []):
                    if lm.get("name") == "left_shoulder":
                        shoulder_y_values.append(lm.get("y", 0))
                    elif lm.get("name") == "left_ankle":
                        ankle_y_values.append(lm.get("y", 0))

            if shoulder_y_values:
                metrics["movement_metrics"]["vertical_range"] = max(shoulder_y_values) - min(shoulder_y_values)

        return metrics


# Singleton instance
pose_analysis_service = PoseAnalysisService()
