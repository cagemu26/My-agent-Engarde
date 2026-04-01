import asyncio
import hashlib
import json
import logging
import re
import uuid
from typing import Any, Optional, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AnalysisReport
from app.services.llm import llm_service
from app.services.pose_analysis import pose_analysis_service


POSE_REPORT_TYPE = "pose_analysis"
POSE_REPORT_STATUS_COMPLETED = "completed"
POSE_REPORT_PROMPT_VERSION = "pose-report-v4"
POSE_REPORT_MAX_FRAMES = 180
POSE_REPORT_MIN_FRAMES = 56
POSE_REPORT_MOTION_FOCUS_RATIO = 0.4
POSE_REPORT_TARGET_PROMPT_CHARS = 42000
POSE_REPORT_MAX_GENERATION_ATTEMPTS = 2
POSE_REPORT_SUMMARY_MAX_CHARS = 220
POSE_REPORT_TEMPERATURE = 0.35
POSE_REPORT_MAX_TOKENS = 2800
POSE_REPORT_DEFAULT_SLOT = "left"
POSE_REPORT_VALID_SLOTS = {"left", "right"}
POSE_REPORT_SLOT_GENERATION_ORDER = ("left", "right")
POSE_REPORT_MIN_EFFECTIVE_FRAMES = 30
POSE_REPORT_STATUS_READY = "ready"
POSE_REPORT_STATUS_INSUFFICIENT = "insufficient_data"
POSE_REPORT_SECTION_MARKER_GROUPS = (
    ("姿态分析", "pose analysis", "technical analysis", "overall stance", "整体姿态", "整体评估", "技术分析", "站姿", "重心"),
    ("动作识别", "action recognition", "movement recognition", "动作分析", "动作模式", "动作特征", "movement pattern"),
    ("训练建议", "training recommendation", "training suggestion", "training plan", "改进建议", "训练重点", "训练方案", "下一步训练"),
)
POSE_REPORT_METADATA_HINTS = (
    "视频id",
    "video id",
    "分析对象",
    "analysis subject",
    "处理帧数",
    "frames analyzed",
)
POSE_REPORT_RECOMMENDATION_HINTS = (
    "训练建议",
    "改进建议",
    "训练重点",
    "训练方案",
    "建议",
    "训练",
)
POSE_REPORT_ISSUE_HINTS = (
    "技术问题",
    "主要问题",
    "需要改进",
    "改进点",
    "不足",
    "问题",
    "风险",
)
POSE_REPORT_STRENGTH_HINTS = (
    "技术优点",
    "优点",
    "亮点",
    "做得好的地方",
    "稳定点",
)
POSE_REPORT_MIN_VALID_CHARS = 800
POSE_REPORT_RETRY_MESSAGE = "分析失败，请重新分析。"
POSE_REPORT_LEGACY_FALLBACK_MARKERS = (
    "由于云端响应不稳定，采用了降级报告模板",
    "当前未检测到足够的",
)

