import React, { useMemo, useState } from "react";
import { useStore, severityCounts } from "../store";
import type { IssueRow } from "../../types/messages";

type SeverityFilter = "all" | "error" | "warning" | "info";

const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  meta_description: "Meta Description",
  headings: "Headings",
  content: "Content",
  technical: "Technical",
  mobile: "Mobile",
  accessibility: "Accessibility",
  social: "Social Media",
  structured_data: "Structured Data",
  performance: "Performance",
  indexability: "Indexability",
  duplication: "Duplication",
};

export const IssuesPage: React.FC = () => {
  const issues = useStore((s) => s.issues);
  const focusUrl = useStore((s) => s.focusUrl);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => severityCounts(issues), [issues]);

  const categoryCounts = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const i of issues)
      byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
    return [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (severity !== "all" && i.type !== severity) return false;
      if (category && i.category !== category) return false;
      return true;
    });
  }, [issues, severity, category]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, IssueRow[]>();
    for (const i of filtered) {
      const arr = byCat.get(i.category) ?? [];
      arr.push(i);
      byCat.set(i.category, arr);
    }
    return [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-52 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)] overflow-auto">
        <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Severity
        </div>
        <div className="space-y-0.5 mb-4">
          <SidebarPill
            label="All"
            count={issues.length}
            active={severity === "all"}
            onClick={() => setSeverity("all")}
          />
          <SidebarPill
            label="Errors"
            count={counts.errors}
            active={severity === "error"}
            onClick={() => setSeverity("error")}
            dot="bg-[color:var(--color-sc-err)]"
          />
          <SidebarPill
            label="Warnings"
            count={counts.warnings}
            active={severity === "warning"}
            onClick={() => setSeverity("warning")}
            dot="bg-[color:var(--color-sc-warn)]"
          />
          <SidebarPill
            label="Info"
            count={counts.info}
            active={severity === "info"}
            onClick={() => setSeverity("info")}
            dot="bg-[color:var(--color-sc-info)]"
          />
        </div>

        <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Categories
        </div>
        <div className="space-y-0.5">
          <SidebarPill
            label="All"
            count={issues.length}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {categoryCounts.map(([cat, count]) => (
            <SidebarPill
              key={cat}
              label={CATEGORY_LABELS[cat] ?? cat}
              count={count}
              active={category === cat}
              onClick={() => setCategory(cat)}
            />
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-auto">
        {grouped.length === 0 ? (
          <div className="p-8 text-center text-[color:var(--color-sc-text-faint)] text-sm">
            {issues.length === 0
              ? "No issues detected yet."
              : "No issues match the current filters."}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {grouped.map(([cat, rows]) => {
              const isOpen = expanded[cat] ?? true;
              return (
                <section key={cat}>
                  <button
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [cat]: !isOpen }))
                    }
                    className="flex items-center gap-2 mb-2 text-sm font-semibold"
                  >
                    <span className="text-[color:var(--color-sc-text-faint)]">
                      {isOpen ? "\u25BC" : "\u25B6"}
                    </span>
                    <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="px-1.5 py-0.5 text-[11px] rounded bg-[color:var(--color-sc-bg-raised)] text-[color:var(--color-sc-text-dim)]">
                      {rows.length}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-2">
                      {rows.map((issue, idx) => (
                        <IssueCard
                          key={`${issue.url}-${issue.issue}-${idx}`}
                          issue={issue}
                          onFocusUrl={() => focusUrl(issue.url)}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const IssueCard: React.FC<{ issue: IssueRow; onFocusUrl: () => void }> = ({
  issue,
  onFocusUrl,
}) => {
  const severityColor =
    issue.type === "error"
      ? "bg-[color:var(--color-sc-err)]"
      : issue.type === "warning"
        ? "bg-[color:var(--color-sc-warn)]"
        : "bg-[color:var(--color-sc-info)]";
  return (
    <div className="flex gap-3 p-3 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
      <div
        className={"w-2 h-2 mt-1.5 rounded-full shrink-0 " + severityColor}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">{issue.issue}</div>
          <button
            onClick={onFocusUrl}
            className="text-[11px] text-[color:var(--color-sc-accent)] hover:underline"
          >
            View URL \u2192
          </button>
        </div>
        <div className="mt-0.5 text-xs text-[color:var(--color-sc-text-dim)]">
          {issue.details}
        </div>
        <div
          className="mt-1 text-[11px] font-mono truncate text-[color:var(--color-sc-text-faint)]"
          title={issue.url}
        >
          {issue.url}
        </div>
      </div>
    </div>
  );
};

const SidebarPill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dot?: string;
}> = ({ label, count, active, onClick, dot }) => (
  <button
    onClick={onClick}
    className={
      "w-full flex items-center justify-between px-2 py-1 text-xs rounded border " +
      (active
        ? "border-[color:var(--color-sc-accent)] bg-[color:var(--color-sc-bg-raised)]"
        : "border-transparent hover:bg-[color:var(--color-sc-bg-raised)]")
    }
  >
    <span className="flex items-center gap-2">
      {dot ? <span className={"w-1.5 h-1.5 rounded-full " + dot} /> : null}
      {label}
    </span>
    <span className="tabular-nums text-[color:var(--color-sc-text-dim)]">
      {count.toLocaleString()}
    </span>
  </button>
);
