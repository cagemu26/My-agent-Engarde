import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Sequence

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


class RemoteEmbeddingProvider(EmbeddingProvider):
    MAX_RETRIES = 3

    def __init__(
        self,
        *,
        provider_name: str,
        api_base: str,
        bearer_token: str,
        model: str,
        timeout_seconds: float = 20.0,
        max_batch_size: int = 16,
        dimensions: Optional[int] = None,
        encoding_format: Optional[str] = None,
    ):
        self._provider_name = provider_name
        self.api_base = api_base.rstrip("/")
        self.bearer_token = bearer_token
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_batch_size = max(1, max_batch_size)
        self.dimensions = dimensions if dimensions and dimensions > 0 else None
        self.encoding_format = (encoding_format or "").strip() or None

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def is_available(self) -> bool:
        return bool(self.bearer_token)

    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []

        if not self.is_available():
            raise RuntimeError(f"{self.provider_name} embedding credentials are missing")

        normalized_texts = [self._normalize_text(text) for text in texts]
        embeddings: list[list[float]] = []

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for start in range(0, len(normalized_texts), self.max_batch_size):
                batch = normalized_texts[start : start + self.max_batch_size]
                payload = {
                    "model": self.model,
                    "input": batch,
                }
                if self.dimensions is not None:
                    payload["dimensions"] = self.dimensions
                if self.encoding_format:
                    payload["encoding_format"] = self.encoding_format

                response = await self._post_with_retries(client, payload)

                data = response.json()
                raw_items = data.get("data")
                if not isinstance(raw_items, list):
                    raise RuntimeError(
                        f"{self.provider_name} embeddings response missing data array"
                    )

                ordered_items = sorted(raw_items, key=lambda item: item.get("index", 0))
                if len(ordered_items) != len(batch):
                    raise RuntimeError(
                        f"{self.provider_name} embeddings response length mismatch"
                    )

                for item in ordered_items:
                    vector = item.get("embedding")
                    if not isinstance(vector, list) or not vector:
                        raise RuntimeError(
                            f"{self.provider_name} embeddings response contains invalid vector"
                        )
                    embeddings.append([float(value) for value in vector])

        if len(embeddings) != len(normalized_texts):
            raise RuntimeError(
                f"{self.provider_name} embeddings response total length mismatch"
            )

        return embeddings

    @staticmethod
    def _normalize_text(text: str) -> str:
        normalized = (text or "").strip()
        return normalized if normalized else " "

    async def _post_with_retries(
        self,
        client: httpx.AsyncClient,
        payload: dict[str, object],
    ) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json",
        }
        last_error: Optional[Exception] = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                response = await client.post(
                    self.api_base,
                    headers=headers,
                    json=payload,
                )
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt >= self.MAX_RETRIES:
                    break
                await asyncio.sleep(0.8 * attempt)
                continue

            if response.status_code == 200:
                return response

            if response.status_code in {408, 409, 425, 429} or response.status_code >= 500:
                preview = response.text[:240]
                last_error = RuntimeError(
                    f"{self.provider_name} embeddings transient error: "
                    f"{response.status_code} {preview}"
                )
                if attempt >= self.MAX_RETRIES:
                    break
                await asyncio.sleep(0.8 * attempt)
                continue

            preview = response.text[:240]
            raise RuntimeError(
                f"{self.provider_name} embeddings request failed: "
                f"{response.status_code} {preview}"
            )

        if last_error is not None:
            raise RuntimeError(
                f"{self.provider_name} embeddings request failed after retries: {last_error}"
            ) from last_error
        raise RuntimeError(f"{self.provider_name} embeddings request failed after retries")


class QianfanEmbeddingProvider(RemoteEmbeddingProvider):
    """Embedding provider for Baidu Qianfan /v2/embeddings endpoint."""

    def __init__(
        self,
        api_base: str,
        bearer_token: str,
        model: str,
        timeout_seconds: float = 20.0,
    ):
        super().__init__(
            provider_name="qianfan",
            api_base=api_base,
            bearer_token=bearer_token,
            model=model,
            timeout_seconds=timeout_seconds,
            max_batch_size=16,
        )


class BailianEmbeddingProvider(RemoteEmbeddingProvider):
    """Embedding provider for Aliyun Bailian DashScope OpenAI-compatible endpoint."""

    def __init__(
        self,
        api_base: str,
        bearer_token: str,
        model: str,
        timeout_seconds: float = 20.0,
        dimensions: Optional[int] = None,
    ):
        super().__init__(
            provider_name="bailian",
            api_base=api_base,
            bearer_token=bearer_token,
            model=model,
            timeout_seconds=timeout_seconds,
            max_batch_size=10,
            dimensions=dimensions,
            encoding_format="float",
        )
