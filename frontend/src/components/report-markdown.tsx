"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReportMarkdownProps {
  content?: string | null;
  summary?: string | null;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight text-foreground">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="mt-8 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 text-lg font-semibold text-foreground">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 text-base font-semibold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="text-sm leading-7 text-foreground/90">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-foreground/90">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
  hr: () => <hr className="my-6 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="rounded-r-xl border-l-4 border-red-500/70 bg-red-50/70 px-4 py-3 text-sm text-foreground/85 dark:bg-red-950/20">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-red-600 underline decoration-red-300 underline-offset-4 hover:text-red-700"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/60 p-4">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full border-collapse bg-background text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/70 text-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&_tr:last-child]:border-b-0">{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border align-top">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-3 font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 leading-6 text-foreground/85">{children}</td>,
};

export function ReportMarkdown({ content, summary }: ReportMarkdownProps) {
  const normalizedContent = content?.trim() ?? "";
  const normalizedSummary = summary?.trim() ?? "";

  if (!normalizedContent) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        This report is empty. Regenerate it to fetch a fresh analysis.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {normalizedSummary && (
        <div className="rounded-2xl border border-red-200/70 bg-red-50/80 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">
            Coach Summary
          </p>
          <p className="mt-2 text-sm leading-7 text-foreground">{normalizedSummary}</p>
        </div>
      )}

      <div className="space-y-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {normalizedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
