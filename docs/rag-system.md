# RAG System Notes

This project now uses a fully connected local RAG path:

- vector store: local Chroma in `/Users/cage/fencing-ai/data/chroma`
- embedding provider: configurable `auto / bailian / qianfan` in `backend/app/core/config.py`
- retriever: `backend/app/services/rag/retrieve.py`
- prompt assembly: `backend/app/services/rag/prompt_builder.py`
- chat orchestration: `backend/app/services/llm.py`
- default knowledge source: `/Users/cage/fencing-ai/knowledge`

This repo now keeps framework only.
No default knowledge documents or seeded evaluation cases are shipped for ingestion.

## What Was Fixed

- frontend chat requests now send `use_kb: true`
- frontend passes `weapon` when the chat is linked to a specific video
- assistant responses now surface retrieval citations in the chat UI
- persisted chat history now returns stored citations and retrieval metadata
- runtime RAG evidence is no longer mixed with hardcoded static knowledge in the system prompt
- ingest now points only to your configured knowledge directory

## How To Ingest Knowledge

Use the admin API or call the ingest route from your admin panel:

- `POST /api/admin/kb/ingest`
- `POST /api/admin/kb/reindex`

Default ingest directory:

- `/Users/cage/fencing-ai/knowledge`

Recommended file formats:

- `.pdf` for text-based PDFs
- `.jsonl` for atomic QA cards and structured chunks
- `.md` for longer curated reference documents with frontmatter metadata

Current limitation:

- image-only or scanned PDFs without extractable text will be skipped with warnings
- OCR is not included in the current framework

Recommended metadata fields:

- `doc_id`
- `title`
- `weapon`
- `topic`
- `level`
- `language`
- `source`
- `updated_at`

## Recommended Embedding Config

For Aliyun Bailian:

- `EMBEDDING_PROVIDER=auto` or `EMBEDDING_PROVIDER=bailian`
- `BAILIAN_API_KEY=...`
- `BAILIAN_EMBED_MODEL=text-embedding-v4`
- `BAILIAN_EMBED_DIMENSIONS=1024`

## How To Extend It Properly

For your real corpus, do not dump everything as a few giant markdown files. Convert it into smaller domain units:

- one rule explanation per card
- one technique fault and correction per card
- one tactical pattern per card
- one drill or training block per card

That keeps retrieval precise and makes reranking optional rather than mandatory on day one.
