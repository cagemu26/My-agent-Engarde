import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.rag.embedding import EmbeddingProvider


SUPPORTED_EXTENSIONS = {".md", ".markdown", ".jsonl"}


class KBIngestService:
    def __init__(
        self,
        chroma_client: Any,
        collection_name: str,
        embedding_provider: EmbeddingProvider,
        chunk_size: int,
        chunk_overlap: int,
        batch_size: int = 16,
    ):
        self.chroma_client = chroma_client
        self.collection_name = collection_name
        self.embedding_provider = embedding_provider
        self.chunk_size = max(200, chunk_size)
        self.chunk_overlap = max(0, min(chunk_overlap, self.chunk_size - 1))
        self.batch_size = max(1, min(batch_size, 16))

    def _get_collection(self):
        return self.chroma_client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def reset_collection(self) -> None:
        try:
            self.chroma_client.delete_collection(name=self.collection_name)
        except Exception:
            pass

    async def ingest_directory(self, data_dir: Path) -> dict[str, Any]:
        stats: dict[str, Any] = {
            "collection": self.collection_name,
            "data_dir": str(data_dir),
            "files_scanned": 0,
            "documents": 0,
            "chunks": 0,
            "upserted": 0,
            "warnings": [],
            "timestamp": datetime.utcnow().isoformat(),
        }

        if not data_dir.exists():
            stats["warnings"].append(f"Knowledge directory does not exist: {data_dir}")
            return stats

        files = [
            path
            for path in sorted(data_dir.rglob("*"))
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]

        stats["files_scanned"] = len(files)

        records: list[dict[str, Any]] = []
        for path in files:
            try:
                if path.suffix.lower() in {".md", ".markdown"}:
                    records.extend(self._load_markdown(path))
                elif path.suffix.lower() == ".jsonl":
                    records.extend(self._load_jsonl(path))
            except Exception as exc:
                stats["warnings"].append(f"Failed to parse {path}: {exc}")

        stats["documents"] = len(records)

        chunk_ids: list[str] = []
        chunk_docs: list[str] = []
        chunk_metas: list[dict[str, Any]] = []

        for record in records:
            chunks = self._chunk_text(record["content"])
            total_chunks = len(chunks)
            if total_chunks == 0:
                continue

            for idx, chunk in enumerate(chunks):
                chunk_id = f"{record['doc_id']}#{idx}"
                chunk_ids.append(chunk_id)
                chunk_docs.append(chunk)
                chunk_metas.append(
                    {
                        "chunk_id": chunk_id,
                        "doc_id": record["doc_id"],
                        "title": record["title"],
                        "source": record["source"],
                        "weapon": record["weapon"],
                        "topic": record["topic"],
                        "level": record["level"],
                        "language": record["language"],
                        "updated_at": record["updated_at"],
                        "chunk_index": idx,
                        "chunk_total": total_chunks,
                    }
                )

        stats["chunks"] = len(chunk_ids)
        if not chunk_ids:
            return stats

        collection = self._get_collection()

        for start in range(0, len(chunk_ids), self.batch_size):
            batch_ids = chunk_ids[start : start + self.batch_size]
            batch_docs = chunk_docs[start : start + self.batch_size]
            batch_metas = chunk_metas[start : start + self.batch_size]

            embeddings = await self.embedding_provider.embed_texts(batch_docs)
            collection.upsert(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_metas,
                embeddings=embeddings,
            )
            stats["upserted"] += len(batch_ids)

        return stats

    def _load_markdown(self, path: Path) -> list[dict[str, Any]]:
        content = path.read_text(encoding="utf-8")
        metadata, body = self._parse_frontmatter(content)
        if not body.strip():
            return []

        record = self._normalize_record(
            metadata,
            fallback_doc_id=path.stem,
            fallback_title=self._infer_title(path.stem, body),
            fallback_source=str(path),
            content=body,
        )
        return [record]

    def _load_jsonl(self, path: Path) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        with open(path, "r", encoding="utf-8") as f:
            for line_no, raw_line in enumerate(f, start=1):
                line = raw_line.strip()
                if not line:
                    continue

                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(item, dict):
                    continue

                question = str(item.get("question", "")).strip()
                answer = str(item.get("answer", "")).strip()
                content = str(item.get("content", "")).strip()

                if not content:
                    parts = []
                    if question:
                        parts.append(f"Q: {question}")
                    if answer:
                        parts.append(f"A: {answer}")
                    content = "\n".join(parts).strip()

                if not content:
                    continue

                fallback_doc_id = f"{path.stem}-{line_no}"
                fallback_title = str(item.get("title") or question or fallback_doc_id)
                fallback_source = str(item.get("source") or f"{path}:{line_no}")

                records.append(
                    self._normalize_record(
                        item,
                        fallback_doc_id=fallback_doc_id,
                        fallback_title=fallback_title,
                        fallback_source=fallback_source,
                        content=content,
                    )
                )

        return records

    def _normalize_record(
        self,
        metadata: dict[str, Any],
        fallback_doc_id: str,
        fallback_title: str,
        fallback_source: str,
        content: str,
    ) -> dict[str, Any]:
        doc_id = str(metadata.get("doc_id") or fallback_doc_id).strip()
        title = str(metadata.get("title") or fallback_title).strip()

        weapon = str(metadata.get("weapon") or "general").strip().lower()
        topic = str(metadata.get("topic") or "general").strip().lower()
        level = str(metadata.get("level") or "all").strip().lower()
        language = str(metadata.get("language") or "zh").strip().lower()
        source = str(metadata.get("source") or fallback_source).strip()
        updated_at = str(metadata.get("updated_at") or "").strip()

        return {
            "doc_id": doc_id or fallback_doc_id,
            "title": title or fallback_title,
            "weapon": weapon or "general",
            "topic": topic or "general",
            "level": level or "all",
            "language": language or "zh",
            "source": source or fallback_source,
            "updated_at": updated_at,
            "content": content,
        }

    def _parse_frontmatter(self, content: str) -> tuple[dict[str, str], str]:
        if not content.startswith("---\n"):
            return {}, content

        lines = content.splitlines()
        metadata_lines: list[str] = []

        for idx in range(1, len(lines)):
            line = lines[idx]
            if line.strip() == "---":
                metadata = self._parse_key_values(metadata_lines)
                body = "\n".join(lines[idx + 1 :]).strip()
                return metadata, body
            metadata_lines.append(line)

        return {}, content

    @staticmethod
    def _parse_key_values(lines: list[str]) -> dict[str, str]:
        metadata: dict[str, str] = {}
        for raw in lines:
            if ":" not in raw:
                continue
            key, value = raw.split(":", 1)
            metadata[key.strip()] = value.strip().strip('"').strip("'")
        return metadata

    def _chunk_text(self, text: str) -> list[str]:
        normalized = text.replace("\r\n", "\n").strip()
        if not normalized:
            return []

        if len(normalized) <= self.chunk_size:
            return [normalized]

        chunks: list[str] = []
        start = 0
        length = len(normalized)

        while start < length:
            end = min(length, start + self.chunk_size)
            chunk = normalized[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= length:
                break
            start = end - self.chunk_overlap

        return chunks

    @staticmethod
    def _infer_title(stem: str, body: str) -> str:
        for line in body.splitlines():
            clean = line.strip()
            if not clean:
                continue
            if clean.startswith("#"):
                return clean.lstrip("#").strip() or stem
            return clean[:80]
        return stem
