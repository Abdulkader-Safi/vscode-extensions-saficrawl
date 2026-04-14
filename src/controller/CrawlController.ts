import * as vscode from "vscode";
import { Crawler } from "../engine/crawler";
import type {
  CrawlResult,
  CrawlStatsSnapshot,
  CrawlerConfig,
  Issue,
  Link,
} from "../engine/types";
import { DEFAULT_CONFIG } from "../engine/types";
import type { HostBus } from "../messaging/bus";
import type {
  IssueRow,
  LinkRow,
  UrlRow,
  CrawlStats,
  CrawlStatus,
} from "../types/messages";
import type { StatusBar } from "../ui/statusBar";
import { RingBuffer } from "./buffers";
import { hotApplicablePatch, readConfig } from "./configSnapshot";

const URL_BUF_CAP = 10_000;
const LINK_BUF_CAP = 50_000;
const ISSUE_BUF_CAP = 10_000;
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 100;
const WEBVIEW_STATS_INTERVAL_MS = 250;

type BusGetter = () => HostBus | null;

export class CrawlController {
  private crawler: Crawler | null = null;
  private config: CrawlerConfig;
  private baseUrl: string | null = null;
  private crawlId: number | null = null;

  private readonly urlBuf = new RingBuffer<UrlRow>(URL_BUF_CAP);
  private readonly linkBuf = new RingBuffer<LinkRow>(LINK_BUF_CAP);
  private readonly issueBuf = new RingBuffer<IssueRow>(ISSUE_BUF_CAP);

  private readonly pendingUrls = new Map<string, CrawlResult>();
  private readonly pendingLinks: LinkRow[] = [];
  private readonly pendingIssues: IssueRow[] = [];
  private readonly issuesByUrl = new Map<string, number>();

