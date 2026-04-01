from datetime import datetime
import json
import logging
from pathlib import Path
import re
from typing import Any, AsyncIterator, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import verify_token
from app.core.config import settings
from app.core.database import get_db
from app.models import AnalysisReport, ChatMessage as ChatMessageModel, ChatSession, User
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ChatSessionCreateRequest,
    ChatSessionDeleteResponse,
    ChatSessionDetailResponse,
    ChatSessionListResponse,
    ChatSessionMessageResponse,
    ChatSessionResponse,
    Citation,
    RetrievalMeta,
)
from app.services.pose_analysis import pose_analysis_service
from app.services.rag import rag_service
from app.services.video import video_service


router = APIRouter(tags=["chat"])
security_optional = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

# Skills directory path
SKILLS_DIR = Path(__file__).parent.parent / "skills"
LLM_REQUEST_TIMEOUT_SECONDS = 120.0
# MiniMax M2.7 supports a 204800-token combined input/output window. The app
# still budgets by characters, so keep a safety margin instead of sending the
# full theoretical limit.
MAX_CONTEXT_CHARS = settings.LLM_MAX_CONTEXT_CHARS
MAX_SINGLE_MESSAGE_CHARS = settings.LLM_MAX_SINGLE_MESSAGE_CHARS
MAX_TOTAL_MESSAGES_CHARS = settings.LLM_MAX_TOTAL_MESSAGES_CHARS
MAX_SESSION_HISTORY_MESSAGES = settings.LLM_MAX_SESSION_HISTORY_MESSAGES
MAX_CONTEXT_SUMMARY_CHARS = 2200
SESSION_TYPE_VIDEO = "video_analysis"
SESSION_TYPE_TRAINING = "training_analysis"
SESSION_TYPE_CHAT = "chat_qa"
VALID_SESSION_TYPES = {SESSION_TYPE_VIDEO, SESSION_TYPE_TRAINING, SESSION_TYPE_CHAT}


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token = credentials.credentials if credentials else None
    if not token:
        return None

    payload = verify_token(token)
    if payload is None:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    require_verified = getattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    if require_verified and not user.email_verified:
        return None
    return user


def get_current_user_required(
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return current_user


def _clean_optional_text(value: Optional[str], max_chars: int) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:max_chars]


def _normalize_session_type(session_type: Optional[str]) -> str:
    value = (session_type or SESSION_TYPE_CHAT).strip().lower()
    if value not in VALID_SESSION_TYPES:
        return SESSION_TYPE_CHAT
    return value


def _extract_user_message(request: ChatRequest) -> str:
    if request.message and request.message.strip():
        return request.message.strip()

    for message in reversed(request.messages):
        if message.role == "user" and message.content.strip():
            return message.content.strip()
    return ""


def _parse_session_uuid(session_id: str) -> UUID:
    try:
        return UUID(session_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id",
        ) from exc


def _get_session_for_user(db: Session, current_user: User, session_id: str) -> ChatSession:
    session_uuid = _parse_session_uuid(session_id)
    chat_session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_uuid,
            ChatSession.user_id == current_user.id,
            ChatSession.is_archived.is_(False),
        )
        .first()
    )
    if chat_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return chat_session


def _message_count_map(db: Session, session_ids: list[UUID]) -> dict[UUID, int]:
    if not session_ids:
        return {}
    rows = (
        db.query(ChatMessageModel.session_id, func.count(ChatMessageModel.id))
        .filter(ChatMessageModel.session_id.in_(session_ids))
        .group_by(ChatMessageModel.session_id)
        .all()
    )
    return {session_id: int(count) for session_id, count in rows}


def _serialize_session(chat_session: ChatSession, message_count: int) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=str(chat_session.id),
        video_id=chat_session.video_id,
        session_type=chat_session.session_type or SESSION_TYPE_CHAT,
        title=chat_session.title,
        context_summary=chat_session.context_summary,
        created_at=chat_session.created_at,
        updated_at=chat_session.updated_at,
        last_message_at=chat_session.last_message_at,
        message_count=message_count,
    )


