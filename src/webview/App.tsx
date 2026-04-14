import React, { useEffect, useState } from "react";
import { onMessage, send } from "./messaging";
import type { CrawlStats, HostToWebview } from "../types/messages";

const App: React.FC = () => {
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [env, setEnv] = useState<{ isWebVsCode: boolean; playwrightInstalled: boolean } | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("");

  useEffect(() => {
    const off = onMessage((msg: HostToWebview) => {
      switch (msg.type) {
        case "stats:tick":
          setStats(msg.stats);
          break;
        case "environment":
          setEnv({ isWebVsCode: msg.isWebVsCode, playwrightInstalled: msg.playwrightInstalled });
          break;
        case "crawl:started":
          setBaseUrl(msg.baseUrl);
          break;
      }
    });
    send({ type: "ready" });
    return off;
  }, []);

  return (
    <div className="flex flex-col w-full h-screen text-gray-100 bg-gray-900">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">SafiCrawl</span>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-800 rounded">v0.1.0</span>
        </div>
        <button
          className="px-3 py-1.5 text-sm font-medium bg-emerald-600 rounded hover:bg-emerald-500"
          onClick={() => send({ type: "notify", level: "info", message: "Start Crawl wired in M2." })}
        >
          Start Crawl
        </button>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <section className="max-w-2xl space-y-4">
          <h2 className="text-xl font-semibold">Welcome</h2>
          <p className="text-sm text-gray-400">
            SafiCrawl is wired and ready. The core engine, storage, and full 9-tab UI land in M1\u2013M6.
          </p>

          <div className="p-4 space-y-2 border border-gray-800 rounded bg-gray-950">
            <div className="text-xs tracking-wider text-gray-500 uppercase">Current Crawl</div>
            <div className="text-sm">{baseUrl || <span className="text-gray-600">No active crawl</span>}</div>
            <div className="font-mono text-xs text-gray-400">
              {stats
                ? `${stats.crawled}/${stats.maxUrls} \u2022 ${stats.urlsPerSec.toFixed(1)} URLs/s \u2022 ${stats.status}`
                : "idle"}
            </div>
          </div>

          <div className="p-4 space-y-2 border border-gray-800 rounded bg-gray-950">
            <div className="text-xs tracking-wider text-gray-500 uppercase">Environment</div>
            <div className="text-sm">
              {env
                ? `${env.isWebVsCode ? "Web VS Code" : "Desktop"} \u2022 Playwright ${env.playwrightInstalled ? "installed" : "not installed"}`
                : "loading\u2026"}
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-2 text-xs text-gray-500 border-t border-gray-800 bg-gray-950">
        Ready
      </footer>
    </div>
  );
};

export default App;
