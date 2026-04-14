import React, { useState } from "react";
import { useStore } from "../store";

export const FilterBar: React.FC = () => {
  const search = useStore((s) => s.filters.search);
  const setSearch = useStore((s) => s.setSearch);
  const focusUrl = useStore((s) => s.focusUrl);
  const urlFilterToUrl = useStore((s) => s.filters.urlFilterToUrl);
  const stats = useStore((s) => s.stats);
  const startCrawl = useStore((s) => s.startCrawl);
  const stopCrawl = useStore((s) => s.stopCrawl);
  const pauseResume = useStore((s) => s.pauseResume);
  const [url, setUrl] = useState<string>("https://example.com");

  const isActive = stats.status === "running" || stats.status === "paused";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)]">
      <input
        type="text"
        placeholder="Filter URLs\u2026"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
      />

      {urlFilterToUrl ? (
        <button
          onClick={() => focusUrl(null)}
          className="px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text-dim)] hover:text-[color:var(--color-sc-text)]"
          title="Clear URL filter"
        >
          Clear: {truncate(urlFilterToUrl, 40)} \u2715
        </button>
      ) : null}

      <div className="flex items-center gap-2 pl-2 border-l border-[color:var(--color-sc-border)]">
        {isActive ? (
          <>
            <button
              onClick={pauseResume}
              className="px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
            >
              {stats.status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={stopCrawl}
              className="px-2 py-1 text-xs font-medium text-white rounded bg-[color:var(--color-sc-err)] hover:opacity-90"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://\u2026"
              className="w-56 px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
            />
            <button
              onClick={() => url.trim() && startCrawl(url.trim())}
              disabled={!url.trim()}
              className="px-2 py-1 text-xs font-medium text-white rounded bg-[color:var(--color-sc-accent)] hover:bg-[color:var(--color-sc-accent-hover)] disabled:opacity-50"
            >
              Start Crawl
            </button>
          </>
        )}
      </div>
    </div>
  );
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}