def _serialize_session_message(message: ChatMessageModel) -> ChatSessionMessageResponse:
    return ChatSessionMessageResponse(
        id=str(message.id),
        role=message.role,
        content=message.content,
        created_at=message.created_at,
    )


def _load_system_prompt() -> str:
    """Load system prompt from skills directory"""
    system_prompt_file = SKILLS_DIR / "system_prompt" / "base.md"
    if system_prompt_file.exists():
        with open(system_prompt_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    return _get_default_system_prompt()


def _load_training_knowledge() -> str:
    """Load training management knowledge from skills directory"""
    knowledge_file = SKILLS_DIR / "knowledge" / "training.md"
    if knowledge_file.exists():
        with open(knowledge_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    return ""


def _load_technique_tactics_knowledge() -> str:
    """Load technique and tactics knowledge from skills directory"""
    knowledge_file = SKILLS_DIR / "knowledge" / "technique_tactics.md"
    if knowledge_file.exists():
        with open(knowledge_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    return ""


def _get_default_system_prompt() -> str:
    """Default system prompt if file not found"""
    return """You are Engarde AI, an expert fencing coach and AI assistant.

You have deep knowledge of:
- All three weapons: Foil, Épée, and Sabre
- Fencing techniques: footwork, blade work, attacks, parries, ripostes
- Training methods and drills
- Competition strategy and tactics
- Fencing rules

Your role is to help fencers improve through:
- Technique explanations
- Training recommendations
- Strategy and tactical advice
- Video analysis feedback
- Answering questions about fencing

Always provide clear, actionable advice. Use numbered lists."""


class LLMService:
    def __init__(self):
        self.api_key = settings.MINIMAX_API_KEY
        self.base_url = settings.MINIMAX_BASE_URL
        self.model = (settings.MINIMAX_MODEL or "MiniMax-M2.7").strip() or "MiniMax-M2.7"
        self.max_completion_tokens = max(1, int(settings.LLM_MAX_COMPLETION_TOKENS))
        # Load and cache all knowledge files at initialization
        self.system_prompt = _load_system_prompt()
        self.training_knowledge = _load_training_knowledge()
        self.technique_tactics_knowledge = _load_technique_tactics_knowledge()
        # Cache response templates
        self._response_templates = self._load_all_templates()

    def _build_generation_payload(
        self,
        *,
        api_messages: list[dict[str, Any]],
        temperature: float,
        max_tokens: int,
        stream: bool = False,
        legacy_max_tokens: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": api_messages,
            "temperature": temperature,
        }
        if stream:
            payload["stream"] = True
        if legacy_max_tokens:
            payload["max_tokens"] = max_tokens
        else:
            payload["max_completion_tokens"] = max_tokens
        return payload

    def _should_retry_with_legacy_max_tokens(self, status_code: int, body: str) -> bool:
        if status_code not in {400, 422}:
            return False
        lowered = (body or "").lower()
        return "max_completion_tokens" in lowered

    def _load_all_templates(self) -> dict:
        """Load and cache all response templates"""
        template_file = SKILLS_DIR / "responses" / "templates.md"
        templates = {}
        if template_file.exists():
            try:
                with open(template_file, "r", encoding="utf-8") as f:
                    content = f.read()
                    sections = content.split("\n## ")
                    for section in sections:
                        if section.strip():
                            # Extract topic name from section header
                            lines = section.strip().split("\n")
                            if lines:
                                topic = lines[0].strip().lower()
                                templates[topic] = section.strip()
            except Exception:
                pass
        return templates

    async def chat(
        self,
        messages: list[dict],
        context: Optional[str] = None,
        *,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_language_override: Optional[str] = None,
    ) -> str:
        """
        Send chat request to MiniMax API
        """
        if not self.api_key:
            return self._get_fallback_response(messages)

        sanitized_messages = self._sanitize_messages(messages)
        clipped_context = self._clip_context(context)
        normalized_override = (response_language_override or "").strip().lower()
        if normalized_override in {"zh", "en", "auto"}:
            preferred_language = normalized_override
        else:
            preferred_language = self._infer_response_language(sanitized_messages)

        # Build system prompt
        final_prompt = self._build_fencing_system_prompt(
            clipped_context,
            response_language=preferred_language,
        )

        # Prepare messages for API
        api_messages = [{"role": "system", "content": final_prompt}]
        api_messages.extend(sanitized_messages)
        completion_budget = int(max_tokens or self.max_completion_tokens)

        try:
            async with httpx.AsyncClient(timeout=LLM_REQUEST_TIMEOUT_SECONDS) as client:
                request_url = f"{self.base_url}/text/chatcompletion_v2"
                request_headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                response = await client.post(
                    request_url,
                    headers=request_headers,
                    json=self._build_generation_payload(
                        api_messages=api_messages,
                        temperature=temperature,
                        max_tokens=completion_budget,
                    ),
                )
                if self._should_retry_with_legacy_max_tokens(response.status_code, response.text):
                    logger.info("llm_retrying_with_legacy_max_tokens model=%s", self.model)
                    response = await client.post(
                        request_url,
                        headers=request_headers,
                        json=self._build_generation_payload(
                            api_messages=api_messages,
                            temperature=temperature,
                            max_tokens=completion_budget,
                            legacy_max_tokens=True,
                        ),
                    )

                if response.status_code == 200:
                    data = response.json()
                    base_resp = data.get("base_resp", {})
                    if base_resp:
                        status_code = base_resp.get("status_code", 0)
                        status_msg = base_resp.get("status_msg", "")

                        if status_code == 1008:
                            if preferred_language == "zh":
                                return "⚠️ AI 服务暂时不可用（API 余额不足）。请检查你的 MiniMax 账户余额。"
                            return "⚠️ AI service temporarily unavailable (insufficient API balance). Please check your MiniMax account balance."
                        elif status_code != 0:
                            logger.warning("llm_api_error status_code=%s status_msg=%s", status_code, status_msg)
                            return self._get_fallback_response(messages)

                    choices = data.get("choices")
                    if choices and len(choices) > 0:
                        return choices[0].get("message", {}).get("content", "")
                    return self._get_fallback_response(messages)
                else:
                    logger.warning("llm_http_error status_code=%s body=%s", response.status_code, response.text[:800])
                    return self._get_fallback_response(messages)
        except Exception as e:
            logger.exception("llm_exception detail=%s", str(e))
            return self._get_fallback_response(messages)

    def _extract_stream_text_candidate(self, payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                delta = first.get("delta")
                if isinstance(delta, dict):
                    content = delta.get("content")
                    if isinstance(content, str):
                        return content
                message = first.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        return content
                text = first.get("text")
                if isinstance(text, str):
                    return text

        for key in ("reply", "content", "text", "output_text"):
            value = payload.get(key)
            if isinstance(value, str):
                return value

        return ""

    def _normalize_stream_delta(self, candidate: str, accumulated: str) -> str:
        if not candidate:
            return ""
        if not accumulated:
            return candidate
        if candidate == accumulated:
            return ""
        if candidate.startswith(accumulated):
            return candidate[len(accumulated):]
        return candidate

    async def chat_stream(
        self,
        messages: list[dict],
        context: Optional[str] = None,
        *,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_language_override: Optional[str] = None,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            yield self._get_fallback_response(messages)
            return

        sanitized_messages = self._sanitize_messages(messages)
        clipped_context = self._clip_context(context)
        normalized_override = (response_language_override or "").strip().lower()
        if normalized_override in {"zh", "en", "auto"}:
            preferred_language = normalized_override
        else:
            preferred_language = self._infer_response_language(sanitized_messages)

        final_prompt = self._build_fencing_system_prompt(
            clipped_context,
            response_language=preferred_language,
        )
        api_messages = [{"role": "system", "content": final_prompt}]
        api_messages.extend(sanitized_messages)
        completion_budget = int(max_tokens or self.max_completion_tokens)

        accumulated = ""
        line_buffer: list[str] = []

        try:
            async with httpx.AsyncClient(timeout=LLM_REQUEST_TIMEOUT_SECONDS) as client:
                request_url = f"{self.base_url}/text/chatcompletion_v2"
                request_headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                }
                use_legacy_max_tokens = False

                while True:
                    async with client.stream(
                        "POST",
                        request_url,
                        headers=request_headers,
                        json=self._build_generation_payload(
                            api_messages=api_messages,
                            temperature=temperature,
                            max_tokens=completion_budget,
                            stream=True,
                            legacy_max_tokens=use_legacy_max_tokens,
                        ),
                    ) as response:
                        if response.status_code != 200:
                            body_preview = (await response.aread()).decode("utf-8", errors="ignore")
                            if (
                                not use_legacy_max_tokens
                                and self._should_retry_with_legacy_max_tokens(response.status_code, body_preview)
                            ):
                                logger.info("llm_stream_retrying_with_legacy_max_tokens model=%s", self.model)
                                use_legacy_max_tokens = True
                                continue
                            logger.warning(
                                "llm_http_stream_error status_code=%s body=%s",
                                response.status_code,
                                body_preview[:800],
                            )
                            yield self._get_fallback_response(messages)
                            return

                        async for raw_line in response.aiter_lines():
                            if raw_line is None:
                                continue
                            line = raw_line.strip()
                            if not line:
                                continue
                            line_buffer.append(line)

                            if line.startswith("data:"):
                                line = line[5:].strip()
                            if not line or line == "[DONE]":
                                continue

                            try:
                                payload = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            base_resp = payload.get("base_resp")
                            if isinstance(base_resp, dict):
                                status_code = int(base_resp.get("status_code") or 0)
                                if status_code and status_code != 0:
                                    status_msg = str(base_resp.get("status_msg") or "")
                                    logger.warning(
                                        "llm_stream_api_error status_code=%s status_msg=%s",
                                        status_code,
                                        status_msg,
                                    )
                                    if status_code == 1008:
                                        if preferred_language == "zh":
                                            yield "⚠️ AI 服务暂时不可用（API 余额不足）。请检查你的 MiniMax 账户余额。"
                                        else:
                                            yield "⚠️ AI service temporarily unavailable (insufficient API balance). Please check your MiniMax account balance."
                                        return
                                    continue

                            candidate = self._extract_stream_text_candidate(payload)
                            delta = self._normalize_stream_delta(candidate, accumulated)
                            if not delta:
                                continue
                            accumulated += delta
                            yield delta

                        if accumulated:
                            return

                        # Some providers may ignore stream=true and still return one JSON payload.
                        merged = "\n".join(line_buffer)
                        fallback_payload_line = merged
                        if fallback_payload_line.startswith("data:"):
                            fallback_payload_line = fallback_payload_line[5:].strip()
                        try:
                            fallback_payload = json.loads(fallback_payload_line)
                        except json.JSONDecodeError:
                            yield self._get_fallback_response(messages)
                            return

                        candidate = self._extract_stream_text_candidate(fallback_payload)
                        if candidate:
                            yield candidate
                            return

                        yield self._get_fallback_response(messages)
                        return
        except Exception as exc:
            logger.exception("llm_stream_exception detail=%s", str(exc))
            yield self._get_fallback_response(messages)

    def _clip_context(self, context: Optional[str]) -> Optional[str]:
        if not context:
            return context
        if len(context) <= MAX_CONTEXT_CHARS:
            return context

        head_quota = int(MAX_CONTEXT_CHARS * 0.58)
        tail_quota = MAX_CONTEXT_CHARS - head_quota
        clipped = context[:head_quota] + "\n...\n" + context[-tail_quota:]
        return (
            f"[Context truncated by server. original_chars={len(context)}; "
            f"used_chars={len(clipped)}]\n{clipped}"
        )

    def _sanitize_messages(self, messages: list[dict]) -> list[dict]:
        if not messages:
            return messages

        sanitized: list[dict] = []
        total_chars = 0

        for message in reversed(messages):
            role = message.get("role", "user")
            content = str(message.get("content", ""))
            if len(content) > MAX_SINGLE_MESSAGE_CHARS:
                content = f"{content[:MAX_SINGLE_MESSAGE_CHARS]}\n...[message truncated]"

            projected = total_chars + len(content)
            if projected > MAX_TOTAL_MESSAGES_CHARS:
                remaining = MAX_TOTAL_MESSAGES_CHARS - total_chars
                if remaining <= 0:
                    break
                content = f"{content[:remaining]}\n...[message budget reached]"
                sanitized.append({"role": role, "content": content})
                break

            sanitized.append({"role": role, "content": content})
            total_chars = projected

        return list(reversed(sanitized))

    def _infer_language_from_text(self, text: str) -> str:
        if not text:
            return "auto"

        cjk_count = len(re.findall(r"[\u4e00-\u9fff]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))

        if cjk_count == 0 and latin_count == 0:
            return "auto"
        if cjk_count >= latin_count and cjk_count > 0:
            return "zh"
        if latin_count > cjk_count and latin_count > 0:
            return "en"
        return "auto"

    def _infer_response_language(self, messages: list[dict]) -> str:
        for message in reversed(messages):
            if message.get("role") != "user":
                continue
            content = str(message.get("content", "")).strip()
            if not content:
                continue
            return self._infer_language_from_text(content)
        return "auto"

    def _build_fencing_system_prompt(
        self,
        context: Optional[str] = None,
        *,
        response_language: str = "auto",
    ) -> str:
        """Build system prompt with optional context (uses cached knowledge)"""
        prompt = self.system_prompt

        # Add cached training knowledge
        if self.training_knowledge:
            prompt += f"\n\n## Training Management Knowledge\n\n{self.training_knowledge}"

        # Add cached technique and tactics knowledge
        if self.technique_tactics_knowledge:
            prompt += f"\n\n## Technique and Tactics Knowledge\n\n{self.technique_tactics_knowledge}"

        if context:
            prompt += f"\n\nCurrent context from video analysis and knowledge base:\n{context}"

        if response_language == "zh":
            prompt += (
                "\n\n## Response Language Policy\n"
                "- Reply in Simplified Chinese.\n"
                "- Keep technical terms clear and actionable.\n"
                "- If the user explicitly requests another language, follow that explicit request."
            )
        elif response_language == "en":
            prompt += (
                "\n\n## Response Language Policy\n"
                "- Reply in English.\n"
                "- Keep guidance specific and actionable.\n"
                "- If the user explicitly requests another language, follow that explicit request."
            )

        return prompt

    def _get_fallback_response(self, messages: list[dict]) -> str:
        """Fallback response when API is not available (uses cached templates)"""
        preferred_language = self._infer_response_language(messages)
        last_message = messages[-1]["content"].lower() if messages else ""

        # Try to get from cached templates first
        topics = ["lunge", "footwork", "parry", "distance", "training", "attack", "defense"]
        for topic in topics:
            if topic in last_message:
                # Check cached templates
                for cached_topic, template in self._response_templates.items():
                    if topic in cached_topic:
                        return template

        # Default fallback
        if preferred_language == "zh":
            return """这是一个很好的击剑问题！我可以继续帮你优化技术与训练。

我可以提供：
- 技术讲解（步法、手上动作、进攻与防守）
- 训练计划与专项练习建议
- 比赛战术与临场策略
- 视频分析与复盘建议

你想先从哪一部分开始？"""

        return """That's a great fencing question! I'm here to help you improve your game.

I can help you with:
- Technique explanations (footwork, blade work, attacks, defenses)
- Training recommendations and drills
- Strategy and tactical advice
- Competition tips
- Video analysis feedback

What would you like to know more about?"""


llm_service = LLMService()


def _build_sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


async def _prepare_chat_turn(
    request: ChatRequest,
    *,
    current_user: Optional[User],
    db: Session,
) -> tuple[str, list[dict[str, str]], Optional[ChatSession], Optional[str], list[dict[str, Any]], Optional[dict[str, Any]]]:
    user_message = _extract_user_message(request)
    model_messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    active_session: Optional[ChatSession] = None
    normalized_session_id = _clean_optional_text(request.session_id, 64)
    if normalized_session_id:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for persisted chat sessions",
            )
        if not user_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="message is required when session_id is provided",
            )

        active_session = _get_session_for_user(db, current_user, normalized_session_id)
        history_rows = (
            db.query(ChatMessageModel)
            .filter(ChatMessageModel.session_id == active_session.id)
            .order_by(ChatMessageModel.created_at.desc())
            .limit(MAX_SESSION_HISTORY_MESSAGES)
            .all()
        )
        history_rows.reverse()
        history_messages = [{"role": row.role, "content": row.content} for row in history_rows]
        model_messages = [*history_messages, {"role": "user", "content": user_message}]
    elif not model_messages and user_message:
        model_messages = [{"role": "user", "content": user_message}]

    if not model_messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No messages provided",
        )

    response_context = request.context
    citations_payload: list[dict[str, Any]] = []
    retrieval_meta_payload: Optional[dict[str, Any]] = None

    if request.use_kb:
        user_query = user_message
        if not user_query:
            for message in reversed(model_messages):
                if message.get("role") == "user" and str(message.get("content", "")).strip():
                    user_query = str(message.get("content", "")).strip()
                    break

        kb_filters = request.kb_filters.model_dump(exclude_none=True) if request.kb_filters else {}
        response_context, citations_payload, retrieval_meta_payload = await rag_service.prepare_chat_context(
            user_query=user_query,
            base_context=request.context,
            use_kb=request.use_kb,
            weapon=request.weapon,
            kb_filters=kb_filters,
        )

    return (
        user_message,
        model_messages,
        active_session,
        response_context,
        citations_payload,
        retrieval_meta_payload,
    )


def _persist_chat_turn(
    *,
    db: Session,
    request: ChatRequest,
    active_session: Optional[ChatSession],
    current_user: Optional[User],
    user_message: str,
    assistant_response: str,
    citations_payload: list[dict[str, Any]],
    retrieval_meta_payload: Optional[dict[str, Any]],
) -> None:
    if not active_session or not current_user:
        return

    if user_message:
        db.add(
            ChatMessageModel(
                session_id=active_session.id,
                user_id=current_user.id,
                role="user",
                content=user_message,
            )
        )

    assistant_message = ChatMessageModel(
        session_id=active_session.id,
        user_id=current_user.id,
        role="assistant",
        content=assistant_response,
        citations_json=json.dumps(citations_payload, ensure_ascii=False) if citations_payload else None,
        retrieval_meta_json=(
            json.dumps(retrieval_meta_payload, ensure_ascii=False) if retrieval_meta_payload else None
        ),
    )
    db.add(assistant_message)

    normalized_context_summary = _clean_optional_text(request.context, MAX_CONTEXT_SUMMARY_CHARS)
    if normalized_context_summary:
        active_session.context_summary = normalized_context_summary

    now = datetime.utcnow()
    active_session.last_message_at = now
    active_session.updated_at = now
    db.commit()


@router.post("/chat/sessions", response_model=ChatSessionResponse)
def create_chat_session(
    request: ChatSessionCreateRequest,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    normalized_session_type = _normalize_session_type(request.session_type)
    normalized_video_id = _clean_optional_text(request.video_id, 64)
    normalized_title = _clean_optional_text(request.title, 255)
    normalized_context_summary = _clean_optional_text(request.context_summary, MAX_CONTEXT_SUMMARY_CHARS)

    existing_session: Optional[ChatSession] = None
    if not request.force_new:
        query = (
            db.query(ChatSession)
            .filter(
                ChatSession.user_id == current_user.id,
                ChatSession.session_type == normalized_session_type,
                ChatSession.is_archived.is_(False),
            )
            .order_by(func.coalesce(ChatSession.last_message_at, ChatSession.updated_at).desc())
        )

        if normalized_video_id:
            query = query.filter(ChatSession.video_id == normalized_video_id)
        elif normalized_session_type == SESSION_TYPE_VIDEO:
            query = query.filter(ChatSession.video_id.is_(None))
        else:
            query = query.filter(ChatSession.video_id.is_(None))

        existing_session = query.first()

    if existing_session:
        has_changes = False
        if normalized_title and existing_session.title != normalized_title:
            existing_session.title = normalized_title
            has_changes = True
        if normalized_context_summary and existing_session.context_summary != normalized_context_summary:
            existing_session.context_summary = normalized_context_summary
            has_changes = True
        if existing_session.session_type != normalized_session_type:
            existing_session.session_type = normalized_session_type
            has_changes = True
        if has_changes:
            existing_session.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing_session)
        message_count = (
            db.query(func.count(ChatMessageModel.id))
            .filter(ChatMessageModel.session_id == existing_session.id)
            .scalar()
            or 0
        )
        return _serialize_session(existing_session, int(message_count))

    chat_session = ChatSession(
        user_id=current_user.id,
        video_id=normalized_video_id,
        session_type=normalized_session_type,
        title=normalized_title or (
            "Training Analysis"
            if normalized_session_type == SESSION_TYPE_TRAINING
            else "Video Analysis"
            if normalized_session_type == SESSION_TYPE_VIDEO
            else "Assistant Chat"
        ),
        context_summary=normalized_context_summary,
    )
    db.add(chat_session)
    db.commit()
    db.refresh(chat_session)
    return _serialize_session(chat_session, 0)


@router.get("/chat/sessions", response_model=ChatSessionListResponse)
def list_chat_sessions(
    video_id: Optional[str] = Query(default=None),
    session_type: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    query = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id,
        ChatSession.is_archived.is_(False),
    )

    normalized_session_type = _clean_optional_text(session_type, 32)
    if normalized_session_type and normalized_session_type in VALID_SESSION_TYPES:
        query = query.filter(ChatSession.session_type == normalized_session_type)

    normalized_video_id = _clean_optional_text(video_id, 64)
    if normalized_video_id:
        query = query.filter(ChatSession.video_id == normalized_video_id)

    sessions = (
        query.order_by(func.coalesce(ChatSession.last_message_at, ChatSession.updated_at).desc())
        .limit(limit)
        .all()
    )

    session_ids = [item.id for item in sessions]
    count_map = _message_count_map(db, session_ids)
    serialized = [_serialize_session(item, count_map.get(item.id, 0)) for item in sessions]
    return ChatSessionListResponse(sessions=serialized, total=len(serialized))


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionDetailResponse)
def get_chat_session(
    session_id: str,
    limit: int = Query(default=80, ge=1, le=300),
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    chat_session = _get_session_for_user(db, current_user, session_id)

    message_count = (
        db.query(func.count(ChatMessageModel.id))
        .filter(ChatMessageModel.session_id == chat_session.id)
        .scalar()
        or 0
    )
    messages = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == chat_session.id)
        .order_by(ChatMessageModel.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()

    base = _serialize_session(chat_session, int(message_count))
    return ChatSessionDetailResponse(
        **base.model_dump(),
        messages=[_serialize_session_message(item) for item in messages],
    )


@router.delete("/chat/sessions/{session_id}", response_model=ChatSessionDeleteResponse)
def delete_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    chat_session = _get_session_for_user(db, current_user, session_id)
    normalized_session_type = _normalize_session_type(chat_session.session_type)

    if normalized_session_type != SESSION_TYPE_VIDEO or not chat_session.video_id:
        deleted_message_count = (
            db.query(ChatMessageModel)
            .filter(ChatMessageModel.session_id == chat_session.id)
            .delete(synchronize_session=False)
        )
        db.delete(chat_session)
        db.commit()
        return ChatSessionDeleteResponse(
            deleted_scope="session_only",
            deleted_session_count=1,
            deleted_message_count=int(deleted_message_count or 0),
            video_id=chat_session.video_id,
            message="Session deleted",
        )

    video_id = chat_session.video_id
    related_sessions = (
        db.query(ChatSession)
        .filter(
            ChatSession.user_id == current_user.id,
            ChatSession.session_type == SESSION_TYPE_VIDEO,
            ChatSession.video_id == video_id,
            ChatSession.is_archived.is_(False),
        )
        .all()
    )
    related_session_ids = [item.id for item in related_sessions]
    if not related_session_ids:
        related_session_ids = [chat_session.id]

    # Best-effort filesystem cleanup (video file, metadata, analyses).
    video_service.delete_video_assets(video_id)
    pose_analysis_service.delete_analysis_assets(video_id)

    deleted_message_count = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id.in_(related_session_ids))
        .delete(synchronize_session=False)
    )
    deleted_session_count = (
        db.query(ChatSession)
        .filter(
            ChatSession.user_id == current_user.id,
            ChatSession.session_type == SESSION_TYPE_VIDEO,
            ChatSession.video_id == video_id,
        )
        .delete(synchronize_session=False)
    )
    db.query(AnalysisReport).filter(
        AnalysisReport.user_id == current_user.id,
        AnalysisReport.video_id == video_id,
    ).delete(synchronize_session=False)
    db.commit()

    return ChatSessionDeleteResponse(
        deleted_scope="video_full",
        deleted_session_count=int(deleted_session_count or 0),
        deleted_message_count=int(deleted_message_count or 0),
        video_id=video_id,
        message="Video-related sessions and assets deleted",
    )


@router.post("/chat", response_model=ChatResponse, response_model_exclude_none=True)
async def chat(
    request: ChatRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    AI Chat endpoint for fencing questions
    """
    (
        user_message,
        model_messages,
        active_session,
        response_context,
        citations_payload,
        retrieval_meta_payload,
    ) = await _prepare_chat_turn(
        request,
        current_user=current_user,
        db=db,
    )

    response = await llm_service.chat(
        model_messages,
        context=response_context,
    )

    citations = [Citation(**item) for item in citations_payload] if request.use_kb else None
    retrieval_meta = RetrievalMeta(**retrieval_meta_payload) if retrieval_meta_payload else None

    _persist_chat_turn(
        db=db,
        request=request,
        active_session=active_session,
        current_user=current_user,
        user_message=user_message,
        assistant_response=response,
        citations_payload=citations_payload,
        retrieval_meta_payload=retrieval_meta_payload,
    )

    return ChatResponse(
        message=response,
        session_id=str(active_session.id) if active_session else None,
        citations=citations,
        retrieval_meta=retrieval_meta,
    )


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    (
        user_message,
        model_messages,
        active_session,
        response_context,
        citations_payload,
        retrieval_meta_payload,
    ) = await _prepare_chat_turn(
        request,
        current_user=current_user,
        db=db,
    )

    async def event_generator() -> AsyncIterator[str]:
        session_id_value = str(active_session.id) if active_session else None
        yield _build_sse_event("meta", {"session_id": session_id_value})

        full_response = ""
        try:
            async for delta in llm_service.chat_stream(
                model_messages,
                context=response_context,
            ):
                if not delta:
                    continue
                full_response += delta
                yield _build_sse_event("chunk", {"delta": delta})

            if not full_response.strip():
                full_response = llm_service._get_fallback_response(model_messages)
                yield _build_sse_event("chunk", {"delta": full_response})

            citations = [Citation(**item) for item in citations_payload] if request.use_kb else None
            retrieval_meta = RetrievalMeta(**retrieval_meta_payload) if retrieval_meta_payload else None

            _persist_chat_turn(
                db=db,
                request=request,
                active_session=active_session,
                current_user=current_user,
                user_message=user_message,
                assistant_response=full_response,
                citations_payload=citations_payload,
                retrieval_meta_payload=retrieval_meta_payload,
            )

            yield _build_sse_event(
                "done",
                {
                    "message": full_response,
                    "session_id": session_id_value,
                    "citations": [item.model_dump() for item in citations] if citations else None,
                    "retrieval_meta": retrieval_meta.model_dump() if retrieval_meta else None,
                },
            )
        except Exception as exc:
            logger.exception("chat_stream_error detail=%s", str(exc))
            yield _build_sse_event(
                "error",
                {"message": "Failed to stream response"},
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
