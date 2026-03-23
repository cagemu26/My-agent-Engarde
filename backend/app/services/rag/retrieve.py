from typing import Any, Optional

from app.services.rag.embedding import EmbeddingProvider
from app.services.rag.types import CitationRecord


class KBRetrievalService:
    def __init__(
        self,
        chroma_client: Any,
        collection_name: str,
        embedding_provider: EmbeddingProvider,
    ):
        self.chroma_client = chroma_client
        self.collection_name = collection_name
        self.embedding_provider = embedding_provider

    def _get_collection(self):
        return self.chroma_client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    async def search(
        self,
        query: str,
        top_k: int,
        score_threshold: float,
        filters: Optional[dict[str, str]] = None,
    ) -> list[CitationRecord]:
        normalized_query = (query or "").strip()
        if not normalized_query:
            return []

        if not self.embedding_provider.is_available():
            raise RuntimeError("Embedding provider is unavailable")

        collection = self._get_collection()

        try:
            if collection.count() == 0:
                return []
        except Exception:
            pass

        query_embedding = (await self.embedding_provider.embed_texts([normalized_query]))[0]

        where_clause = self._build_where_clause(filters or {})
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=max(1, top_k),
            where=where_clause,
            include=["documents", "metadatas", "distances"],
        )

        ids = (results.get("ids") or [[]])[0]
        documents = (results.get("documents") or [[]])[0]
        metadatas = (results.get("metadatas") or [[]])[0]
        distances = (results.get("distances") or [[]])[0]

        citations: list[CitationRecord] = []
        for idx, chunk_id in enumerate(ids):
            metadata = metadatas[idx] if idx < len(metadatas) and metadatas[idx] else {}
            document = documents[idx] if idx < len(documents) and documents[idx] else ""
            distance = distances[idx] if idx < len(distances) else None

            score = self._distance_to_score(distance)
            if score < score_threshold:
                continue

            snippet = (document or "").strip().replace("\r\n", "\n")
            if len(snippet) > 420:
                snippet = snippet[:420].rstrip() + "..."

            citations.append(
                CitationRecord(
                    chunk_id=str(chunk_id),
                    doc_id=str(metadata.get("doc_id") or ""),
                    title=str(metadata.get("title") or "Untitled"),
                    source=str(metadata.get("source") or "unknown"),
                    snippet=snippet,
                    score=score,
                )
            )

        return citations

    def _build_where_clause(self, filters: dict[str, str]) -> Optional[dict[str, Any]]:
        clauses: list[dict[str, Any]] = []

        weapon = (filters.get("weapon") or "").strip().lower()
        if weapon:
            clauses.append({"$or": [{"weapon": weapon}, {"weapon": "general"}]})

        for field in ("topic", "level", "language"):
            value = (filters.get(field) or "").strip().lower()
            if value:
                clauses.append({field: value})

        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    @staticmethod
    def _distance_to_score(distance: Any) -> float:
        if distance is None:
            return 0.0
        try:
            distance_value = float(distance)
            if distance_value < 0:
                distance_value = 0.0
            # Convert distance to a stable [0,1] score.
            score = 1.0 / (1.0 + distance_value)
            return round(score, 4)
        except Exception:
            return 0.0
