from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class CitationRecord:
    chunk_id: str
    doc_id: str
    title: str
    source: str
    snippet: str
    score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "title": self.title,
            "source": self.source,
            "snippet": self.snippet,
            "score": self.score,
        }


@dataclass
class RetrievalMetaRecord:
    use_kb: bool
    provider: str
    collection: str
    hit_count: int = 0
    degraded: bool = False
    degrade_reason: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "use_kb": self.use_kb,
            "provider": self.provider,
            "collection": self.collection,
            "hit_count": self.hit_count,
            "degraded": self.degraded,
            "degrade_reason": self.degrade_reason,
        }
