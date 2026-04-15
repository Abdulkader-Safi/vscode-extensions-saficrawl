import React from "react";
import { useStore, type TabId } from "../store";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "internal", label: "Internal" },
  { id: "external", label: "External" },
  { id: "statusCodes", label: "Status Codes" },
  { id: "links", label: "Links" },
  { id: "issues", label: "Issues" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "visualization", label: "Visualization" },
  { id: "settings", label: "Settings" },
];

export const TabStrip: React.FC = () => {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const historyGroup = useStore((s) => s.historyGroup);
  const tabs: Tab[] = historyGroup
    ? [
        ...TABS.slice(0, TABS.length - 1),
        { id: "history", label: "History" },
        TABS[TABS.length - 1],
      ]
    : TABS;
  return (
    <div
      role="tablist"
      className="flex gap-1 px-3 pt-2 border-b border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)]"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab.id)}
            className={
              "px-3 pb-2 text-sm border-b-2 -mb-px " +
              (active
                ? "border-[color:var(--color-sc-accent)] text-[color:var(--color-sc-text)]"
                : "border-transparent text-[color:var(--color-sc-text-dim)] hover:text-[color:var(--color-sc-text)]")
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