  private lastStats: CrawlStats = makeIdleStats();
  private lastWebviewStatsAt = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly getBus: BusGetter,
    private readonly statusBar: StatusBar,
    private readonly getWsConfig: () => vscode.WorkspaceConfiguration,
  ) {
    this.config = readConfig(this.getWsConfig());
  }

  getStats(): CrawlStats {
    return this.lastStats;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  /** Replay current state to the webview — called when the panel opens mid-crawl. */
  replay(): void {
    const bus = this.getBus();
    if (!bus) {return;}
    if (this.baseUrl)
      {bus.post({
        type: "crawl:started",
        baseUrl: this.baseUrl,
        crawlId: this.crawlId,
      });}
    const urls = this.urlBuf.snapshot();
    if (urls.length) {bus.post({ type: "url:batch", rows: urls });}
    const issues = this.issueBuf.snapshot();
    if (issues.length) {bus.post({ type: "issue:batch", rows: issues });}
    const links = this.linkBuf.snapshot();
    if (links.length) {bus.post({ type: "link:batch", rows: links });}
    bus.post({ type: "stats:tick", stats: this.lastStats });
  }

  async start(seedUrl: string): Promise<void> {
    if (
      this.crawler &&
      (this.lastStats.status === "running" ||
        this.lastStats.status === "paused")
    ) {
      throw new Error("A crawl is already running. Stop it first.");
    }
    this.config = readConfig(this.getWsConfig());
    this.reset();
    this.baseUrl = seedUrl;
    this.crawlId = null;

    const crawler = new Crawler({ config: this.config });
    this.crawler = crawler;
    this.bindCrawler(crawler);

    this.getBus()?.post({
      type: "crawl:started",
      baseUrl: seedUrl,
      crawlId: null,
    });
    this.startFlushTimer();

    // Fire-and-forget: the crawler resolves start() when done or errored.
    crawler.start(seedUrl).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.getBus()?.post({ type: "crawl:error", message: msg });
    });
  }

  stop(): void {
    this.crawler?.stop();
  }

  pauseResume(): void {
    if (!this.crawler) {return;}
    const status = this.crawler.getStatus();
    if (status === "running") {this.crawler.pause();}
    else if (status === "paused") {this.crawler.resume();}
  }

  updateConfigFromWorkspace(): void {
    const next = readConfig(this.getWsConfig());
    const { hot, deferred } = hotApplicablePatch(this.config, next);
    this.config = next;
    if (this.crawler && Object.keys(hot).length > 0) {
      this.crawler.updateConfig(hot);
    }
    if (this.crawler && deferred.length > 0) {
      const isActive =
        this.lastStats.status === "running" ||
        this.lastStats.status === "paused";
      if (isActive) {
        void vscode.window.showInformationMessage(
          `SafiCrawl: settings changed (${deferred.join(", ")}) — will apply to the next crawl.`,
        );
      }
    }
  }

  dispose(): void {
    this.crawler?.stop();
    this.stopFlushTimer();
    this.statusBar.setIdle();
  }

  // ---- engine plumbing ----------------------------------------------------

  private bindCrawler(c: Crawler): void {
    c.on("url:crawled", (r) => this.onUrl(r));
    c.on("issue:found", (i) => this.onIssue(i));
    c.on("link:found", (l) => this.onLink(l));
    c.on("stats:tick", (s) => this.onStats(s));
    c.on("error", ({ url, error }) => {
      const row: IssueRow = {
        url,
        type: "error",
        category: "technical",
        issue: "Error",
        details: error,
      };
      this.pendingIssues.push(row);
    });
    c.on("done", (s) => this.onDone(s));
  }

  private onUrl(result: CrawlResult): void {
    this.pendingUrls.set(result.url, result);
  }

  private onIssue(issue: Issue): void {
    this.issuesByUrl.set(issue.url, (this.issuesByUrl.get(issue.url) ?? 0) + 1);
    this.pendingIssues.push({
      url: issue.url,
      type: issue.type,
      category: issue.category,
      issue: issue.issue,
      details: issue.details,
    });
  }

  private onLink(link: Link): void {
    this.pendingLinks.push({
      sourceUrl: link.sourceUrl,
      targetUrl: link.targetUrl,
      anchorText: link.anchorText,
      isInternal: link.isInternal,
      targetDomain: link.targetDomain,
      targetStatus: null,
      placement: link.placement,
    });
  }

  private onStats(snap: CrawlStatsSnapshot): void {
    const stats: CrawlStats = {
      crawled: snap.crawled,
      queued: snap.queued,
      maxUrls: snap.maxUrls,
      urlsPerSec: snap.urlsPerSec,
      elapsedMs: snap.elapsedMs,
      errors: snap.errors,
      status: snap.status as CrawlStatus,
    };
    this.lastStats = stats;
    this.statusBar.update(snap);

    const now = Date.now();
    if (now - this.lastWebviewStatsAt >= WEBVIEW_STATS_INTERVAL_MS) {
      this.lastWebviewStatsAt = now;
      this.getBus()?.post({ type: "stats:tick", stats });
    }
  }

  private onDone(snap: CrawlStatsSnapshot): void {
    this.flushPending();
    const stats: CrawlStats = {
      crawled: snap.crawled,
      queued: snap.queued,
      maxUrls: snap.maxUrls,
      urlsPerSec: snap.urlsPerSec,
      elapsedMs: snap.elapsedMs,
      errors: snap.errors,
      status: snap.status as CrawlStatus,
    };
    this.lastStats = stats;
    this.statusBar.update(snap);
    this.getBus()?.post({ type: "crawl:done", stats });
    this.getBus()?.post({ type: "stats:tick", stats });
    this.stopFlushTimer();
  }

  // ---- batching -----------------------------------------------------------

  private startFlushTimer(): void {
    this.stopFlushTimer();
    this.flushTimer = setInterval(() => this.flushPending(), BATCH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flushPending(): void {
    const bus = this.getBus();

    if (this.pendingUrls.size > 0) {
      const rows: UrlRow[] = [];
      for (const result of this.pendingUrls.values()) {
        rows.push(toUrlRow(result, this.issuesByUrl.get(result.url) ?? 0));
      }
      this.pendingUrls.clear();
      this.urlBuf.pushMany(rows);
      flushInChunks(rows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "url:batch", rows: chunk }),
      );
    }

    if (this.pendingIssues.length > 0) {
      const rows = this.pendingIssues.splice(0, this.pendingIssues.length);
      this.issueBuf.pushMany(rows);
      flushInChunks(rows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "issue:batch", rows: chunk }),
      );
    }

    if (this.pendingLinks.length > 0) {
      const rows = this.pendingLinks.splice(0, this.pendingLinks.length);
      this.linkBuf.pushMany(rows);
      flushInChunks(rows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "link:batch", rows: chunk }),
      );
    }
  }

  private reset(): void {
    this.urlBuf.clear();
    this.linkBuf.clear();
    this.issueBuf.clear();
    this.pendingUrls.clear();
    this.pendingLinks.length = 0;
    this.pendingIssues.length = 0;
    this.issuesByUrl.clear();
    this.lastStats = makeIdleStats();
    this.lastWebviewStatsAt = 0;
  }
}

function toUrlRow(r: CrawlResult, issueCount: number): UrlRow {
  return {
    url: r.url,
    statusCode: r.statusCode,
    title: r.title,
    wordCount: r.wordCount,
    loadTimeMs: r.responseTimeMs,
    issueCount,
    depth: r.depth,
    internal: true,
  };
}

function flushInChunks<T>(
  rows: T[],
  size: number,
  send: (chunk: T[]) => void,
): void {
  for (let i = 0; i < rows.length; i += size) {
    send(rows.slice(i, i + size));
  }
}

function makeIdleStats(): CrawlStats {
  return {
    crawled: 0,
    queued: 0,
    maxUrls: DEFAULT_CONFIG.maxUrls,
    urlsPerSec: 0,
    elapsedMs: 0,
    errors: 0,
    status: "idle",
  };
}
