import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { VirtualTable } from "../components/VirtualTable";
import { URL_COLUMNS, statusClass } from "../components/urlColumns";

export const StatusCodesPage: React.FC = () => {
  const urls = useStore((s) => s.urls);
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const u of urls) {
      const key = u.statusCode === null ? "unknown" : bucketKey(u.statusCode);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [urls]);

  const rows = useMemo(() => {
    if (!selected) return urls;
    return urls.filter(
      (u) =>
        (u.statusCode === null ? "unknown" : bucketKey(u.statusCode)) ===
        selected,
    );
  }, [urls, selected]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-[color:var(--color-sc-border)]">
        <GroupPill
          label="All"
          count={urls.length}
          active={selected === null}
          onClick={() => setSelected(null)}
        />
        {groups.map(([key, count]) => (
          <GroupPill
            key={key}
            label={key}
            count={count}
            active={selected === key}
            accent={accentForKey(key)}
            onClick={() => setSelected(key)}
          />
        ))}
      </div>
      <VirtualTable
        rows={rows}
        columns={URL_COLUMNS}
        storageKey="saficrawl.status.widths"
        rowKey={(r, i) => `${r.url}-${i}`}
        emptyLabel="No URLs in this group."
      />
    </div>
  );
};

function bucketKey(code: number): string {
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500) return "5xx";
  return "unknown";
}

function accentForKey(key: string): string {
  if (key.startsWith("2")) return "sc-status-2xx";
  if (key.startsWith("3")) return "sc-status-3xx";
  if (key.startsWith("4")) return "sc-status-4xx";
  if (key.startsWith("5")) return "sc-status-5xx";
  return statusClass(null);
}

const GroupPill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  accent?: string;
  onClick: () => void;
}> = ({ label, count, active, accent, onClick }) => (
  <button
    onClick={onClick}
    className={
      "flex items-center gap-2 px-3 py-1.5 text-xs rounded border " +
      (active
        ? "border-[color:var(--color-sc-accent)] bg-[color:var(--color-sc-bg-raised)]"
        : "border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]")
    }
  >
    <span className={"font-semibold " + (accent ?? "")}>{label}</span>
    <span className="text-[color:var(--color-sc-text-faint)] tabular-nums">
      {count.toLocaleString()}
    </span>
  </button>
);
