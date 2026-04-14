#!/usr/bin/env python3
"""
Run retrieval-only evaluation against the local RAG service.

Usage:
  cd backend
  .venv/bin/python scripts/run_rag_retrieval_eval.py --input ../evals/your_retrieval_eval.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import warnings
from pathlib import Path
from typing import Any

try:
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    pass


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

for logger_name in (
    "chromadb.telemetry.product.posthog",
    "chromadb.telemetry",
    "posthog",
):
    logging.getLogger(logger_name).setLevel(logging.CRITICAL)

from app.services.rag import rag_service


def _load_cases(path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line_no, raw_line in enumerate(fh, start=1):
            line = raw_line.strip()
            if not line:
                continue
            data = json.loads(line)
            if not isinstance(data, dict):
                raise ValueError(f"Line {line_no} is not a JSON object")
            cases.append(data)
    return cases


async def _evaluate_case(case: dict[str, Any], top_k: int) -> dict[str, Any]:
    query = str(case.get("query") or "").strip()
    if not query:
        raise ValueError(f"Case {case.get('id') or '<unknown>'} is missing query")

    filters = case.get("filters") or case.get("kb_filters") or {}
    if not isinstance(filters, dict):
        filters = {}

    expected_doc_ids = [
        str(item).strip()
        for item in case.get("expected_doc_ids", [])
        if str(item).strip()
    ]
    expected_set = set(expected_doc_ids)

    hits, retrieval_meta = await rag_service.search_knowledge(
        query=query,
        top_k=top_k,
        kb_filters=filters,
    )
    hit_doc_ids = [str(item.get("doc_id") or "").strip() for item in hits]

    matched_rank = next(
        (index + 1 for index, doc_id in enumerate(hit_doc_ids) if doc_id in expected_set),
        None,
    )
    reciprocal_rank = 0.0 if matched_rank is None else round(1.0 / matched_rank, 6)

    return {
        "id": case.get("id"),
        "query": query,
        "filters": filters,
        "expected_doc_ids": expected_doc_ids,
        "hit_doc_ids": hit_doc_ids,
        "matched_rank": matched_rank,
        "hit": matched_rank is not None,
        "reciprocal_rank": reciprocal_rank,
        "retrieval_meta": retrieval_meta,
    }


async def _run(input_path: Path, top_k: int) -> dict[str, Any]:
    cases = _load_cases(input_path)
    results: list[dict[str, Any]] = []

    for case in cases:
        results.append(await _evaluate_case(case, top_k))

    hit_count = sum(1 for item in results if item["hit"])
    reciprocal_rank_sum = sum(float(item["reciprocal_rank"]) for item in results)
    total = len(results)

    return {
        "input": str(input_path),
        "top_k": top_k,
        "total": total,
        "hit_count": hit_count,
        "recall_at_k": round(hit_count / total, 4) if total else 0.0,
        "mrr": round(reciprocal_rank_sum / total, 4) if total else 0.0,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate local RAG retrieval quality.")
    parser.add_argument("--input", required=True, help="Path to retrieval_eval.jsonl")
    parser.add_argument("--top-k", type=int, default=6, help="Number of retrieval hits to inspect")
    parser.add_argument("--output", default="", help="Optional path to write the JSON report")
    args = parser.parse_args()

    summary = asyncio.run(_run(Path(args.input), max(1, int(args.top_k))))
    rendered = json.dumps(summary, ensure_ascii=False, indent=2)
    print(rendered)

    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
