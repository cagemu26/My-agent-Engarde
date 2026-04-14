from typing import Optional

from app.services.rag.types import CitationRecord


class PromptBuilderService:
    """Builds a structured context block for chat responses."""

    def build_context(
        self,
        base_context: Optional[str],
        citations: list[CitationRecord],
    ) -> Optional[str]:
        sections: list[str] = []

        if base_context:
            sections.append("## Video Context\n" + base_context.strip())

        if citations:
            evidence_lines = []
            for idx, citation in enumerate(citations, start=1):
                evidence_lines.append(
                    f"[K{idx}] title={citation.title}; source={citation.source}; "
                    f"chunk_id={citation.chunk_id}; score={citation.score:.4f}\n"
                    f"{citation.snippet.strip()}"
                )
            sections.append("## KB Evidence\n" + "\n\n".join(evidence_lines))

        sections.append(
            "## Output Rules\n"
            "- Use Chinese and keep advice actionable.\n"
            "- Separate video observations from KB evidence.\n"
            "- When citing KB evidence, quote the citation id such as [K1] or [K2].\n"
            "- If evidence is insufficient, state uncertainty clearly.\n"
            "- Return with this structure: 结论 / 证据引用 / 训练建议（1周/4周） / 不确定项."
        )

        if not sections:
            return None

        return "\n\n".join(sections)
