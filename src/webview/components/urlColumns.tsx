import React from "react";
import type { UrlRow } from "../../types/messages";
import type { Column } from "./VirtualTable";

export function statusClass(code: number | null): string {
  if (code === null) return "sc-status-none";
  if (code >= 200 && code < 300) return "sc-status-2xx";
  if (code >= 300 && code < 400) return "sc-status-3xx";
  if (code >= 400 && code < 500) return "sc-status-4xx";
  if (code >= 500) return "sc-status-5xx";
  return "sc-status-none";
}

export const URL_COLUMNS: Column<UrlRow>[] = [
  {
    id: "url",
    header: "URL",
    width: 420,
    minWidth: 160,
    render: (r) => <span className="font-mono truncate" title={r.url}>{r.url}</span>,
    sortBy: (r) => r.url,
  },
  {
    id: "status",
    header: "Status",
    width: 70,
    render: (r) => <span className={"font-mono " + statusClass(r.statusCode)}>{r.statusCode ?? "\u2014"}</span>,
    sortBy: (r) => r.statusCode,
  },
  {
    id: "title",
    header: "Title",
    width: 320,
    render: (r) => <span className="truncate text-[color:var(--color-sc-text-dim)]" title={r.title ?? undefined}>{r.title ?? "\u2014"}</span>,
    sortBy: (r) => r.title,
  },
  {
    id: "words",
    header: "Words",
    width: 72,
    render: (r) => <span className="font-mono text-[color:var(--color-sc-text-dim)]">{r.wordCount ?? "\u2014"}</span>,
    sortBy: (r) => r.wordCount,
  },
  {
    id: "load",
    header: "Load",
    width: 80,
    render: (r) => <span className="font-mono text-[color:var(--color-sc-text-dim)]">{r.loadTimeMs != null ? `${r.loadTimeMs}ms` : "\u2014"}</span>,
    sortBy: (r) => r.loadTimeMs,
  },
  {
    id: "issues",
    header: "Issues",
    width: 72,
    render: (r) => (
      <span className={"font-mono " + (r.issueCount > 0 ? "text-[color:var(--color-sc-warn)]" : "text-[color:var(--color-sc-text-faint)]")}>
        {r.issueCount}
      </span>
    ),
    sortBy: (r) => r.issueCount,
  },
  {
    id: "depth",
    header: "Depth",
    width: 64,
    render: (r) => <span className="font-mono text-[color:var(--color-sc-text-faint)]">{r.depth}</span>,
    sortBy: (r) => r.depth,
  },
];
