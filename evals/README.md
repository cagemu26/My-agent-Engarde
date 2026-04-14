# RAG Evaluation Files

Use this directory to keep your own stable evaluation sets for RAG.

This repo now only keeps the framework and directory convention.
No seeded evaluation questions are included.

## Retrieval Case Format

Each line is one JSON object:

```json
{
  "id": "your_case_id",
  "query": "your retrieval question",
  "filters": {
    "weapon": "your_weapon_or_general",
    "topic": "your_topic",
    "language": "zh_or_en"
  },
  "expected_doc_ids": ["your_expected_doc_id"]
}
```

## Run Retrieval Evaluation

```bash
cd /Users/cage/fencing-ai/backend
.venv/bin/python scripts/run_rag_retrieval_eval.py \
  --input /Users/cage/fencing-ai/evals/your_retrieval_eval.jsonl
```

## Recommended Files

- `retrieval_eval.jsonl`: retrieval-only evaluation set
- `answer_eval.jsonl`: answer-quality evaluation set
