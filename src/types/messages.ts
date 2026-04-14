export type CrawlStatus = "idle" | "running" | "paused" | "stopping" | "completed" | "error";

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
  | { type: "environment"; isWebVsCode: boolean; playwrightInstalled: boolean };

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
  | { type: "export"; dataset: "urls" | "links" | "issues"; format: "csv" | "json" | "xml" }
  | { type: "installBrowsers" }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

export type Message = HostToWebview | WebviewToHost;
