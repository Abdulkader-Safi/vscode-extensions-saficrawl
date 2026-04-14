import React from "react";
import { useStore, type TabId } from "../store";

interface RailItem {
  id: TabId;
  label: string;
  icon: string;
}

const PRIMARY: RailItem[] = [
  { id: "overview", label: "Overview", icon: "\u25A4" },
  { id: "issues", label: "Issues", icon: "\u26A0" },
  { id: "links", label: "Links", icon: "\u21AA" },
  { id: "pagespeed", label: "PageSpeed", icon: "\u26A1" },
  { id: "visualization", label: "Visualization", icon: "\u25CE" },
  { id: "settings", label: "Settings", icon: "\u2699" },
];

export const LeftRail: React.FC = () => {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const stats = useStore((s) => s.stats);
  const baseUrl = useStore((s) => s.baseUrl);

  return (
    <aside className="flex flex-col w-56 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
      <div className="flex flex-col py-2">
        {PRIMARY.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={
                "flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors " +
                (active
                  ? "bg-[color:var(--color-sc-bg-raised)] text-[color:var(--color-sc-text)] border-l-2 border-[color:var(--color-sc-accent)]"
                  : "text-[color:var(--color-sc-text-dim)] hover:bg-[color:var(--color-sc-bg-raised)] border-l-2 border-transparent")
              }
            >
              <span aria-hidden className="inline-block w-5 text-center">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-3 mt-4">
        <div className="mb-1 text-xs tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Current Crawl
        </div>
        <div className="p-2 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
          <div
            className="text-xs truncate text-[color:var(--color-sc-text-dim)]"
            title={baseUrl ?? undefined}
          >
            {baseUrl ?? "No active crawl"}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-[color:var(--color-sc-text)] tabular-nums">
            <div className="flex justify-between">
              <span className="text-[color:var(--color-sc-text-faint)]">
                URLs
              </span>
              <span>{stats.crawled.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-sc-text-faint)]">
                Queue
              </span>
              <span>{stats.queued.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-sc-text-faint)]">
                Speed
              </span>
              <span>{stats.urlsPerSec.toFixed(1)}/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-sc-text-faint)]">
                Time
              </span>
              <span>{(stats.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto px-3 py-3 text-[11px] text-[color:var(--color-sc-text-faint)] border-t border-[color:var(--color-sc-border)]">
        SafiCrawl v0.1.0
      </div>
    </aside>
  );
};
