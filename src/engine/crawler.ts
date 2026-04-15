import robotsParser from "robots-parser";
import { CrawlerEvents } from "./events";
import { HttpClient } from "./httpClient";
import { RateLimiter } from "./rateLimiter";
import { parsePage } from "./seoExtractor";
import { extractLinks, SourcePageIndex } from "./linkManager";
import {
  detect,
  DEFAULT_THRESHOLDS,
  type IssueThresholds,
} from "./issueDetector";
import { discover as discoverSitemaps } from "./sitemapParser";
import {
  extractDomain,
  normalizeUrl,
  shouldCrawl,
  type FilterContext,
} from "./urlFilter";
import type { JsRenderer } from "./jsRenderer";
import { shouldRender } from "./jsRenderer";
import type { CrawlResult, CrawlStatsSnapshot, CrawlerConfig } from "./types";

type RobotsMatcher = ReturnType<typeof robotsParser>;

type CrawlStatus = CrawlStatsSnapshot["status"];

export interface CrawlerOptions {
  config: CrawlerConfig;
  thresholds?: IssueThresholds;
  statsIntervalMs?: number;
  jsRenderer?: JsRenderer | null;
}

export class Crawler extends CrawlerEvents {
  private config: CrawlerConfig;
  private readonly thresholds: IssueThresholds;
  private readonly statsIntervalMs: number;

  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private robots: RobotsMatcher | null = null;
  private readonly jsRenderer: JsRenderer | null;

  private readonly p0Queue: Array<[string, number]> = [];
  private readonly p1Queue: Array<[string, number]> = [];
  private readonly visited = new Set<string>();
  private readonly sources = new SourcePageIndex();

  private active = 0;
  private crawledCount = 0;
  private errorCount = 0;
  private startedAt = 0;
  private statsTimer: NodeJS.Timeout | null = null;

  private status: CrawlStatus = "idle";
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private stopSignal = false;

  private baseUrl = "";
  private baseDomain = "";

  constructor(options: CrawlerOptions) {
    super();
    this.config = options.config;
    this.thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
    this.statsIntervalMs = options.statsIntervalMs ?? 250;
    this.jsRenderer = options.jsRenderer ?? null;
  }

  getStatus(): CrawlStatus {
    return this.status;
  }

  updateConfig(patch: Partial<CrawlerConfig>): void {
    this.config = { ...this.config, ...patch };
    if (patch.delaySec !== undefined) {
      this.rateLimiter?.updateRate(patch.delaySec);
    }
  }

  async start(seedUrl: string): Promise<void> {
    if (this.status === "running" || this.status === "paused") {
      throw new Error("Crawler already running");
    }
    const seed = normalizeUrl(seedUrl);
    if (!seed) {
      throw new Error(`Invalid seed URL: ${seedUrl}`);
    }

    this.reset();
    this.baseUrl = seed;
    this.baseDomain = extractDomain(seed);
    this.http = new HttpClient(this.config);
    this.rateLimiter = new RateLimiter(this.config.delaySec);
    this.robots = await this.fetchRobots(seed);

    const seedDepth = new URL(seed).pathname !== "/" ? 0 : 0;
    this.enqueue(seed, seedDepth, 0);

    if (this.config.discoverSitemaps) {
      try {
        const sm = await discoverSitemaps(seed, this.http);
        for (const u of sm.urls) {
          this.enqueue(u, 0, 0);
        }
      } catch {
        // non-fatal
      }
    }

    this.startedAt = Date.now();
    this.status = "running";
    this.startStatsTicker();

    try {
      await this.runLoop();
      this.status = this.stopSignal ? "completed" : "completed";
    } catch (err) {
      this.status = "error";
      this.emit("error", { url: this.baseUrl, error: errorMessage(err) });
    } finally {
      this.stopStatsTicker();
      await this.http?.close();
      this.http = null;
      this.emit("done", this.snapshot());
    }
  }

