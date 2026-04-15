import React, { useEffect, useState } from "react";
import { useStore } from "../store";

export const FilterBar: React.FC = () => {
  const search = useStore((s) => s.filters.search);
  const setSearch = useStore((s) => s.setSearch);
  const focusUrl = useStore((s) => s.focusUrl);
  const urlFilterToUrl = useStore((s) => s.filters.urlFilterToUrl);
  const stats = useStore((s) => s.stats);
  const baseUrl = useStore((s) => s.baseUrl);
  const startCrawl = useStore((s) => s.startCrawl);
  const stopCrawl = useStore((s) => s.stopCrawl);
  const pauseResume = useStore((s) => s.pauseResume);
  const continueCrawl = useStore((s) => s.continueCrawl);
  const canContinue = useStore((s) => s.canContinue);
  const [url, setUrl] = useState<string>(baseUrl ?? "");
  const [edited, setEdited] = useState(false);

  // Keep the URL box in sync with whichever crawl is currently loaded,
  // unless the user has started typing their own URL.
  useEffect(() => {
    if (!edited && baseUrl) {
      setUrl(baseUrl);
    }
  }, [baseUrl, edited]);

  const isActive = stats.status === "running" || stats.status === "paused";

  return (
    <div className="w-full flex items-center gap-2 px-3 py-2 border-b border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)]">
      <input
        type="text"
        placeholder="Filter URLs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full min-w-0 px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
      />
      <div className="flex-1" />

      {urlFilterToUrl ? (
        <button
          onClick={() => focusUrl(null)}
          className="px-2 py-1 text-xs rounded text-nowrap border border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text-dim)] hover:text-[color:var(--color-sc-text)]"
          title="Clear URL filter"
        >
          Clear: {truncate(urlFilterToUrl, 40)} ✕
        </button>
      ) : null}

      <div className="w-full flex items-center gap-2 pl-2 border-l border-[color:var(--color-sc-border)]">
        {isActive ? (
          <>
            <button
              onClick={pauseResume}
              className="px-2 py-1 text-xs text-nowrap rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
            >
              {stats.status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={stopCrawl}
              className="px-2 py-1 text-nowrap text-xs font-medium text-white rounded bg-[color:var(--color-sc-err)] hover:opacity-90"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            {canContinue ? (
              <button
                onClick={continueCrawl}
                className="px-2 text-nowrap py-1 text-xs font-medium text-white rounded bg-[color:var(--color-sc-accent)] hover:bg-[color:var(--color-sc-accent-hover)]"
                title="Resume crawling and PageSpeed from where this crawl stopped"
              >
                Continue crawl
              </button>
            ) : null}
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://\u2026"
              className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
            />
            <button
              onClick={() => url.trim() && startCrawl(url.trim())}
              disabled={!url.trim()}
              className="px-2 py-1 text-nowrap text-xs font-medium text-white rounded bg-[color:var(--color-sc-accent)] hover:bg-[color:var(--color-sc-accent-hover)] disabled:opacity-50"
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
