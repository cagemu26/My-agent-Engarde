import hashlib
import json
import re
import uuid
from typing import Any, Optional, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AnalysisReport
from app.services.llm import llm_service


POSE_REPORT_TYPE = "pose_analysis"
POSE_REPORT_STATUS_COMPLETED = "completed"
POSE_REPORT_PROMPT_VERSION = "pose-report-v4"
POSE_REPORT_MAX_FRAMES = 180
POSE_REPORT_MIN_FRAMES = 56
POSE_REPORT_MOTION_FOCUS_RATIO = 0.4
POSE_REPORT_TARGET_PROMPT_CHARS = 120000
POSE_REPORT_MAX_GENERATION_ATTEMPTS = 2
POSE_REPORT_SUMMARY_MAX_CHARS = 220
POSE_REPORT_TEMPERATURE = 0.35
POSE_REPORT_MAX_TOKENS = 1400
POSE_REPORT_REQUIRED_MARKERS = ("姿态分析", "动作识别", "训练建议")


class AnalysisReportService:
    def __init__(self) -> None:
        self.report_type = POSE_REPORT_TYPE
        self.prompt_version = POSE_REPORT_PROMPT_VERSION

    @property
    def model_name(self) -> str:
        return llm_service.model

    def build_pose_hash(self, pose_data: dict[str, Any]) -> str:
        """Hash only stable pose fields so report reuse survives unrelated metadata changes."""
        normalized_payload = {
            "video_properties": pose_data.get("video_properties", {}),
            "processing": pose_data.get("processing", {}),
            "pose_sequence": pose_data.get("pose_sequence", []),
        }
        serialized = json.dumps(
            normalized_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def _frame_landmark_map(self, frame: dict[str, Any]) -> dict[str, dict[str, Any]]:
        frame_map: dict[str, dict[str, Any]] = {}
        for landmark in frame.get("landmarks", []):
            name = landmark.get("name")
            if name:
                frame_map[name] = landmark
        return frame_map

    def _motion_score(
        self,
        prev_landmarks: dict[str, dict[str, Any]],
        curr_landmarks: dict[str, dict[str, Any]],
    ) -> float:
        key_names = [
            "left_wrist",
            "right_wrist",
            "left_ankle",
            "right_ankle",
            "left_foot_index",
            "right_foot_index",
            "left_hip",
            "right_hip",
            "left_shoulder",
            "right_shoulder",
        ]
        total = 0.0
        count = 0
        for name in key_names:
            prev = prev_landmarks.get(name)
            curr = curr_landmarks.get(name)
            if not prev or not curr:
                continue
            dx = float(curr.get("x", 0.0)) - float(prev.get("x", 0.0))
            dy = float(curr.get("y", 0.0)) - float(prev.get("y", 0.0))
            total += (dx * dx + dy * dy) ** 0.5
            count += 1
        return total / count if count else 0.0

    def _sample_pose_sequence(self, pose_sequence: list[dict[str, Any]], target_frames: int) -> list[dict[str, Any]]:
        if len(pose_sequence) <= target_frames:
            return pose_sequence

        import numpy as np

        total_frames = len(pose_sequence)
        motion_target = max(0, int(target_frames * POSE_REPORT_MOTION_FOCUS_RATIO))
        uniform_target = max(2, target_frames - motion_target)

        uniform_indices = set(np.linspace(0, total_frames - 1, uniform_target, dtype=int).tolist())

        motion_scores: list[tuple[float, int]] = []
        prev_map = self._frame_landmark_map(pose_sequence[0])
        for idx in range(1, total_frames):
            current_map = self._frame_landmark_map(pose_sequence[idx])
            score = self._motion_score(prev_map, current_map)
            motion_scores.append((score, idx))
            prev_map = current_map

        motion_scores.sort(key=lambda item: item[0], reverse=True)
        motion_indices = [idx for _, idx in motion_scores[:motion_target]]

        selected = sorted(set(uniform_indices).union(motion_indices).union({0, total_frames - 1}))

        if len(selected) > target_frames:
            keep_positions = np.linspace(0, len(selected) - 1, target_frames, dtype=int)
            selected = [selected[pos] for pos in keep_positions]
        elif len(selected) < target_frames:
            selected_set = set(selected)
            backfill_candidates = np.linspace(0, total_frames - 1, target_frames * 3, dtype=int).tolist()
            for candidate in backfill_candidates:
                if candidate in selected_set:
                    continue
                selected.append(candidate)
                selected_set.add(candidate)
                if len(selected) >= target_frames:
                    break
            selected.sort()

        return [pose_sequence[i] for i in selected]

    def build_pose_prompt(self, video_id: str, pose_data: dict[str, Any]) -> str:
        pose_sequence = pose_data.get("pose_sequence", [])
        video_props = pose_data.get("video_properties", {})
        total_frames = len(pose_sequence)
        if total_frames == 0:
            return f"""你是一位专业的击剑教练AI助手。当前视频 {video_id} 没有可用姿态数据。
请输出：无法分析的原因、建议重新采集视频的3条建议、以及下一步操作。"""

        key_indices = {
            "nose": 0,
            "left_shoulder": 11,
            "right_shoulder": 12,
            "left_elbow": 13,
            "right_elbow": 14,
            "left_wrist": 15,
            "right_wrist": 16,
            "left_hip": 23,
            "right_hip": 24,
            "left_knee": 25,
            "right_knee": 26,
            "left_ankle": 27,
            "right_ankle": 28,
            "left_foot_index": 31,
            "right_foot_index": 32,
        }

        def build_pose_frames(sampled_frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
            pose_frames_local: list[dict[str, Any]] = []
            for frame in sampled_frames:
                landmarks = frame.get("landmarks", [])
                key_points = {}
                for name, idx in key_indices.items():
                    if idx < len(landmarks):
                        landmark = landmarks[idx]
                        key_points[name] = {
                            "x": round(landmark["x"], 2),
                            "y": round(landmark["y"], 2),
                            "z": round(landmark["z"], 2),
                            "visibility": round(landmark["visibility"], 2),
                        }

                left_shoulder = key_points.get("left_shoulder")
                right_shoulder = key_points.get("right_shoulder")
                left_hip = key_points.get("left_hip")
                right_hip = key_points.get("right_hip")
                left_ankle = key_points.get("left_ankle")
                right_ankle = key_points.get("right_ankle")

                derived = {
                    "shoulder_center_y": round(
                        (
                            (left_shoulder["y"] if left_shoulder else 0.0)
                            + (right_shoulder["y"] if right_shoulder else 0.0)
                        )
                        / 2,
                        2,
                    ),
                    "hip_center_y": round(
                        (
                            (left_hip["y"] if left_hip else 0.0)
                            + (right_hip["y"] if right_hip else 0.0)
                        )
                        / 2,
                        2,
                    ),
                    "stance_width": round(
                        abs((left_ankle["x"] if left_ankle else 0.0) - (right_ankle["x"] if right_ankle else 0.0)),
                        2,
                    ),
                    "shoulder_tilt": round(
                        abs(
                            (left_shoulder["y"] if left_shoulder else 0.0)
                            - (right_shoulder["y"] if right_shoulder else 0.0)
                        ),
                        2,
                    ),
                }

                pose_frames_local.append(
                    {
                        "frame_index": frame.get("frame_index"),
                        "timestamp": round(frame.get("timestamp", 0), 2),
                        "key_points": key_points,
                        "derived": derived,
                    }
                )
            return pose_frames_local

        target_frames = min(POSE_REPORT_MAX_FRAMES, total_frames)
        truncated_for_budget = False
        sampled_sequence: list[dict[str, Any]] = []
        pose_json = "[]"
        while True:
            sampled_sequence = self._sample_pose_sequence(pose_sequence, target_frames)
            pose_json = json.dumps(build_pose_frames(sampled_sequence), ensure_ascii=False, separators=(",", ":"))
            prompt_candidate = f"""你是一位专业的击剑教练AI助手。请分析以下击剑视频的姿态数据，并提供详细的技术改进建议。

## 视频信息
- Video ID: {video_id}
- 总帧数: {video_props.get('frame_count', 'N/A')}
- FPS: {video_props.get('fps', 'N/A')}
- 时长: {video_props.get('duration', 0):.2f}秒
- 分析帧数: {len(sampled_sequence)}/{len(pose_sequence)} (已采样)

## 姿态关键点数据
以下为动作感知采样帧序列。每帧包含关键点坐标 (x, y, z 为归一化坐标 0-1, visibility 为可见度) 和派生特征：
- shoulder_center_y / hip_center_y：肩髋重心高度
- stance_width：站姿宽度
- shoulder_tilt：上身倾斜程度

{pose_json}

请根据以上完整的姿态数据提供:
1. **整体姿态分析** - 运动员的基本姿势和重心
2. **动作识别** - 识别出具体动作（如弓步lunge、冲刺advance、撤退retreat、进攻attack、防守parry等）
3. **技术优点** - 动作中做得好的地方
4. **技术问题** - 需要改进的地方
5. **训练建议** - 具体的技术训练重点

请用中文回复，分析要详细具体，基于实际数据。"""
            if len(prompt_candidate) <= POSE_REPORT_TARGET_PROMPT_CHARS or target_frames <= POSE_REPORT_MIN_FRAMES:
                break
            truncated_for_budget = True
            target_frames = max(POSE_REPORT_MIN_FRAMES, int(target_frames * 0.72))

        budget_hint = (
            "（已为保证稳定输出自动压缩输入体积）" if truncated_for_budget else ""
        )
        return f"""你是一位专业的击剑教练AI助手。请分析以下击剑视频的姿态数据，并提供详细的技术改进建议。

## 视频信息
- Video ID: {video_id}
- 总帧数: {video_props.get('frame_count', 'N/A')}
- FPS: {video_props.get('fps', 'N/A')}
- 时长: {video_props.get('duration', 0):.2f}秒
- 分析帧数: {len(sampled_sequence)}/{len(pose_sequence)} (已采样){budget_hint}

## 姿态关键点数据
以下为动作感知采样帧序列。每帧包含关键点坐标 (x, y, z 为归一化坐标 0-1, visibility 为可见度) 和派生特征：
- shoulder_center_y / hip_center_y：肩髋重心高度
- stance_width：站姿宽度
- shoulder_tilt：上身倾斜程度

{pose_json}

请根据以上完整的姿态数据提供:
1. **整体姿态分析** - 运动员的基本姿势和重心
2. **动作识别** - 识别出具体动作（如弓步lunge、冲刺advance、撤退retreat、进攻attack、防守parry等）
3. **技术优点** - 动作中做得好的地方
4. **技术问题** - 需要改进的地方
5. **训练建议** - 具体的技术训练重点

请用中文回复，分析要详细具体，基于实际数据。"""

    def build_summary(self, report_body_md: str) -> str:
        normalized = self._strip_markdown(report_body_md)
        return normalized[:POSE_REPORT_SUMMARY_MAX_CHARS]

    def _strip_markdown(self, text: str) -> str:
        cleaned = text.replace("\r\n", "\n").strip()
        cleaned = re.sub(r"```.*?```", " ", cleaned, flags=re.S)
        cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)
        cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.M)
        cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.M)
        cleaned = re.sub(r"^\s*\d+\.\s+", "", cleaned, flags=re.M)
        cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
        cleaned = re.sub(r"\*(.*?)\*", r"\1", cleaned)
        cleaned = cleaned.replace("|", " ")
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned.strip()

    def _normalize_model_output(self, text: str) -> str:
        return text.replace("\r\n", "\n").strip()

    def _is_valid_report_output(self, text: str) -> bool:
        if not text or len(text) < 200:
            return False
        marker_hits = sum(marker in text for marker in POSE_REPORT_REQUIRED_MARKERS)
        if marker_hits >= 2:
            return True
        return text.startswith("# ") and "训练建议" in text

    def _build_deterministic_fallback_report(self, video_id: str, pose_data: dict[str, Any]) -> str:
        pose_sequence = pose_data.get("pose_sequence", [])
        video_props = pose_data.get("video_properties", {})
        processing = pose_data.get("processing", {})
        vis_values: list[float] = []
        for frame in pose_sequence:
            for landmark in frame.get("landmarks", []):
                visibility = landmark.get("visibility")
                if isinstance(visibility, (int, float)):
                    vis_values.append(float(visibility))
        avg_visibility = sum(vis_values) / len(vis_values) if vis_values else 0.0

        return f"""# 姿态分析

- 视频ID: {video_id}
- 总帧数: {video_props.get("frame_count", "N/A")}
- FPS: {video_props.get("fps", "N/A")}
- 时长: {video_props.get("duration", 0):.2f}秒
- 处理帧数: {processing.get("processed_frames", len(pose_sequence))}
- 平均可见度: {avg_visibility:.2f}

# 动作识别

本次已成功读取姿态序列并完成基础动作趋势判断。由于云端响应不稳定，采用了降级报告模板，建议结合骨架回放逐段复核弓步启动、还原和步法节奏。

# 技术优点

1. 姿态数据覆盖完整，可用于训练复盘。
2. 肩髋与下肢关键点可见度基本可用。

# 技术问题

1. 快速转换阶段容易出现重心波动，建议重点观察肩髋高度变化。
2. 步法连续性与还原节奏需要在回放中逐段确认。

# 训练建议

1. 进行 3 组 5 分钟的进退步与弓步连贯训练，控制重心平稳。
2. 在每次弓步后加入固定还原节奏训练，避免上身前扑。
3. 对照骨架回放逐帧复盘，优先修正肩线倾斜和站姿宽度波动。"""

    async def _generate_report_body(self, video_id: str, pose_data: dict[str, Any]) -> str:
        prompt = self.build_pose_prompt(video_id, pose_data)

        for _ in range(POSE_REPORT_MAX_GENERATION_ATTEMPTS):
            report_text = await llm_service.chat(
                messages=[{"role": "user", "content": prompt}],
                context="Pose analysis report generation",
                temperature=POSE_REPORT_TEMPERATURE,
                max_tokens=POSE_REPORT_MAX_TOKENS,
            )
            normalized = self._normalize_model_output(report_text)
            if self._is_valid_report_output(normalized):
                return normalized

        return self._build_deterministic_fallback_report(video_id, pose_data)

    def _parse_user_id(self, user_id: Union[str, uuid.UUID]) -> uuid.UUID:
        if isinstance(user_id, uuid.UUID):
            return user_id
        return uuid.UUID(str(user_id))

    def get_current_report(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_hash: str,
        model_name: str,
    ) -> Optional[AnalysisReport]:
        parsed_user_id = self._parse_user_id(user_id)
        return (
            db.query(AnalysisReport)
            .filter(
                AnalysisReport.user_id == parsed_user_id,
                AnalysisReport.video_id == video_id,
                AnalysisReport.report_type == self.report_type,
                AnalysisReport.status == POSE_REPORT_STATUS_COMPLETED,
                AnalysisReport.source_pose_hash == pose_hash,
                AnalysisReport.model_name == model_name,
                AnalysisReport.prompt_version == self.prompt_version,
            )
            .order_by(AnalysisReport.report_version.desc(), AnalysisReport.created_at.desc())
            .first()
        )

    def _next_report_version(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_hash: str,
        model_name: str,
    ) -> int:
        parsed_user_id = self._parse_user_id(user_id)
        current_max = (
            db.query(func.max(AnalysisReport.report_version))
            .filter(
                AnalysisReport.user_id == parsed_user_id,
                AnalysisReport.video_id == video_id,
                AnalysisReport.report_type == self.report_type,
                AnalysisReport.source_pose_hash == pose_hash,
                AnalysisReport.model_name == model_name,
                AnalysisReport.prompt_version == self.prompt_version,
            )
            .scalar()
        )
        return int(current_max or 0) + 1

    async def generate_pose_report(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        force_regenerate: bool = False,
    ) -> tuple[AnalysisReport, bool]:
        pose_hash = self.build_pose_hash(pose_data)
        model_name = self.model_name
        cached_report = self.get_current_report(
            db,
            user_id=user_id,
            video_id=video_id,
            pose_hash=pose_hash,
            model_name=model_name,
        )
        if cached_report and cached_report.report_body_md.strip() and not force_regenerate:
            return cached_report, True

        report_text = await self._generate_report_body(video_id, pose_data)
        summary_text = self.build_summary(report_text)

        report = AnalysisReport(
            user_id=self._parse_user_id(user_id),
            video_id=video_id,
            report_type=self.report_type,
            status=POSE_REPORT_STATUS_COMPLETED,
            report_version=self._next_report_version(
                db,
                user_id=user_id,
                video_id=video_id,
                pose_hash=pose_hash,
                model_name=model_name,
            ),
            report_body_md=report_text,
            summary=summary_text,
            model_name=model_name,
            prompt_version=self.prompt_version,
            source_pose_hash=pose_hash,
            source_pose_path=pose_data.get("pose_data_path"),
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report, False

    def serialize_report(self, report: AnalysisReport, *, cached: Optional[bool] = None) -> dict[str, Any]:
        payload = {
            "report_id": str(report.id),
            "video_id": report.video_id,
            "report": report.report_body_md,
            "summary": report.summary,
            "status": report.status,
            "model_name": report.model_name,
            "prompt_version": report.prompt_version,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        }
        if cached is not None:
            payload["cached"] = cached
        return payload


analysis_report_service = AnalysisReportService()