  stop(): void {
    if (this.status !== "running" && this.status !== "paused") {
      return;
    }
    this.stopSignal = true;
    this.status = "stopping";
    this.resumeInternal();
  }

  pause(): void {
    if (this.status !== "running") {
      return;
    }
    this.status = "paused";
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  resume(): void {
    if (this.status !== "paused") {
      return;
    }
    this.status = "running";
    this.resumeInternal();
  }

  /** Returns the visited set + pending queue for resume/checkpoint. */
  getCheckpoint(): {
    visited: string[];
    queue: Array<[string, number, number]>;
  } {
    const p0 = this.p0Queue.map(
      ([u, d]) => [u, d, 0] as [string, number, number],
    );
    const p1 = this.p1Queue.map(
      ([u, d]) => [u, d, 1] as [string, number, number],
    );
    return { visited: [...this.visited], queue: p0.concat(p1) };
  }

  /** Preload visited + queue and start without re-seeding the seed URL. Used for resume. */
  async startWithState(
    baseUrl: string,
    visited: Iterable<string>,
    pendingQueue: Iterable<[string, number] | [string, number, number]>,
  ): Promise<void> {
    if (this.status === "running" || this.status === "paused") {
      throw new Error("Crawler already running");
    }
    const seed = normalizeUrl(baseUrl);
    if (!seed) {
      throw new Error(`Invalid seed URL: ${baseUrl}`);
    }

    this.reset();
    this.baseUrl = seed;
    this.baseDomain = extractDomain(seed);
    this.http = new HttpClient(this.config);
    this.rateLimiter = new RateLimiter(this.config.delaySec);
    this.robots = await this.fetchRobots(seed);

    for (const v of visited) {
      this.visited.add(v);
    }
    for (const entry of pendingQueue) {
      const url = entry[0];
      const depth = entry[1];
      const priority = (entry[2] ?? 1) === 0 ? 0 : 1;
      if (!this.visited.has(url)) {
        if (priority === 0) {
          this.p0Queue.push([url, depth]);
        } else {
          this.p1Queue.push([url, depth]);
        }
      }
    }

    this.startedAt = Date.now();
    this.status = "running";
    this.startStatsTicker();

    try {
      await this.runLoop();
    } catch (err) {
      this.status = "error";
      this.emit("error", { url: this.baseUrl, error: errorMessage(err) });
    } finally {
      this.stopStatsTicker();
      await this.http?.close();
      this.http = null;
      this.status = this.stopSignal ? "completed" : "completed";
      this.emit("done", this.snapshot());
    }
  }

  private resumeInternal(): void {
    this.pauseResolve?.();
    this.pauseResolve = null;
    this.pausePromise = null;
  }

  private reset(): void {
    this.p0Queue.length = 0;
    this.p1Queue.length = 0;
    this.visited.clear();
    this.active = 0;
    this.crawledCount = 0;
    this.errorCount = 0;
    this.stopSignal = false;
  }

  private queueLength(): number {
    return this.p0Queue.length + this.p1Queue.length;
  }

  private dequeue(): [string, number] | undefined {
    if (this.p0Queue.length > 0) {
      return this.p0Queue.shift();
    }
    return this.p1Queue.shift();
  }

  private enqueue(url: string, depth: number, priority: 0 | 1): void {
    if (this.visited.has(url)) {
      return;
    }
    if (depth > this.config.maxDepth) {
      return;
    }
    if (
      this.filterContext() &&
      !shouldCrawl(url, depth, this.filterContext()!)
    ) {
      return;
    }
    if (priority === 0) {
      this.p0Queue.push([url, depth]);
    } else {
      this.p1Queue.push([url, depth]);
    }
  }

  private filterContext(): FilterContext | null {
    if (!this.robots) {
      return null;
    }
    const robots = this.robots;
    return {
      config: this.config,
      baseDomain: this.baseDomain,
      robotsAllowed: (u, ua) => robots.isAllowed(u, ua) ?? true,
    };
  }

  private async runLoop(): Promise<void> {
    while (!this.stopSignal && (this.queueLength() > 0 || this.active > 0)) {
      if (this.status === "paused" && this.pausePromise) {
        await this.pausePromise;
      }
      if (this.crawledCount >= this.config.maxUrls) {
        break;
      }

      while (
        !this.stopSignal &&
        this.active < this.config.concurrency &&
        this.queueLength() > 0 &&
        this.crawledCount + this.active < this.config.maxUrls
      ) {
        const next = this.dequeue();
        if (!next) {
          break;
        }
        const [url, depth] = next;
        if (this.visited.has(url)) {
          continue;
        }
        this.visited.add(url);
        this.active++;
        void this.fetchOne(url, depth).finally(() => {
          this.active--;
        });
      }
      await wait(5);
    }
    while (this.active > 0) {
      await wait(10);
    }
  }

  private async fetchOne(url: string, depth: number): Promise<void> {
    if (!this.http || !this.rateLimiter) {
      return;
    }
    await this.rateLimiter.acquire();
    try {
      const res = await this.http.get(url);
      const contentType = res.headers["content-type"] ?? null;
      const isHtml =
        contentType === null ||
        /text\/html|application\/xhtml/i.test(contentType);
      let html = isHtml ? res.body.toString("utf8") : "";
      let size = res.body.length;
      let javascriptRendered = false;
      let renderMs = 0;

      if (isHtml && this.jsRenderer && shouldRender(url)) {
        const started = Date.now();
        const rendered = await this.jsRenderer.render(res.finalUrl);
        renderMs = Date.now() - started;
        if (!rendered.error && rendered.html) {
          html = rendered.html;
          size = Buffer.byteLength(rendered.html, "utf8");
          javascriptRendered = true;
        }
      }

      const result = parsePage({
        url,
        depth,
        finalUrl: res.finalUrl,
        statusCode: res.statusCode,
        contentType,
        size,
        responseTimeMs: res.responseTimeMs + renderMs,
        redirectChain: res.redirectChain,
        headers: res.headers,
        html,
      });
      result.javascriptRendered = javascriptRendered;

      this.crawledCount++;
      this.emit("url:crawled", result);

      for (const issue of detect(result, this.thresholds)) {
        this.emit("issue:found", issue);
      }

      if (isHtml) {
        const links = extractLinks(html, res.finalUrl, this.baseDomain);
        for (const link of links) {
          this.sources.add(link.targetUrl, url);
          this.emit("link:found", link);
          if (link.isInternal) {
            this.enqueue(link.targetUrl, depth + 1, 1);
          }
        }
      }
    } catch (err) {
      this.errorCount++;
      this.emit("error", { url, error: errorMessage(err) });
    }
  }

  private async fetchRobots(seed: string): Promise<RobotsMatcher> {
    const robotsUrl = new URL("/robots.txt", seed).toString();
    try {
      const res = await this.http!.get(robotsUrl);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return robotsParser(robotsUrl, res.body.toString("utf8"));
      }
    } catch {
      // ignore
    }
    return robotsParser(robotsUrl, "");
  }

  private startStatsTicker(): void {
    this.statsTimer = setInterval(() => {
      this.emit("stats:tick", this.snapshot());
    }, this.statsIntervalMs);
  }

  private stopStatsTicker(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private snapshot(): CrawlStatsSnapshot {
    const elapsedMs = this.startedAt === 0 ? 0 : Date.now() - this.startedAt;
    const urlsPerSec =
      elapsedMs > 0 ? this.crawledCount / (elapsedMs / 1000) : 0;
    return {
      crawled: this.crawledCount,
      queued: this.queueLength(),
      maxUrls: this.config.maxUrls,
      urlsPerSec,
      elapsedMs,
      errors: this.errorCount,
      status: this.status,
    };
  }

  sourcesFor(targetUrl: string): string[] {
    return this.sources.sourcesFor(targetUrl);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export type { CrawlResult, CrawlStatsSnapshot, CrawlerConfig };
