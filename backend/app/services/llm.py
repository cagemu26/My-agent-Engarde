from fastapi import APIRouter
from app.schemas import ChatRequest, ChatResponse, Citation, RetrievalMeta
import httpx
from typing import Optional
from app.core.config import settings
from pathlib import Path
from app.services.rag import rag_service


router = APIRouter(tags=["chat"])

# Skills directory path
SKILLS_DIR = Path(__file__).parent.parent / "skills"
LLM_REQUEST_TIMEOUT_SECONDS = 60.0
MAX_CONTEXT_CHARS = 24000
MAX_SINGLE_MESSAGE_CHARS = 6000
MAX_TOTAL_MESSAGES_CHARS = 18000


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
        self.model = "MiniMax-M2.7"
        # Load and cache all knowledge files at initialization
        self.system_prompt = _load_system_prompt()
        self.training_knowledge = _load_training_knowledge()
        self.technique_tactics_knowledge = _load_technique_tactics_knowledge()
        # Cache response templates
        self._response_templates = self._load_all_templates()

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
        max_tokens: int = 1024,
    ) -> str:
        """
        Send chat request to MiniMax API
        """
        if not self.api_key:
            return self._get_fallback_response(messages)

        sanitized_messages = self._sanitize_messages(messages)
        clipped_context = self._clip_context(context)

        # Build system prompt
        final_prompt = self._build_fencing_system_prompt(clipped_context)

        # Prepare messages for API
        api_messages = [{"role": "system", "content": final_prompt}]
        api_messages.extend(sanitized_messages)

        try:
            async with httpx.AsyncClient(timeout=LLM_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{self.base_url}/text/chatcompletion_v2",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": api_messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    base_resp = data.get("base_resp", {})
                    if base_resp:
                        status_code = base_resp.get("status_code", 0)
                        status_msg = base_resp.get("status_msg", "")

                        if status_code == 1008:
                            return "⚠️ AI service temporarily unavailable (insufficient API balance). Please check your MiniMax account balance."
                        elif status_code != 0:
                            print(f"API error: {status_code} - {status_msg}")
                            return self._get_fallback_response(messages)

                    choices = data.get("choices")
                    if choices and len(choices) > 0:
                        return choices[0].get("message", {}).get("content", "")
                    return self._get_fallback_response(messages)
                else:
                    print(f"API error: {response.status_code} - {response.text}")
                    return self._get_fallback_response(messages)
        except Exception as e:
            print(f"LLM API error: {e}")
            import traceback
            traceback.print_exc()
            return self._get_fallback_response(messages)

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

    def _build_fencing_system_prompt(self, context: Optional[str] = None) -> str:
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

        return prompt

    def _get_fallback_response(self, messages: list[dict]) -> str:
        """Fallback response when API is not available (uses cached templates)"""
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
        return """That's a great fencing question! I'm here to help you improve your game.

I can help you with:
- Technique explanations (footwork, blade work, attacks, defenses)
- Training recommendations and drills
- Strategy and tactical advice
- Competition tips
- Video analysis feedback

What would you like to know more about?"""


llm_service = LLMService()


@router.post("/chat", response_model=ChatResponse, response_model_exclude_none=True)
async def chat(request: ChatRequest):
    """
    AI Chat endpoint for fencing questions
    """
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    response_context = request.context
    citations_payload: list[dict] = []
    retrieval_meta_payload: Optional[dict] = None

    if request.use_kb:
        user_query = ""
        for message in reversed(request.messages):
            if message.role == "user":
                user_query = message.content
                break
        if not user_query and request.messages:
            user_query = request.messages[-1].content

        kb_filters = request.kb_filters.model_dump(exclude_none=True) if request.kb_filters else {}
        response_context, citations_payload, retrieval_meta_payload = await rag_service.prepare_chat_context(
            user_query=user_query,
            base_context=request.context,
            use_kb=request.use_kb,
            weapon=request.weapon,
            kb_filters=kb_filters,
        )

    response = await llm_service.chat(messages, context=response_context)

    citations = [Citation(**item) for item in citations_payload] if request.use_kb else None
    retrieval_meta = RetrievalMeta(**retrieval_meta_payload) if retrieval_meta_payload else None

    return ChatResponse(
        message=response,
        citations=citations,
        retrieval_meta=retrieval_meta,
    )
