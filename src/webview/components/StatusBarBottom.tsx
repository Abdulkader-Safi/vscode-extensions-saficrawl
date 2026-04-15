import React from "react";
import { useStore } from "../store";
import { send } from "../messaging";

const AUTHOR_URL = "https://abdulkadersafi.com";

export const StatusBarBottom: React.FC = () => {
  const stats = useStore((s) => s.stats);
  const env = useStore((s) => s.env);

  const primary = (() => {
    switch (stats.status) {
      case "running":
        return `Crawling ${stats.crawled.toLocaleString()}/${stats.maxUrls.toLocaleString()} \u2022 ${stats.urlsPerSec.toFixed(1)} URLs/s \u2022 ${(stats.elapsedMs / 1000).toFixed(1)}s`;
      case "paused":
        return `Paused at ${stats.crawled.toLocaleString()} URLs`;
      case "stopping":
        return `Stopping\u2026`;
      case "completed":
        return `Crawl complete \u2022 ${stats.crawled.toLocaleString()} URLs \u2022 ${stats.errors} errors`;
      case "error":
        return `Crawl error`;
      default:
        return `Ready`;
    }
  })();

  return (
    <footer className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] text-[color:var(--color-sc-text-dim)] border-t border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
      <span className={statusClass(stats.status)}>{primary}</span>
      <span className="flex items-center gap-3 text-[color:var(--color-sc-text-faint)]">
        <span>
          {env
            ? `${env.isWebVsCode ? "Web" : "Desktop"} • Playwright ${env.playwrightInstalled ? "ready" : "off"}`
            : "…"}
        </span>
        <span>
          developed by{" "}
          <a
            href={AUTHOR_URL}
            onClick={(e) => {
              e.preventDefault();
              send({ type: "openExternal", url: AUTHOR_URL });
            }}
            className="underline text-[color:var(--color-sc-text-dim)] hover:text-[color:var(--color-sc-text)]"
          >
            Abdulkader Safi
          </a>
        </span>
      </span>
    </footer>
  );
};

function statusClass(status: string): string {
  switch (status) {
    case "running":
      return "text-[color:var(--color-sc-accent)]";
    case "paused":
      return "text-[color:var(--color-sc-warn)]";
    case "error":
      return "text-[color:var(--color-sc-err)]";
    case "completed":
      return "text-[color:var(--color-sc-info)]";
    default:
      return "";
  }
}
