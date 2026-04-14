import React, { useMemo } from "react";
import { useStore } from "../store";
import { VirtualTable } from "../components/VirtualTable";
import { URL_COLUMNS } from "../components/urlColumns";

export const ExternalPage: React.FC = () => {
  const urls = useStore((s) => s.urls);
  const search = useStore((s) => s.filters.search);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return urls.filter(
      (u) => !u.internal && (!q || u.url.toLowerCase().includes(q)),
    );
  }, [urls, search]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 text-xs text-[color:var(--color-sc-text-dim)]">
        {rows.length.toLocaleString()} external URLs
      </div>
      <VirtualTable
        rows={rows}
        columns={URL_COLUMNS}
        storageKey="saficrawl.external.widths"
        rowKey={(r, i) => `${r.url}-${i}`}
        emptyLabel="No external URLs found."
      />
    </div>
  );
};
