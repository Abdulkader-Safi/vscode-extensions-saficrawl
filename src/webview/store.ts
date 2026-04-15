import { create } from "zustand";
import { useEffect } from "react";
import { onMessage, send } from "./messaging";
import type {
  CrawlStats,
  CwvMessageRow,
  HostToWebview,
  IssueRow,
  LinkRow,
  UrlRow,
} from "../types/messages";

export type TabId =
  | "overview"
  | "internal"
  | "external"
  | "statusCodes"
  | "links"
  | "issues"
  | "pagespeed"
  | "visualization"
  | "settings";

const MAX_URLS = 100_000;
const MAX_LINKS = 500_000;
const MAX_ISSUES = 100_000;

const IDLE_STATS: CrawlStats = {
  crawled: 0,
  queued: 0,
  maxUrls: 0,
  urlsPerSec: 0,
  elapsedMs: 0,
  errors: 0,
  status: "idle",
};

export interface Filters {
  search: string;
  urlFilterToUrl: string | null;
}

export interface EnvState {
  isWebVsCode: boolean;
  playwrightInstalled: boolean;
  playwrightPath: string | null;
  pageSpeedKeyConfigured: boolean;
}

interface State {
  urls: UrlRow[];
  links: LinkRow[];
  issues: IssueRow[];
  stats: CrawlStats;
  baseUrl: string | null;
  env: EnvState | null;
  settings: Record<string, unknown>;
  activeTab: TabId;
  filters: Filters;
  pagespeed: Record<string, CwvMessageRow>;
  pageSpeedSummary: { analyzed: number; skipped: number } | null;
}

interface Actions {
  onMessage(msg: HostToWebview): void;
  setActiveTab(tab: TabId): void;
  setSearch(query: string): void;
  focusUrl(url: string | null): void;
  updateSetting(key: string, value: unknown): void;
  startCrawl(url: string): void;
  stopCrawl(): void;
  pauseResume(): void;
  setPageSpeedKey(): void;
  clearPageSpeedKey(): void;
  openPlaywrightDocs(): void;
  installBrowsers(): void;
}

export const useStore = create<State & Actions>((set) => ({
  urls: [],
  links: [],
  issues: [],
  stats: IDLE_STATS,
  baseUrl: null,
  env: null,
  settings: {},
  activeTab: "overview",
  filters: { search: "", urlFilterToUrl: null },
  pagespeed: {},
  pageSpeedSummary: null,

  onMessage: (msg) =>
    set((state) => {
      switch (msg.type) {
        case "stats:tick":
          return { stats: msg.stats };
        case "environment":
          return {
            env: {
              isWebVsCode: msg.isWebVsCode,
              playwrightInstalled: msg.playwrightInstalled,
              playwrightPath: msg.playwrightPath,
              pageSpeedKeyConfigured: msg.pageSpeedKeyConfigured,
            },
          };
        case "crawl:started":
          return {
            baseUrl: msg.baseUrl,
            urls: [],
            links: [],
            issues: [],
            filters: { search: "", urlFilterToUrl: null },
            pagespeed: {},
            pageSpeedSummary: null,
          };
        case "crawl:done":
          return { stats: msg.stats };
        case "crawl:error":
          return {};
        case "url:batch": {
          const next = state.urls.concat(msg.rows);
          return {
            urls:
              next.length > MAX_URLS
                ? next.slice(next.length - MAX_URLS)
                : next,
          };
        }
        case "link:batch": {
          const next = state.links.concat(msg.rows);
          return {
            links:
              next.length > MAX_LINKS
                ? next.slice(next.length - MAX_LINKS)
                : next,
          };
        }
        case "issue:batch": {
          const next = state.issues.concat(msg.rows);
          return {
            issues:
              next.length > MAX_ISSUES
                ? next.slice(next.length - MAX_ISSUES)
                : next,
          };
        }
        case "settings:loaded":
          return { settings: msg.settings };
        case "saved:list":
          return {};
        case "pagespeed:batch": {
          const merged = { ...state.pagespeed };
          for (const r of msg.rows) {
            merged[`${r.url}|${r.strategy}`] = r;
          }
          return { pagespeed: merged };
        }
        case "pagespeed:done":
          return {
            pageSpeedSummary: { analyzed: msg.analyzed, skipped: msg.skipped },
          };
        default:
          return {};
      }
    }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearch: (query) =>
    set((s) => ({ filters: { ...s.filters, search: query } })),
  focusUrl: (url) =>
    set((s) => ({
      activeTab: url ? "overview" : s.activeTab,
      filters: { ...s.filters, urlFilterToUrl: url },
    })),
  updateSetting: (key, value) => {
    send({ type: "settings:update", patch: { [key]: value } });
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
  },
  startCrawl: (url) => send({ type: "crawl:start", url }),
  stopCrawl: () => send({ type: "crawl:stop" }),
  pauseResume: () => send({ type: "crawl:pauseResume" }),
  setPageSpeedKey: () => send({ type: "setPageSpeedKey" }),
  clearPageSpeedKey: () => send({ type: "clearPageSpeedKey" }),
  openPlaywrightDocs: () => send({ type: "openPlaywrightDocs" }),
  installBrowsers: () => send({ type: "installBrowsers" }),
}));

/** Single hook mounted once by <App />. Subscribes to host messages and sends "ready". */
export function useMessageBridge(): void {
  const handle = useStore((s) => s.onMessage);
  useEffect(() => {
    const off = onMessage(handle);
    send({ type: "ready" });
    return off;
  }, [handle]);
}

export function severityCounts(issues: IssueRow[]): {
  errors: number;
  warnings: number;
  info: number;
} {
  let errors = 0,
    warnings = 0,
    info = 0;
  for (const i of issues) {
    if (i.type === "error") {
      errors++;
    } else if (i.type === "warning") {
      warnings++;
    } else {
      info++;
    }
  }
  return { errors, warnings, info };
}
