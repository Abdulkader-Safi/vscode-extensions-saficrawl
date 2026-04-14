export type CrawlStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "error";

export interface CrawlStats {
  crawled: number;
  queued: number;
  maxUrls: number;
  urlsPerSec: number;
  elapsedMs: number;
  errors: number;
  status: CrawlStatus;
}

export interface UrlRow {
  url: string;
  statusCode: number | null;
  title: string | null;
  wordCount: number | null;
  loadTimeMs: number | null;
  issueCount: number;
  depth: number;
  internal: boolean;
}

export interface IssueRow {
  url: string;
  type: "error" | "warning" | "info";
  category: string;
  issue: string;
  details: string;
}

export interface LinkRow {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  isInternal: boolean;
  targetDomain: string;
  targetStatus: number | null;
  placement: "navigation" | "body" | "footer";
}

export interface SavedCrawl {
  id: number;
  baseUrl: string;
  status: CrawlStatus;
  urlCount: number;
  startedAt: string;
  canResume: boolean;
}

export interface CwvMessageRow {
  url: string;
  strategy: "mobile" | "desktop";
  performance: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  fcpMs: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
  tbtMs: number | null;
  error: string | null;
}

/** Messages sent FROM the extension host TO the webview. */
export type HostToWebview =
  | { type: "stats:tick"; stats: CrawlStats }
  | { type: "url:batch"; rows: UrlRow[] }
  | { type: "issue:batch"; rows: IssueRow[] }
  | { type: "link:batch"; rows: LinkRow[] }
  | { type: "crawl:started"; baseUrl: string; crawlId: number | null }
  | { type: "crawl:done"; stats: CrawlStats }
  | { type: "crawl:error"; message: string }
  | { type: "settings:loaded"; settings: Record<string, unknown> }
  | { type: "saved:list"; crawls: SavedCrawl[] }
  | {
      type: "environment";
      isWebVsCode: boolean;
      playwrightInstalled: boolean;
      playwrightPath: string | null;
      pageSpeedKeyConfigured: boolean;
    }
  | { type: "pagespeed:batch"; rows: CwvMessageRow[] }
  | { type: "pagespeed:done"; analyzed: number; skipped: number };

/** Messages sent FROM the webview TO the extension host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "crawl:start"; url: string }
  | { type: "crawl:stop" }
  | { type: "crawl:pauseResume" }
  | { type: "crawl:load"; id: number }
  | { type: "crawl:resume"; id: number }
  | { type: "crawl:archive"; id: number }
  | { type: "crawl:delete"; id: number }
  | { type: "settings:get" }
  | { type: "settings:update"; patch: Record<string, unknown> }
  | { type: "saved:refresh" }
  | {
      type: "export";
      dataset: "urls" | "links" | "issues";
      format: "csv" | "json" | "xml";
    }
  | { type: "installBrowsers" }
  | { type: "checkPlaywright" }
  | { type: "openPlaywrightDocs" }
  | { type: "setPageSpeedKey" }
  | { type: "clearPageSpeedKey" }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

export type Message = HostToWebview | WebviewToHost;
