import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { VirtualTable, type Column } from "../components/VirtualTable";
import type { LinkRow } from "../../types/messages";
import { statusClass } from "../components/urlColumns";

type ScopeFilter = "all" | "internal" | "external";
type PlacementFilter = "all" | "navigation" | "body" | "footer";

const COLUMNS: Column<LinkRow>[] = [
  {
    id: "source",
    header: "Source",
    width: 320,
    render: (r) => (
      <span className="font-mono truncate" title={r.sourceUrl}>
        {r.sourceUrl}
      </span>
    ),
    sortBy: (r) => r.sourceUrl,
  },
  {
    id: "target",
    header: "Target",
    width: 320,
    render: (r) => (
      <span className="font-mono truncate" title={r.targetUrl}>
        {r.targetUrl}
      </span>
    ),
    sortBy: (r) => r.targetUrl,
  },
  {
    id: "anchor",
    header: "Anchor",
    width: 220,
    render: (r) => (
      <span
        className="truncate text-[color:var(--color-sc-text-dim)]"
        title={r.anchorText}
      >
        {r.anchorText || "\u2014"}
      </span>
    ),
    sortBy: (r) => r.anchorText,
  },
  {
    id: "type",
    header: "Type",
    width: 76,
    render: (r) => (
      <span
        className={
          r.isInternal
            ? "text-[color:var(--color-sc-ok)]"
            : "text-[color:var(--color-sc-info)]"
        }
      >
        {r.isInternal ? "Internal" : "External"}
      </span>
    ),
    sortBy: (r) => (r.isInternal ? 0 : 1),
  },
  {
    id: "placement",
    header: "Placement",
    width: 100,
    render: (r) => (
      <span className="text-[color:var(--color-sc-text-dim)] capitalize">
        {r.placement}
      </span>
    ),
    sortBy: (r) => r.placement,
  },
  {
    id: "status",
    header: "Status",
    width: 70,
    render: (r) => (
      <span className={"font-mono " + statusClass(r.targetStatus)}>
        {r.targetStatus ?? "\u2014"}
      </span>
    ),
    sortBy: (r) => r.targetStatus,
  },
];

export const LinksPage: React.FC = () => {
  const links = useStore((s) => s.links);
  const urls = useStore((s) => s.urls);
  const search = useStore((s) => s.filters.search);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [placement, setPlacement] = useState<PlacementFilter>("all");

  const stats = useMemo(() => {
    let total = 0,
      internal = 0,
      external = 0,
      broken = 0;
    const byPlacement: Record<PlacementFilter, number> = {
      all: 0,
      navigation: 0,
      body: 0,
      footer: 0,
    };
    const urlStatusMap = new Map<string, number | null>();
    for (const u of urls) urlStatusMap.set(u.url, u.statusCode);

    for (const l of links) {
      total++;
      if (l.isInternal) internal++;
      else external++;
      byPlacement[l.placement]++;
      const s = l.targetStatus ?? urlStatusMap.get(l.targetUrl) ?? null;
      if (s !== null && s >= 400) broken++;
    }
    return { total, internal, external, broken, byPlacement };
  }, [links, urls]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter((l) => {
      if (scope === "internal" && !l.isInternal) return false;
      if (scope === "external" && l.isInternal) return false;
      if (placement !== "all" && l.placement !== placement) return false;
      if (
        q &&
        !l.sourceUrl.toLowerCase().includes(q) &&
        !l.targetUrl.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [links, scope, placement, search]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-48 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
        <SidebarSection title="Total">
          <Stat
            label="All links"
            value={stats.total}
            active={scope === "all"}
            onClick={() => setScope("all")}
          />
          <Stat
            label="Internal"
            value={stats.internal}
            active={scope === "internal"}
            onClick={() => setScope("internal")}
            accent="text-[color:var(--color-sc-ok)]"
          />
          <Stat
            label="External"
            value={stats.external}
            active={scope === "external"}
            onClick={() => setScope("external")}
            accent="text-[color:var(--color-sc-info)]"
          />
          <Stat
            label="Broken"
            value={stats.broken}
            accent="text-[color:var(--color-sc-err)]"
          />
        </SidebarSection>
        <SidebarSection title="Placement">
          <Stat
            label="All"
            value={stats.total}
            active={placement === "all"}
            onClick={() => setPlacement("all")}
          />
          <Stat
            label="Navigation"
            value={stats.byPlacement.navigation}
            active={placement === "navigation"}
            onClick={() => setPlacement("navigation")}
          />
          <Stat
            label="Body"
            value={stats.byPlacement.body}
            active={placement === "body"}
            onClick={() => setPlacement("body")}
          />
          <Stat
            label="Footer"
            value={stats.byPlacement.footer}
            active={placement === "footer"}
            onClick={() => setPlacement("footer")}
          />
        </SidebarSection>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="px-4 py-2 text-xs text-[color:var(--color-sc-text-dim)]">
          Showing {rows.length.toLocaleString()} of{" "}
          {links.length.toLocaleString()} links
        </div>
        <VirtualTable
          rows={rows}
          columns={COLUMNS}
          storageKey="saficrawl.links.widths"
          rowKey={(r, i) => `${r.sourceUrl}|${r.targetUrl}-${i}`}
          emptyLabel="No links discovered yet."
        />
      </div>
    </div>
  );
};

const SidebarSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="mb-4">
    <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
      {title}
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const Stat: React.FC<{
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
}> = ({ label, value, active, onClick, accent }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={
      "w-full flex items-center justify-between px-2 py-1 text-xs rounded " +
      (active
        ? "bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-accent)]"
        : "hover:bg-[color:var(--color-sc-bg-raised)] border border-transparent")
    }
  >
    <span className={accent ?? ""}>{label}</span>
    <span className="tabular-nums text-[color:var(--color-sc-text-dim)]">
      {value.toLocaleString()}
    </span>
  </button>
);