logger = logging.getLogger(__name__)


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

    def _normalize_requested_slot(self, athlete_slot: Optional[str]) -> str:
        requested_slot = (athlete_slot or POSE_REPORT_DEFAULT_SLOT).strip().lower()
        if requested_slot not in POSE_REPORT_VALID_SLOTS:
            raise ValueError(f"Invalid athlete slot: {athlete_slot}")
        return requested_slot

    def _available_slots(self, pose_data: dict[str, Any]) -> list[str]:
        discovered_slots = pose_analysis_service.get_available_slots(pose_data)
        return [slot for slot in POSE_REPORT_SLOT_GENERATION_ORDER if slot in discovered_slots]

    def _resolve_athlete_slot(
        self,
        pose_data: dict[str, Any],
        athlete_slot: Optional[str],
        *,
        strict_availability: bool = True,
    ) -> str:
        requested_slot = self._normalize_requested_slot(athlete_slot)
        available_slots = self._available_slots(pose_data)
        if requested_slot in available_slots:
            return requested_slot
        if not available_slots:
            return requested_slot
        if strict_availability:
            if requested_slot != available_slots[0]:
                raise ValueError(f"{requested_slot.capitalize()} athlete data is not available for this video.")
            return available_slots[0]
        return requested_slot

    def _report_type_for_slot(
        self,
        pose_data: dict[str, Any],
        athlete_slot: str,
        *,
        force_slot_specific: bool = False,
    ) -> str:
        if force_slot_specific or len(self._available_slots(pose_data)) >= 2:
            return f"{POSE_REPORT_TYPE}_{athlete_slot}"
        return POSE_REPORT_TYPE

    def _build_insufficient_slot_pose_data(
        self,
        pose_data: dict[str, Any],
        athlete_slot: str,
        *,
        effective_frames: int,
    ) -> dict[str, Any]:
        normalized_processing = {
            **pose_data.get("processing", {}),
            "selected_athlete_slot": athlete_slot,
            "selected_athlete_track_id": athlete_slot,
            "data_status": POSE_REPORT_STATUS_INSUFFICIENT,
            "effective_frames": int(effective_frames),
            "min_required_frames": POSE_REPORT_MIN_EFFECTIVE_FRAMES,
            "available_slots": self._available_slots(pose_data),
        }
        return {
            "video_id": pose_data.get("video_id"),
            "video_path": pose_data.get("video_path"),
            "analysis_type": pose_data.get("analysis_type", "pose"),
            "timestamp": pose_data.get("timestamp"),
            "schema_version": pose_data.get("schema_version"),
            "detector_info": pose_data.get("detector_info", {}),
            "video_properties": pose_data.get("video_properties", {}),
            "processing": normalized_processing,
            "player_summary": None,
            "pose_sequence": [],
            "pose_data_path": pose_data.get("pose_data_path"),
        }

    def _prepare_slot_pose_data(
        self,
        pose_data: dict[str, Any],
        athlete_slot: str,
    ) -> tuple[dict[str, Any], str, int]:
        effective_frames = 0
        slot_pose_data: Optional[dict[str, Any]] = None
        available_slots = self._available_slots(pose_data)
        if athlete_slot in available_slots:
            try:
                slot_pose_data = pose_analysis_service.extract_slot_pose_data(pose_data, athlete_slot)
            except ValueError:
                slot_pose_data = None

        if slot_pose_data:
            effective_frames = len(slot_pose_data.get("pose_sequence", []))
            if effective_frames >= POSE_REPORT_MIN_EFFECTIVE_FRAMES:
                return slot_pose_data, POSE_REPORT_STATUS_READY, effective_frames

        insufficient_payload = self._build_insufficient_slot_pose_data(
            pose_data,
            athlete_slot,
            effective_frames=effective_frames,
        )
        return insufficient_payload, POSE_REPORT_STATUS_INSUFFICIENT, effective_frames

    def _serialize_slot_label(self, athlete_slot: Optional[str]) -> str:
        if athlete_slot == "right":
            return "Right Athlete"
        return "Left Athlete"

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
        selected_slot = str(pose_data.get("processing", {}).get("selected_athlete_slot", POSE_REPORT_DEFAULT_SLOT))
        slot_label = self._serialize_slot_label(selected_slot)
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
- 分析对象: {slot_label}
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
- 分析对象: {slot_label}
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

    def _is_legacy_fallback_report(self, report_body_md: str) -> bool:
        lowered = (report_body_md or "").lower()
        if not lowered:
            return False
        return any(marker.lower() in lowered for marker in POSE_REPORT_LEGACY_FALLBACK_MARKERS)

    def _count_marker_group_hits(self, normalized_text: str) -> int:
        lowered = normalized_text.lower()
        hits = 0
        for group in POSE_REPORT_SECTION_MARKER_GROUPS:
            if any(marker in lowered for marker in group):
                hits += 1
        return hits

    def _contains_report_metadata(self, normalized_text: str) -> bool:
        lowered = normalized_text.lower()
        return any(marker in lowered for marker in POSE_REPORT_METADATA_HINTS)

    def _is_valid_report_output(self, text: str) -> bool:
        if not text or len(text) < POSE_REPORT_MIN_VALID_CHARS:
            return False

        normalized = self._normalize_model_output(text)
        lowered = normalized.lower()
        marker_hits = self._count_marker_group_hits(normalized)
        has_markdown_header = normalized.lstrip().startswith("#")
        has_metadata_hint = self._contains_report_metadata(normalized)
        has_training_section = any(marker in lowered for marker in POSE_REPORT_SECTION_MARKER_GROUPS[2])
        has_recommendation_hint = any(marker in normalized for marker in POSE_REPORT_RECOMMENDATION_HINTS)
        has_issue_hint = any(marker in normalized for marker in POSE_REPORT_ISSUE_HINTS)
        has_strength_hint = any(marker in normalized for marker in POSE_REPORT_STRENGTH_HINTS)
        structured_blocks = len(re.findall(r"(^|\n)\s*(?:#+\s+|\d+[.)、]|[-*]\s+)", normalized))

        if marker_hits >= 2:
            return True
        if (
            (has_markdown_header or structured_blocks >= 3)
            and has_training_section
            and (has_issue_hint or has_strength_hint or has_metadata_hint or marker_hits >= 1)
            and has_recommendation_hint
        ):
            return True
        return False

    async def _generate_report_body(self, video_id: str, pose_data: dict[str, Any]) -> str:
        prompt = self.build_pose_prompt(video_id, pose_data)
        selected_slot = str(pose_data.get("processing", {}).get("selected_athlete_slot", POSE_REPORT_DEFAULT_SLOT))

        for attempt in range(1, POSE_REPORT_MAX_GENERATION_ATTEMPTS + 1):
            report_text = await llm_service.chat(
                messages=[{"role": "user", "content": prompt}],
                context="Pose analysis report generation",
                temperature=POSE_REPORT_TEMPERATURE,
                max_tokens=POSE_REPORT_MAX_TOKENS,
                response_language_override="zh",
            )
            normalized = self._normalize_model_output(report_text)
            if self._is_valid_report_output(normalized):
                logger.info(
                    "analysis_report_llm_success video_id=%s slot=%s attempt=%s prompt_chars=%s output_chars=%s",
                    video_id,
                    selected_slot,
                    attempt,
                    len(prompt),
                    len(normalized),
                )
                return normalized
            logger.warning(
                "analysis_report_llm_invalid video_id=%s slot=%s attempt=%s prompt_chars=%s output_chars=%s marker_hits=%s",
                video_id,
                selected_slot,
                attempt,
                len(prompt),
                len(normalized),
                self._count_marker_group_hits(normalized),
            )

        logger.error(
            "analysis_report_llm_failed video_id=%s slot=%s attempts=%s prompt_chars=%s",
            video_id,
            selected_slot,
            POSE_REPORT_MAX_GENERATION_ATTEMPTS,
            len(prompt),
        )
        raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)

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
        report_type: str,
        pose_hash: str,
        model_name: str,
    ) -> Optional[AnalysisReport]:
        parsed_user_id = self._parse_user_id(user_id)
        return (
            db.query(AnalysisReport)
            .filter(
                AnalysisReport.user_id == parsed_user_id,
                AnalysisReport.video_id == video_id,
                AnalysisReport.report_type == report_type,
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
        report_type: str,
        pose_hash: str,
        model_name: str,
    ) -> int:
        parsed_user_id = self._parse_user_id(user_id)
        current_max = (
            db.query(func.max(AnalysisReport.report_version))
            .filter(
                AnalysisReport.user_id == parsed_user_id,
                AnalysisReport.video_id == video_id,
                AnalysisReport.report_type == report_type,
                AnalysisReport.source_pose_hash == pose_hash,
                AnalysisReport.model_name == model_name,
                AnalysisReport.prompt_version == self.prompt_version,
            )
            .scalar()
        )
        return int(current_max or 0) + 1

    def _preferred_slot_for_default(self, pose_data: dict[str, Any]) -> str:
        available_slots = self._available_slots(pose_data)
        if POSE_REPORT_DEFAULT_SLOT in available_slots:
            return POSE_REPORT_DEFAULT_SLOT
        if available_slots:
            return available_slots[0]
        return POSE_REPORT_DEFAULT_SLOT

    async def _generate_or_get_slot_report(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        athlete_slot: str,
        force_regenerate: bool,
        force_slot_specific_type: bool,
    ) -> tuple[AnalysisReport, bool, str]:
        slot_pose_data, data_status, effective_frames = self._prepare_slot_pose_data(pose_data, athlete_slot)
        pose_hash = self.build_pose_hash(slot_pose_data)
        model_name = self.model_name
        report_type = self._report_type_for_slot(
            pose_data,
            athlete_slot,
            force_slot_specific=force_slot_specific_type,
        )
        cached_report = self.get_current_report(
            db,
            user_id=user_id,
            video_id=video_id,
            report_type=report_type,
            pose_hash=pose_hash,
            model_name=model_name,
        )
        if (
            cached_report
            and cached_report.report_body_md.strip()
            and not self._is_legacy_fallback_report(cached_report.report_body_md)
            and not force_regenerate
        ):
            return cached_report, True, athlete_slot

        if data_status == POSE_REPORT_STATUS_READY:
            report_text = await self._generate_report_body(video_id, slot_pose_data)
        else:
            logger.warning(
                "analysis_report_insufficient_pose_data video_id=%s slot=%s effective_frames=%s min_required=%s",
                video_id,
                athlete_slot,
                effective_frames,
                POSE_REPORT_MIN_EFFECTIVE_FRAMES,
            )
            raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)
        summary_text = self.build_summary(report_text)

        report = AnalysisReport(
            user_id=self._parse_user_id(user_id),
            video_id=video_id,
            report_type=report_type,
            status=POSE_REPORT_STATUS_COMPLETED,
            report_version=self._next_report_version(
                db,
                user_id=user_id,
                video_id=video_id,
                report_type=report_type,
                pose_hash=pose_hash,
                model_name=model_name,
            ),
            report_body_md=report_text,
            summary=summary_text,
            model_name=model_name,
            prompt_version=self.prompt_version,
            source_pose_hash=pose_hash,
            source_pose_path=slot_pose_data.get("pose_data_path"),
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report, False, athlete_slot

    async def _generate_or_get_dual_slot_reports_parallel(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        force_regenerate: bool,
    ) -> list[tuple[AnalysisReport, bool, str]]:
        slot_states: dict[str, dict[str, Any]] = {}
        ready_slots_for_llm: list[str] = []
        model_name = self.model_name

        for slot in POSE_REPORT_SLOT_GENERATION_ORDER:
            slot_pose_data, data_status, effective_frames = self._prepare_slot_pose_data(pose_data, slot)
            pose_hash = self.build_pose_hash(slot_pose_data)
            report_type = self._report_type_for_slot(
                pose_data,
                slot,
                force_slot_specific=True,
            )
            cached_report = self.get_current_report(
                db,
                user_id=user_id,
                video_id=video_id,
                report_type=report_type,
                pose_hash=pose_hash,
                model_name=model_name,
            )
            if (
                cached_report
                and cached_report.report_body_md.strip()
                and not self._is_legacy_fallback_report(cached_report.report_body_md)
                and not force_regenerate
            ):
                slot_states[slot] = {
                    "cached_report": cached_report,
                    "cached": True,
                    "slot_pose_data": slot_pose_data,
                    "pose_hash": pose_hash,
                    "report_type": report_type,
                    "data_status": data_status,
                    "effective_frames": effective_frames,
                }
                continue

            slot_states[slot] = {
                "cached_report": None,
                "cached": False,
                "slot_pose_data": slot_pose_data,
                "pose_hash": pose_hash,
                "report_type": report_type,
                "data_status": data_status,
                "effective_frames": effective_frames,
            }
            if data_status == POSE_REPORT_STATUS_READY:
                ready_slots_for_llm.append(slot)

        insufficient_slots = [
            slot
            for slot, state in slot_states.items()
            if state["cached_report"] is None and state["data_status"] != POSE_REPORT_STATUS_READY
        ]
        if insufficient_slots:
            logger.warning(
                "analysis_report_insufficient_pose_data_multi video_id=%s slots=%s",
                video_id,
                ",".join(insufficient_slots),
            )
            raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)

        llm_text_by_slot: dict[str, str] = {}
        if ready_slots_for_llm:
            llm_responses = await asyncio.gather(
                *[
                    self._generate_report_body(video_id, slot_states[slot]["slot_pose_data"])
                    for slot in ready_slots_for_llm
                ],
                return_exceptions=True,
            )
            for slot, response in zip(ready_slots_for_llm, llm_responses):
                if isinstance(response, Exception):
                    logger.warning(
                        "analysis_report_llm_slot_failed video_id=%s slot=%s error=%s",
                        video_id,
                        slot,
                        str(response),
                    )
                    raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)
                llm_text_by_slot[slot] = response

        persisted_results: dict[str, tuple[AnalysisReport, bool, str]] = {}
        for slot in POSE_REPORT_SLOT_GENERATION_ORDER:
            state = slot_states[slot]
            if state["cached_report"] is not None:
                persisted_results[slot] = (state["cached_report"], True, slot)
                continue

            if state["data_status"] == POSE_REPORT_STATUS_READY:
                report_text = llm_text_by_slot.get(slot)
                if not report_text:
                    raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)
            else:
                raise RuntimeError(POSE_REPORT_RETRY_MESSAGE)
            summary_text = self.build_summary(report_text)

            report = AnalysisReport(
                user_id=self._parse_user_id(user_id),
                video_id=video_id,
                report_type=state["report_type"],
                status=POSE_REPORT_STATUS_COMPLETED,
                report_version=self._next_report_version(
                    db,
                    user_id=user_id,
                    video_id=video_id,
                    report_type=state["report_type"],
                    pose_hash=state["pose_hash"],
                    model_name=model_name,
                ),
                report_body_md=report_text,
                summary=summary_text,
                model_name=model_name,
                prompt_version=self.prompt_version,
                source_pose_hash=state["pose_hash"],
                source_pose_path=state["slot_pose_data"].get("pose_data_path"),
            )
            db.add(report)
            db.commit()
            db.refresh(report)
            persisted_results[slot] = (report, False, slot)

        return [persisted_results[slot] for slot in POSE_REPORT_SLOT_GENERATION_ORDER]

    async def generate_pose_reports(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        athlete_slot: Optional[str] = None,
        force_regenerate: bool = False,
    ) -> list[tuple[AnalysisReport, bool, str]]:
        if athlete_slot:
            requested_slot = self._resolve_athlete_slot(
                pose_data,
                athlete_slot,
                strict_availability=False,
            )
            one_report = await self._generate_or_get_slot_report(
                db,
                user_id=user_id,
                video_id=video_id,
                pose_data=pose_data,
                athlete_slot=requested_slot,
                force_regenerate=force_regenerate,
                force_slot_specific_type=True,
            )
            return [one_report]

        return await self._generate_or_get_dual_slot_reports_parallel(
            db,
            user_id=user_id,
            video_id=video_id,
            pose_data=pose_data,
            force_regenerate=force_regenerate,
        )

    def get_report_for_slot(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        athlete_slot: Optional[str],
    ) -> tuple[Optional[AnalysisReport], str]:
        requested_slot = (
            self._resolve_athlete_slot(pose_data, athlete_slot, strict_availability=False)
            if athlete_slot
            else self._preferred_slot_for_default(pose_data)
        )
        slot_pose_data, _, _ = self._prepare_slot_pose_data(pose_data, requested_slot)
        pose_hash = self.build_pose_hash(slot_pose_data)
        model_name = self.model_name

        candidate_report_types: list[str] = [
            self._report_type_for_slot(
                pose_data,
                requested_slot,
                force_slot_specific=True,
            )
        ]

        # Backward compatibility: older reports may use unsuffixed report_type.
        if athlete_slot is None or requested_slot == POSE_REPORT_DEFAULT_SLOT:
            candidate_report_types.append(POSE_REPORT_TYPE)

        deduped_types: list[str] = []
        for report_type in candidate_report_types:
            if report_type not in deduped_types:
                deduped_types.append(report_type)

        for report_type in deduped_types:
            report = self.get_current_report(
                db,
                user_id=user_id,
                video_id=video_id,
                report_type=report_type,
                pose_hash=pose_hash,
                model_name=model_name,
            )
            if report and not self._is_legacy_fallback_report(report.report_body_md):
                return report, requested_slot

        return None, requested_slot

    async def generate_pose_report(
        self,
        db: Session,
        *,
        user_id: Union[str, uuid.UUID],
        video_id: str,
        pose_data: dict[str, Any],
        athlete_slot: Optional[str] = None,
        force_regenerate: bool = False,
    ) -> tuple[AnalysisReport, bool, str]:
        reports = await self.generate_pose_reports(
            db,
            user_id=user_id,
            video_id=video_id,
            pose_data=pose_data,
            athlete_slot=athlete_slot,
            force_regenerate=force_regenerate,
        )
        if athlete_slot:
            return reports[0]

        slot_results = {slot: report_tuple for report_tuple in reports for slot in [report_tuple[2]]}
        preferred_slot = self._preferred_slot_for_default(pose_data)
        return slot_results.get(preferred_slot, slot_results[POSE_REPORT_DEFAULT_SLOT])

    def serialize_report(
        self,
        report: AnalysisReport,
        *,
        athlete_slot: Optional[str] = None,
        cached: Optional[bool] = None,
    ) -> dict[str, Any]:
        resolved_slot = athlete_slot
        if resolved_slot is None and report.report_type.startswith(f"{POSE_REPORT_TYPE}_"):
            resolved_slot = report.report_type.replace(f"{POSE_REPORT_TYPE}_", "", 1)
        if resolved_slot is None:
            resolved_slot = POSE_REPORT_DEFAULT_SLOT

        payload = {
            "report_id": str(report.id),
            "video_id": report.video_id,
            "athlete_slot": resolved_slot,
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
