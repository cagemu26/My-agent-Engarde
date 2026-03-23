from abc import ABC, abstractmethod
from typing import Sequence

import httpx


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError

    @property
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError


class QianfanEmbeddingProvider(EmbeddingProvider):
    """Embedding provider for Baidu Qianfan /v2/embeddings endpoint."""

    MAX_BATCH_SIZE = 16

    def __init__(
        self,
        api_base: str,
        bearer_token: str,
        model: str,
        timeout_seconds: float = 20.0,
    ):
        self.api_base = api_base.rstrip("/")
        self.bearer_token = bearer_token
        self.model = model
        self.timeout_seconds = timeout_seconds

    @property
    def provider_name(self) -> str:
        return "qianfan"

    def is_available(self) -> bool:
        return bool(self.bearer_token)

    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []

        if not self.is_available():
            raise RuntimeError("Qianfan bearer token is missing")

        normalized_texts = [self._normalize_text(text) for text in texts]
        embeddings: list[list[float]] = []

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for start in range(0, len(normalized_texts), self.MAX_BATCH_SIZE):
                batch = normalized_texts[start : start + self.MAX_BATCH_SIZE]
                payload = {
                    "model": self.model,
                    "input": batch,
                }

                response = await client.post(
                    self.api_base,
                    headers={
                        "Authorization": f"Bearer {self.bearer_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

                if response.status_code != 200:
                    preview = response.text[:240]
                    raise RuntimeError(
                        f"Qianfan embeddings request failed: {response.status_code} {preview}"
                    )

                data = response.json()
                raw_items = data.get("data")
                if not isinstance(raw_items, list):
                    raise RuntimeError("Qianfan embeddings response missing data array")

                ordered_items = sorted(raw_items, key=lambda item: item.get("index", 0))
                if len(ordered_items) != len(batch):
                    raise RuntimeError("Qianfan embeddings response length mismatch")

                for item in ordered_items:
                    vector = item.get("embedding")
                    if not isinstance(vector, list) or not vector:
                        raise RuntimeError("Qianfan embeddings response contains invalid vector")
                    embeddings.append([float(value) for value in vector])

        if len(embeddings) != len(normalized_texts):
            raise RuntimeError("Qianfan embeddings response total length mismatch")

        return embeddings

    @staticmethod
    def _normalize_text(text: str) -> str:
        normalized = (text or "").strip()
        return normalized if normalized else " "
