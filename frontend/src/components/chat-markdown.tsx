"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMarkdownProps {
  content?: string | null;
}

const chatMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 text-base font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 text-sm font-semibold text-foreground">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-7 text-foreground/90">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-foreground/90">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
  hr: () => <hr className="my-4 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="rounded-r-xl border-l-4 border-red-500/70 bg-white/55 px-4 py-3 text-sm text-foreground/85 dark:bg-black/10">
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
  pre: ({ children }) => <pre className="overflow-x-auto rounded-2xl border border-border bg-background/80 p-4">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-2xl border border-border bg-background/70">
      <table className="min-w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background/90 text-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&_tr:last-child]:border-b-0">{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border align-top">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-3 font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 leading-6 text-foreground/85">{children}</td>,
};

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const normalizedContent = content?.trim() ?? "";

  if (!normalizedContent) {
    return null;
  }

  return (
    <div className="space-y-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
