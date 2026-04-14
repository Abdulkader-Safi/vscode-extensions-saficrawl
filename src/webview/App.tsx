import React, { useEffect, useMemo, useState } from "react";
import { onMessage, send } from "./messaging";
import type {
  CrawlStats,
  HostToWebview,
  IssueRow,
  UrlRow,
} from "../types/messages";

const MAX_LIVE_URLS = 100;
const MAX_LIVE_ISSUES = 2000;

const IDLE_STATS: CrawlStats = {
  crawled: 0,
  queued: 0,
  maxUrls: 0,
  urlsPerSec: 0,
  elapsedMs: 0,
  errors: 0,
  status: "idle",
};

const App: React.FC = () => {
  const [stats, setStats] = useState<CrawlStats>(IDLE_STATS);
  const [env, setEnv] = useState<{
    isWebVsCode: boolean;
    playwrightInstalled: boolean;
  } | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [input, setInput] = useState<string>("https://example.com");
  const [urls, setUrls] = useState<UrlRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);

  useEffect(() => {
    const off = onMessage((msg: HostToWebview) => {
      switch (msg.type) {
        case "stats:tick":
          setStats(msg.stats);
          break;
        case "environment":
          setEnv({
            isWebVsCode: msg.isWebVsCode,
            playwrightInstalled: msg.playwrightInstalled,
          });
          break;
        case "crawl:started":
          setBaseUrl(msg.baseUrl);
          setUrls([]);
          setIssues([]);
          break;
        case "url:batch":
          setUrls((prev) => {
            const next = prev.concat(msg.rows);
            return next.length > MAX_LIVE_URLS
              ? next.slice(next.length - MAX_LIVE_URLS)
              : next;
          });
          break;
        case "issue:batch":
          setIssues((prev) => {
            const next = prev.concat(msg.rows);
            return next.length > MAX_LIVE_ISSUES
              ? next.slice(next.length - MAX_LIVE_ISSUES)
              : next;
          });
          break;
        case "crawl:done":
          setStats(msg.stats);
          break;
      }
    });
    send({ type: "ready" });
    return off;
  }, []);

  const severity = useMemo(() => {
    let errors = 0,
      warnings = 0,
      info = 0;
    for (const i of issues) {
      if (i.type === "error") errors++;
      else if (i.type === "warning") warnings++;
      else info++;
    }
    return { errors, warnings, info };
  }, [issues]);

  const isRunning = stats.status === "running" || stats.status === "paused";

  const onStart = () => {
    const url = input.trim();
    if (!url) return;
    send({ type: "crawl:start", url });
  };

  return (
    <div className="flex flex-col w-full h-screen text-gray-100 bg-gray-900">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">SafiCrawl</span>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-800 rounded">
            v0.1.0
          </span>
          <StatusPill status={stats.status} />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-80 px-2 py-1.5 text-sm border border-gray-700 rounded bg-gray-900 focus:outline-none focus:border-emerald-500"
            placeholder="https://example.com"
            disabled={isRunning}
          />
          {isRunning ? (
            <>
              <button
                className="px-3 py-1.5 text-sm font-medium bg-gray-700 rounded hover:bg-gray-600"
                onClick={() => send({ type: "crawl:pauseResume" })}
              >
                {stats.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium bg-red-600 rounded hover:bg-red-500"
                onClick={() => send({ type: "crawl:stop" })}
              >
                Stop
              </button>
            </>
          ) : (
            <button
              className="px-3 py-1.5 text-sm font-medium bg-emerald-600 rounded hover:bg-emerald-500 disabled:opacity-50"
              onClick={onStart}
              disabled={!input.trim()}
            >
              Start Crawl
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
          <StatsCard
            label="Crawled"
            value={stats.crawled.toLocaleString()}
            sub={`${stats.queued.toLocaleString()} queued`}
          />
          <StatsCard
            label="Speed"
            value={`${stats.urlsPerSec.toFixed(1)} URLs/s`}
            sub={`${(stats.elapsedMs / 1000).toFixed(1)}s elapsed`}
          />
          <StatsCard
            label="Errors"
            value={stats.errors.toLocaleString()}
            sub={baseUrl || "no active crawl"}
          />
        </div>

        <div className="grid max-w-5xl grid-cols-1 gap-4 mt-4 md:grid-cols-3">
          <SeverityCard
            label="Errors"
            value={severity.errors}
            accent="text-red-400"
          />
          <SeverityCard
            label="Warnings"
            value={severity.warnings}
            accent="text-amber-400"
          />
          <SeverityCard
            label="Info"
            value={severity.info}
            accent="text-sky-400"
          />
        </div>

        <section className="max-w-5xl mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
              Recent URLs
            </h2>
            <span className="text-xs text-gray-500">
              showing last {urls.length}
            </span>
          </div>
          <div className="overflow-hidden border border-gray-800 rounded bg-gray-950">
            <table className="w-full text-xs">
              <thead className="bg-gray-900">
                <tr className="text-gray-400">
                  <th className="px-3 py-2 font-medium text-left">URL</th>
                  <th className="px-3 py-2 font-medium text-left w-14">
                    Status
                  </th>
                  <th className="px-3 py-2 font-medium text-left w-16">
                    Words
                  </th>
                  <th className="px-3 py-2 font-medium text-left w-20">Load</th>
                  <th className="px-3 py-2 font-medium text-left w-16">
                    Issues
                  </th>
                </tr>
              </thead>
              <tbody>
                {urls.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-600"
                    >
                      No URLs crawled yet.
                    </td>
                  </tr>
                ) : (
                  urls
                    .slice()
                    .reverse()
                    .map((u, i) => (
                      <tr
                        key={`${u.url}-${i}`}
                        className="border-t border-gray-900 hover:bg-gray-900"
                      >
                        <td
                          className="px-3 py-1.5 font-mono truncate max-w-[32rem]"
                          title={u.url}
                        >
                          {u.url}
                        </td>
                        <td
                          className={
                            "px-3 py-1.5 font-mono " + statusColor(u.statusCode)
                          }
                        >
                          {u.statusCode ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">
                          {u.wordCount ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">
                          {u.loadTimeMs != null ? `${u.loadTimeMs}ms` : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">
                          {u.issueCount}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between px-4 py-2 text-xs text-gray-500 border-t border-gray-800 bg-gray-950">
        <span>
          {env
            ? `${env.isWebVsCode ? "Web VS Code" : "Desktop"} \u2022 Playwright ${env.playwrightInstalled ? "ready" : "not installed"}`
            : "\u2026"}
        </span>
        <span>
          {stats.status === "idle" ? "Ready" : labelForStatus(stats.status)}
        </span>
      </footer>
    </div>
  );
};

const StatsCard: React.FC<{ label: string; value: string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="p-4 border border-gray-800 rounded bg-gray-950">
    <div className="text-xs tracking-wider text-gray-500 uppercase">
      {label}
    </div>
    <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    {sub ? (
      <div className="mt-1 text-xs text-gray-500 truncate">{sub}</div>
    ) : null}
  </div>
);

const SeverityCard: React.FC<{
  label: string;
  value: number;
  accent: string;
}> = ({ label, value, accent }) => (
  <div className="p-4 border border-gray-800 rounded bg-gray-950">
    <div className="text-xs tracking-wider text-gray-500 uppercase">
      {label}
    </div>
    <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>
      {value.toLocaleString()}
    </div>
  </div>
);

const StatusPill: React.FC<{ status: CrawlStats["status"] }> = ({ status }) => {
  const cls =
    status === "running"
      ? "bg-emerald-900 text-emerald-300"
      : status === "paused"
        ? "bg-amber-900 text-amber-300"
        : status === "error"
          ? "bg-red-900 text-red-300"
          : status === "completed"
            ? "bg-sky-900 text-sky-300"
            : "bg-gray-800 text-gray-400";
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${cls}`}>
      {labelForStatus(status)}
    </span>
  );
};

function labelForStatus(s: CrawlStats["status"]): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusColor(code: number | null): string {
  if (code === null) return "text-gray-500";
  if (code >= 200 && code < 300) return "text-emerald-400";
  if (code >= 300 && code < 400) return "text-amber-400";
  if (code >= 400) return "text-red-400";
  return "text-gray-400";
}

export default App;
