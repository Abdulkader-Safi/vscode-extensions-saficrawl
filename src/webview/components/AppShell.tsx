import React from "react";
import { useStore } from "../store";
import { TabStrip } from "./TabStrip";
import { FilterBar } from "./FilterBar";
import { StatusBarBottom } from "./StatusBarBottom";
import { OverviewPage } from "../pages/OverviewPage";
import { InternalPage } from "../pages/InternalPage";
import { ExternalPage } from "../pages/ExternalPage";
import { StatusCodesPage } from "../pages/StatusCodesPage";
import { LinksPage } from "../pages/LinksPage";
import { IssuesPage } from "../pages/IssuesPage";
import { PageSpeedPage } from "../pages/PageSpeedPage";
import { VisualizationPage } from "../pages/VisualizationPage";
import { HistoryPage } from "../pages/HistoryPage";
import { SettingsPage } from "../pages/SettingsPage";

export const AppShell: React.FC = () => {
  const activeTab = useStore((s) => s.activeTab);

  return (
    <div className="flex flex-col w-screen h-screen">
      <TabStrip />
      <FilterBar />
      <main className="flex-1 min-h-0 overflow-auto">
        {renderTab(activeTab)}
      </main>
      <StatusBarBottom />
    </div>
  );
};

function renderTab(tab: string) {
  switch (tab) {
    case "overview":
      return <OverviewPage />;
    case "internal":
      return <InternalPage />;
    case "external":
      return <ExternalPage />;
    case "statusCodes":
      return <StatusCodesPage />;
    case "links":
      return <LinksPage />;
    case "issues":
      return <IssuesPage />;
    case "pagespeed":
      return <PageSpeedPage />;
    case "visualization":
      return <VisualizationPage />;
    case "history":
      return <HistoryPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return null;
  }
}
