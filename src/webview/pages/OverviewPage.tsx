import React, { useMemo } from "react";
import { useStore } from "../store";
import { VirtualTable } from "../components/VirtualTable";
import { URL_COLUMNS } from "../components/urlColumns";

export const OverviewPage: React.FC = () => {
  const urls = useStore((s) => s.urls);
  const search = useStore((s) => s.filters.search);
  const focused = useStore((s) => s.filters.urlFilterToUrl);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return urls.filter((u) => {
      if (focused && u.url !== focused) return false;
      if (!q) return true;
      return (
        u.url.toLowerCase().includes(q) ||
        (u.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [urls, search, focused]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 text-xs text-[color:var(--color-sc-text-dim)]">
        Showing {rows.length.toLocaleString()} of {urls.length.toLocaleString()}{" "}
        URLs
      </div>
      <VirtualTable
        rows={rows}
        columns={URL_COLUMNS}
        storageKey="saficrawl.overview.widths"
        rowKey={(r, i) => `${r.url}-${i}`}
        emptyLabel="No URLs crawled yet. Start a crawl to populate this table."
      />
    </div>
  );
};
