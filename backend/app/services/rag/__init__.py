class NoopRAGService:
    enabled = False
    collection_name = ""

    async def prepare_chat_context(
        self,
        user_query,
        base_context,
        use_kb,
        weapon=None,
        kb_filters=None,
    ):
        retrieval_meta = {
            "use_kb": bool(use_kb),
            "provider": "unavailable",
            "collection": self.collection_name,
            "hit_count": 0,
            "degraded": bool(use_kb),
            "degrade_reason": "rag_dependencies_missing" if use_kb else None,
        }
        return base_context, [], retrieval_meta

    async def ingest_knowledge(self, data_dir=None, reindex=False):
        raise RuntimeError("RAG dependencies are not installed in this deployment")

    async def search_knowledge(self, query, top_k, kb_filters=None):
        retrieval_meta = {
            "use_kb": True,
            "provider": "unavailable",
            "collection": self.collection_name,
            "hit_count": 0,
            "degraded": True,
            "degrade_reason": "rag_dependencies_missing",
        }
        return [], retrieval_meta


try:
    from app.services.rag.service import rag_service
except ModuleNotFoundError as exc:
    if exc.name != "chromadb":
        raise
    rag_service = NoopRAGService()

__all__ = ["rag_service"]
