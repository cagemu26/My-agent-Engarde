from pathlib import Path
from typing import Any, Optional

import chromadb

from app.core.config import settings
from app.services.rag.embedding import QianfanEmbeddingProvider
from app.services.rag.ingest import KBIngestService
from app.services.rag.prompt_builder import PromptBuilderService
from app.services.rag.retrieve import KBRetrievalService
from app.services.rag.types import CitationRecord, RetrievalMetaRecord


class RAGService:
    def __init__(self):
        self.enabled = settings.RAG_ENABLED
        self.collection_name = settings.KB_COLLECTION

        chroma_path = Path(settings.CHROMA_PERSIST_DIR)
        chroma_path.mkdir(parents=True, exist_ok=True)
        self.chroma_client = chromadb.PersistentClient(path=str(chroma_path))

        self.embedding_provider = QianfanEmbeddingProvider(
            api_base=settings.QIANFAN_API_BASE,
            bearer_token=settings.QIANFAN_BEARER_TOKEN,
            model=settings.QIANFAN_EMBED_MODEL,
        )

        self.ingest_service = KBIngestService(
            chroma_client=self.chroma_client,
            collection_name=self.collection_name,
            embedding_provider=self.embedding_provider,
            chunk_size=settings.RAG_CHUNK_SIZE,
            chunk_overlap=settings.RAG_CHUNK_OVERLAP,
            batch_size=settings.RAG_EMBED_BATCH_SIZE,
        )
        self.retrieve_service = KBRetrievalService(
            chroma_client=self.chroma_client,
            collection_name=self.collection_name,
            embedding_provider=self.embedding_provider,
        )
        self.prompt_builder = PromptBuilderService()

    async def prepare_chat_context(
        self,
        user_query: str,
        base_context: Optional[str],
        use_kb: bool,
        weapon: Optional[str] = None,
        kb_filters: Optional[dict[str, str]] = None,
    ) -> tuple[Optional[str], list[dict[str, Any]], dict[str, Any]]:
        retrieval_meta = RetrievalMetaRecord(
            use_kb=bool(use_kb),
            provider=self.embedding_provider.provider_name,
            collection=self.collection_name,
        )

        if not use_kb:
            return base_context, [], retrieval_meta.to_dict()

        if not self.enabled:
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = "rag_disabled"
            return base_context, [], retrieval_meta.to_dict()

        if not self.embedding_provider.is_available():
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = "missing_qianfan_bearer_token"
            return base_context, [], retrieval_meta.to_dict()

        filters = self._normalize_filters(kb_filters)
        if weapon and not filters.get("weapon"):
            filters["weapon"] = weapon.strip().lower()

        try:
            citations = await self.retrieve_service.search(
                query=user_query,
                top_k=settings.RAG_TOP_K,
                score_threshold=settings.RAG_SCORE_THRESHOLD,
                filters=filters,
            )
            retrieval_meta.hit_count = len(citations)
        except Exception as exc:
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = f"retrieval_error:{type(exc).__name__}"
            return base_context, [], retrieval_meta.to_dict()

        merged_context = self.prompt_builder.build_context(base_context, citations)
        return merged_context, [citation.to_dict() for citation in citations], retrieval_meta.to_dict()

    async def ingest_knowledge(
        self,
        data_dir: Optional[str] = None,
        reindex: bool = False,
    ) -> dict[str, Any]:
        if not self.embedding_provider.is_available():
            raise RuntimeError("Qianfan bearer token is required for ingest")

        target_dir = Path(data_dir) if data_dir else Path(settings.KB_DATA_DIR)
        if reindex:
            self.ingest_service.reset_collection()

        stats = await self.ingest_service.ingest_directory(target_dir)
        stats["reindex"] = reindex
        return stats

    async def search_knowledge(
        self,
        query: str,
        top_k: int,
        kb_filters: Optional[dict[str, str]] = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        retrieval_meta = RetrievalMetaRecord(
            use_kb=True,
            provider=self.embedding_provider.provider_name,
            collection=self.collection_name,
        )

        if not self.enabled:
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = "rag_disabled"
            return [], retrieval_meta.to_dict()

        if not self.embedding_provider.is_available():
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = "missing_qianfan_bearer_token"
            return [], retrieval_meta.to_dict()

        try:
            citations: list[CitationRecord] = await self.retrieve_service.search(
                query=query,
                top_k=top_k,
                score_threshold=settings.RAG_SCORE_THRESHOLD,
                filters=self._normalize_filters(kb_filters),
            )
            retrieval_meta.hit_count = len(citations)
            return [citation.to_dict() for citation in citations], retrieval_meta.to_dict()
        except Exception as exc:
            retrieval_meta.degraded = True
            retrieval_meta.degrade_reason = f"search_error:{type(exc).__name__}"
            return [], retrieval_meta.to_dict()

    @staticmethod
    def _normalize_filters(filters: Optional[dict[str, str]]) -> dict[str, str]:
        if not filters:
            return {}

        normalized: dict[str, str] = {}
        for key in ("weapon", "topic", "level", "language"):
            value = filters.get(key)
            if value is None:
                continue
            parsed = str(value).strip().lower()
            if parsed:
                normalized[key] = parsed
        return normalized


rag_service = RAGService()
