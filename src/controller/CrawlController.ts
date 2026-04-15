import * as vscode from "vscode";
import { Crawler } from "../engine/crawler";
import { JsRenderer } from "../engine/jsRenderer";
import { detectPlaywright } from "../engine/playwrightLoader";
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
import { PsiWorker } from "../pagespeed/psiClient";
import type { CwvRow, PsiStrategy } from "../pagespeed/types";
import type { CrawlDb, LoadedCrawl } from "../storage/crawlDb";

const URL_BUF_CAP = 10_000;
const LINK_BUF_CAP = 50_000;
const ISSUE_BUF_CAP = 10_000;
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 100;
const WEBVIEW_STATS_INTERVAL_MS = 250;

type BusGetter = () => HostBus | null;
type PsiKeyGetter = () => Promise<string | undefined>;

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
  private jsRenderer: JsRenderer | null = null;

  private pagespeedRows: CwvRow[] = [];
  private psiWorker: PsiWorker | null = null;
  private psiTotalExpected = 0;
  private psiOwnerCrawlId: number | null = null;
  private psiStrategies: PsiStrategy[] = [];
  private canContinueCurrent = false;

  private readonly jsRenderedByUrl = new Map<string, boolean>();
  private onCrawlsChanged: (() => void) | null = null;

  constructor(
    private readonly getBus: BusGetter,
    private readonly statusBar: StatusBar,
    private readonly getWsConfig: () => vscode.WorkspaceConfiguration,
    private readonly getPsiKey: PsiKeyGetter = async () => undefined,
    private readonly db: CrawlDb | null = null,
  ) {
    this.config = readConfig(this.getWsConfig());
  }

  setOnCrawlsChanged(cb: () => void): void {
    this.onCrawlsChanged = cb;
  }

  private notifyCrawlsChanged(): void {
    this.onCrawlsChanged?.();
  }

  getPagespeedSnapshot(): CwvRow[] {
    return this.pagespeedRows.slice();
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
    if (!bus) {
      return;
    }
    if (this.baseUrl) {
      bus.post({
        type: "crawl:started",
        baseUrl: this.baseUrl,
        crawlId: this.crawlId,
        canResume: this.canContinueCurrent,
        canContinue: this.canContinueCurrent,
      });
    }
    const urls = this.urlBuf.snapshot();
    if (urls.length) {
      bus.post({ type: "url:batch", rows: urls });
    }
    const issues = this.issueBuf.snapshot();
    if (issues.length) {
      bus.post({ type: "issue:batch", rows: issues });
    }
    const links = this.linkBuf.snapshot();
    if (links.length) {
      bus.post({ type: "link:batch", rows: links });
    }
    if (this.pagespeedRows.length > 0) {
      bus.post({
        type: "pagespeed:batch",
        rows: this.pagespeedRows.map((r) => ({ ...r })),
      });
    }
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
    const strategies = this.resolveConfiguredStrategies();
    this.crawlId =
      this.db?.createCrawl(seedUrl, this.config, strategies) ?? null;
    this.canContinueCurrent = false;
    this.notifyCrawlsChanged();

    this.jsRenderer = await this.tryCreateRenderer();
    await this.maybeCreatePsiWorker(strategies);

    const crawler = new Crawler({
      config: this.config,
      jsRenderer: this.jsRenderer,
    });
    this.crawler = crawler;
    this.bindCrawler(crawler);

    this.getBus()?.post({
      type: "crawl:started",
      baseUrl: seedUrl,
      crawlId: this.crawlId,
      canResume: false,
      canContinue: false,
    });
    this.startFlushTimer();

    crawler
      .start(seedUrl)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.getBus()?.post({ type: "crawl:error", message: msg });
        if (this.db && this.crawlId !== null) {
          this.db.setStatus(this.crawlId, "error", false);
          this.notifyCrawlsChanged();
        }
      })
      .finally(() => {
        void this.closeRenderer();
      });
  }

  /** Load a previously-saved crawl into the webview without running the engine. */
  loadSaved(id: number): LoadedCrawl | null {
    if (!this.db) {
      return null;
    }
    const loaded = this.db.loadCrawl(id);
    if (!loaded) {
      return null;
    }

    this.reset();
    this.baseUrl = loaded.crawl.baseUrl;
    this.crawlId = id;
    this.psiStrategies = loaded.crawl.psiStrategies;
    this.urlBuf.pushMany(loaded.urls);
    this.linkBuf.pushMany(loaded.links);
    this.issueBuf.pushMany(loaded.issues);
    this.pagespeedRows = loaded.pagespeed.slice();
    for (const issue of loaded.issues) {
      this.issuesByUrl.set(
        issue.url,
        (this.issuesByUrl.get(issue.url) ?? 0) + 1,
      );
    }

    this.lastStats = {
      crawled: loaded.urls.length,
      queued: loaded.checkpoint?.queue.length ?? 0,
      maxUrls: loaded.crawl.config.maxUrls,
      urlsPerSec: 0,
      elapsedMs:
        (loaded.crawl.completedAt ?? loaded.crawl.startedAt) -
        loaded.crawl.startedAt,
      errors: loaded.crawl.errorCount,
      status:
        loaded.crawl.status === "completed"
          ? "completed"
          : loaded.crawl.status === "error"
            ? "error"
            : "idle",
    };
    this.canContinueCurrent = this.computeCanContinue(loaded);

    const bus = this.getBus();
    if (bus) {
      bus.post({
        type: "crawl:started",
        baseUrl: loaded.crawl.baseUrl,
        crawlId: id,
        canResume: loaded.crawl.canResume,
        canContinue: this.canContinueCurrent,
      });
      bus.post({ type: "url:batch", rows: loaded.urls });
      bus.post({ type: "issue:batch", rows: loaded.issues });
      bus.post({ type: "link:batch", rows: loaded.links });
      if (loaded.pagespeed.length > 0) {
        bus.post({
          type: "pagespeed:batch",
          rows: loaded.pagespeed.map((r) => ({ ...r })),
        });
      }
      bus.post({ type: "stats:tick", stats: this.lastStats });
    }
    return loaded;
  }

  /** Resume whichever crawl the webview is currently showing. */
  async continueCurrent(): Promise<void> {
    if (this.crawlId === null) {
      throw new Error("No crawl is currently loaded.");
    }
    await this.resume(this.crawlId);
  }

  /**
   * Decide whether the "Continue crawl" button should be offered. True when
   * the HTML queue has remnants OR any crawled URL still lacks a PSI row for
   * one of the strategies this crawl was started with.
   */
  private computeCanContinue(loaded: LoadedCrawl): boolean {
    if (loaded.crawl.canResume) {
      return true;
    }
    const strategies = loaded.crawl.psiStrategies;
    if (strategies.length === 0) {
      return false;
    }
    const done = new Set(loaded.pagespeed.map((r) => `${r.url}|${r.strategy}`));
    for (const u of loaded.urls) {
      if (u.statusCode === null || u.statusCode < 200 || u.statusCode >= 400) {
        continue;
      }
      for (const s of strategies) {
        if (!done.has(`${u.url}|${s}`)) {
          return true;
        }
      }
    }
    return false;
  }

  async resume(id: number): Promise<void> {
    if (!this.db) {
      throw new Error("Persistence is not enabled");
    }
    const loaded = this.db.loadCrawl(id);
    if (!loaded) {
      throw new Error(`Crawl ${id} not found`);
    }
    const hasContinue = this.computeCanContinue(loaded);
    if (!hasContinue) {
      throw new Error(`Crawl ${id} cannot be resumed`);
    }
    if (
      this.crawler &&
      (this.lastStats.status === "running" ||
        this.lastStats.status === "paused")
    ) {
      throw new Error("Another crawl is running. Stop it first.");
    }

    this.config = loaded.crawl.config;
    this.reset();
    this.baseUrl = loaded.crawl.baseUrl;
    this.crawlId = id;
    this.canContinueCurrent = false;

    // Hydrate buffers so the webview reflects prior state immediately.
    this.urlBuf.pushMany(loaded.urls);
    this.linkBuf.pushMany(loaded.links);
    this.issueBuf.pushMany(loaded.issues);
    for (const issue of loaded.issues) {
      this.issuesByUrl.set(
        issue.url,
        (this.issuesByUrl.get(issue.url) ?? 0) + 1,
      );
    }

    this.jsRenderer = await this.tryCreateRenderer();

    // Prefer the strategies this crawl originally used. Fall back to the
    // current workspace setting if nothing was persisted (older crawls).
    const strategies =
      loaded.crawl.psiStrategies.length > 0
        ? loaded.crawl.psiStrategies
        : this.resolveConfiguredStrategies();
    // Populate pagespeedRows BEFORE creating the worker so the worker's
    // closure captures the correct array to push new results into.
    this.pagespeedRows = loaded.pagespeed.slice();
    await this.maybeCreatePsiWorker(strategies);
    if (this.db) {
      this.db.setPsiStrategies(id, strategies);
    }

    const crawler = new Crawler({
      config: this.config,
      jsRenderer: this.jsRenderer,
    });
    this.crawler = crawler;
    this.bindCrawler(crawler);

    // Build the queue: prefer checkpoint, fall back to the persisted queue table.
    const visited = new Set(loaded.urls.map((u) => u.url));
    const queue: Array<[string, number] | [string, number, number]> =
      loaded.checkpoint?.queue ?? this.db.getResumeQueue(id);

    this.db.setStatus(id, "running", false);
    this.notifyCrawlsChanged();

    this.getBus()?.post({
      type: "crawl:started",
      baseUrl: loaded.crawl.baseUrl,
      crawlId: id,
      canResume: false,
      canContinue: false,
    });
    // Restore the historical rows into the webview; the new merge-by-URL store
    // replaces them in-place as the crawl + PSI fill each row in.
    this.getBus()?.post({ type: "url:batch", rows: loaded.urls });
    this.getBus()?.post({ type: "issue:batch", rows: loaded.issues });
    this.getBus()?.post({ type: "link:batch", rows: loaded.links });
    // Seed the PSI grid: already-done rows replay + missing ones show pending,
    // and the PsiWorker gets the missing URLs so it picks up where it left off.
    this.seedResumePsi(loaded, strategies);
    this.startFlushTimer();

    crawler
      .startWithState(loaded.crawl.baseUrl, visited, queue)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.getBus()?.post({ type: "crawl:error", message: msg });
        if (this.db && this.crawlId !== null) {
          this.db.setStatus(this.crawlId, "error", true);
          this.notifyCrawlsChanged();
        }
      })
      .finally(() => {
        void this.closeRenderer();
      });
  }

  private seedResumePsi(loaded: LoadedCrawl, strategies: PsiStrategy[]): void {
    if (strategies.length === 0) {
      return;
    }
    // Replay the PSI rows we already have so the grid reflects prior progress.
    if (loaded.pagespeed.length > 0) {
      this.getBus()?.post({
        type: "pagespeed:batch",
        rows: loaded.pagespeed.map((r) => ({ ...r })),
      });
    }
    const done = new Set(loaded.pagespeed.map((r) => `${r.url}|${r.strategy}`));
    const pendingRows: CwvRow[] = [];
    const toEnqueue = new Set<string>();
    for (const u of loaded.urls) {
      if (u.statusCode === null || u.statusCode < 200 || u.statusCode >= 400) {
        continue;
      }
      for (const s of strategies) {
        if (done.has(`${u.url}|${s}`)) {
          continue;
        }
        pendingRows.push(pendingPsiRow(u.url, s));
        toEnqueue.add(u.url);
      }
    }
    if (pendingRows.length > 0 && this.crawlId === this.psiOwnerCrawlId) {
      this.getBus()?.post({ type: "pagespeed:batch", rows: pendingRows });
    }
    if (this.psiWorker) {
      for (const url of toEnqueue) {
        this.psiTotalExpected++;
        this.psiWorker.enqueue(url);
      }
    }
  }

  archive(id: number): void {
    this.db?.archiveCrawl(id);
    this.notifyCrawlsChanged();
  }

  unarchive(id: number): void {
    this.db?.unarchiveCrawl(id);
    this.notifyCrawlsChanged();
  }

  remove(id: number): void {
    this.db?.deleteCrawl(id);
    if (this.crawlId === id) {
      this.crawlId = null;
    }
    this.notifyCrawlsChanged();
  }

  private async tryCreateRenderer(): Promise<JsRenderer | null> {
    if (!this.config.jsEnabled) {
      return null;
    }
    if (vscode.env.uiKind === vscode.UIKind.Web) {
      void vscode.window.showWarningMessage(
        "SafiCrawl: JavaScript rendering requires the desktop VS Code. Disabled for this session.",
      );
      return null;
    }
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const detection = detectPlaywright({
      workspacePath,
      configuredPath: this.config.jsPlaywrightPath || undefined,
    });
    if (!detection.playwright) {
      void vscode.window
        .showWarningMessage(
          "SafiCrawl: Playwright is not installed. JS rendering disabled for this crawl.",
          "Open Install Instructions",
        )
        .then((pick) => {
          if (pick) {
            void vscode.commands.executeCommand("SafiCrawl.openPlaywrightDocs");
          }
        });
      return null;
    }
    try {
      return await JsRenderer.create(detection.playwright, {
        browser: this.config.jsBrowser,
        concurrency: this.config.jsConcurrency,
        viewportWidth: this.config.jsViewportWidth,
        viewportHeight: this.config.jsViewportHeight,
        waitSec: this.config.jsWaitSec,
        timeoutSec: this.config.jsTimeoutSec,
        userAgent: this.config.userAgent,
      });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `SafiCrawl: Failed to start Playwright (${err instanceof Error ? err.message : String(err)}). Run "Install Playwright Browsers".`,
      );
      return null;
    }
  }

  private async closeRenderer(): Promise<void> {
    const r = this.jsRenderer;
    this.jsRenderer = null;
    if (r) {
      try {
        await r.close();
      } catch {
        /* ignore */
      }
    }
  }

  stop(): void {
    this.crawler?.stop();
    this.psiWorker?.abort("crawl stopped");
  }

  pauseResume(): void {
    if (!this.crawler) {
      return;
    }
    const status = this.crawler.getStatus();
    if (status === "running") {
      this.crawler.pause();
    } else if (status === "paused") {
      this.crawler.resume();
    }
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
    this.psiWorker?.abort("disposed");
    this.stopFlushTimer();
    this.statusBar.setIdle();
    void this.closeRenderer();
  }

  // ---- engine plumbing ----------------------------------------------------

  private bindCrawler(c: Crawler): void {
    c.on("url:crawled", (r) => this.onUrl(r));
    c.on("issue:found", (i) => this.onIssue(i));
    c.on("link:found", (l) => this.onLink(l));
    c.on("stats:tick", (s) => this.onStats(s));
    c.on("queue:seeded", ({ urls }) => this.onQueueSeeded(urls));
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

  /**
   * When sitemap discovery finishes, pre-populate the webview with a pending
   * row for every URL that will be crawled (+ pending PSI rows for each
   * configured strategy). Rows carry null metrics and get replaced in-place
   * as the crawl fills them in.
   */
  private onQueueSeeded(urls: string[]): void {
    const bus = this.getBus();
    const pendingUrlRows: UrlRow[] = [];
    const alreadyKnown = new Set<string>();
    for (const row of this.urlBuf.snapshot()) {
      alreadyKnown.add(row.url);
    }
    for (const url of urls) {
      if (alreadyKnown.has(url)) {
        continue;
      }
      alreadyKnown.add(url);
      pendingUrlRows.push({
        url,
        statusCode: null,
        title: null,
        wordCount: null,
        loadTimeMs: null,
        issueCount: 0,
        depth: 0,
        internal: true,
      });
    }
    if (pendingUrlRows.length > 0) {
      this.urlBuf.pushMany(pendingUrlRows);
      flushInChunks(pendingUrlRows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "url:batch", rows: chunk }),
      );
      if (this.db && this.crawlId !== null) {
        try {
          this.db.saveUrls(this.crawlId, pendingUrlRows, this.jsRenderedByUrl);
        } catch (err) {
          this.logDbError("saveUrls (pending)", err);
        }
      }
    }
    if (
      this.psiWorker &&
      this.psiStrategies.length > 0 &&
      this.crawlId === this.psiOwnerCrawlId
    ) {
      const pendingPsiRows: CwvRow[] = [];
      const alreadyDone = new Set(
        this.pagespeedRows.map((r) => `${r.url}|${r.strategy}`),
      );
      for (const url of urls) {
        for (const s of this.psiStrategies) {
          if (alreadyDone.has(`${url}|${s}`)) {
            continue;
          }
          pendingPsiRows.push(pendingPsiRow(url, s));
        }
      }
      if (pendingPsiRows.length > 0) {
        bus?.post({ type: "pagespeed:batch", rows: pendingPsiRows });
      }
    }
  }

  private onUrl(result: CrawlResult): void {
    this.pendingUrls.set(result.url, result);
    if (result.javascriptRendered) {
      this.jsRenderedByUrl.set(result.url, true);
    }
    // Stream into PSI worker as soon as a successful URL is crawled, so PSI
    // runs in parallel with the rest of the crawl instead of waiting for `done`.
    if (
      this.psiWorker &&
      result.statusCode !== null &&
      result.statusCode >= 200 &&
      result.statusCode < 400 &&
      this.psiTotalExpected <
        (this.getWsConfig().get<number>("pagespeed.urlLimit") ?? 50)
    ) {
      this.psiTotalExpected++;
      this.psiWorker.enqueue(result.url);
    }
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

    if (this.db && this.crawlId !== null && this.crawler) {
      const checkpoint = this.crawler.getCheckpoint();
      const pendingRemains = checkpoint.queue.length > 0;
      const psiRemaining = this.countPsiRemaining();
      const canResumeNow = pendingRemains || psiRemaining > 0;
      try {
        this.db.saveQueue(this.crawlId, checkpoint.queue);
        this.db.saveCheckpoint(this.crawlId, checkpoint);
        this.db.setStatus(
          this.crawlId,
          pendingRemains ? "interrupted" : "completed",
          canResumeNow,
        );
      } catch (err) {
        this.logDbError("finalize", err);
      }
      this.notifyCrawlsChanged();
    }

    void this.drainPsiWorker();
  }

  /**
   * How many url × strategy PSI cells still have no saved result. Used when
   * finalising so a crawl whose HTML is complete but PSI still in-flight can
   * be resumed by the user.
   */
  private countPsiRemaining(): number {
    if (this.psiStrategies.length === 0) {
      return 0;
    }
    const done = new Set(
      this.pagespeedRows.map((r) => `${r.url}|${r.strategy}`),
    );
    let missing = 0;
    for (const row of this.urlBuf.snapshot()) {
      if (
        row.statusCode === null ||
        row.statusCode < 200 ||
        row.statusCode >= 400
      ) {
        continue;
      }
      for (const s of this.psiStrategies) {
        if (!done.has(`${row.url}|${s}`)) {
          missing++;
        }
      }
    }
    return missing;
  }

  /** Resolve the current workspace setting for PSI strategies. */
  private resolveConfiguredStrategies(): PsiStrategy[] {
    const cfg = this.getWsConfig();
    if (!cfg.get<boolean>("pagespeed.enabled")) {
      return [];
    }
    const choice = cfg.get<string>("pagespeed.strategy") ?? "mobile";
    if (choice === "both") {
      return ["mobile", "desktop"];
    }
    if (choice === "desktop") {
      return ["desktop"];
    }
    return ["mobile"];
  }

  /** Create the streaming PSI worker before the crawl starts, if enabled + key configured. */
  private async maybeCreatePsiWorker(strategies: PsiStrategy[]): Promise<void> {
    this.psiWorker = null;
    this.psiTotalExpected = 0;
    this.psiStrategies = strategies;
    if (strategies.length === 0) {
      return;
    }
    const cfg = this.getWsConfig();
    const key = await this.getPsiKey();
    if (!key) {
      void vscode.window.showWarningMessage(
        'SafiCrawl: PageSpeed is enabled but no API key is configured. Run "Set PageSpeed API Key".',
      );
      return;
    }
    const concurrency = cfg.get<number>("pagespeed.concurrency") ?? 2;
    // Capture the owner crawl + its rows array so late PSI callbacks never
    // leak into a different crawl that the user may have loaded in the UI.
    const ownerCrawlId = this.crawlId;
    const ownerRows = this.pagespeedRows;
    this.psiOwnerCrawlId = ownerCrawlId;
    this.psiWorker = new PsiWorker({
      apiKey: key,
      strategies,
      concurrency,
      onResult: (row) => {
        ownerRows.push(row);
        if (this.db && ownerCrawlId !== null) {
          try {
            this.db.savePageSpeed(ownerCrawlId, [row]);
          } catch (err) {
            this.logDbError("savePageSpeed", err);
          }
        }
        // Only stream to the webview if the user is still viewing this crawl.
        if (this.crawlId === ownerCrawlId) {
          this.getBus()?.post({ type: "pagespeed:batch", rows: [row] });
        }
      },
      onAbort: (reason) => {
        void vscode.window.showErrorMessage(`SafiCrawl: ${reason}`);
      },
    });
  }

  /** Drain the PSI worker after the crawl finishes. Emits pagespeed:done when complete. */
  private async drainPsiWorker(): Promise<void> {
    const worker = this.psiWorker;
    if (!worker) {
      return;
    }
    const ownerCrawlId = this.psiOwnerCrawlId;
    const summary = await worker.drain();
    this.psiWorker = null;
    this.psiOwnerCrawlId = null;
    // Only notify the webview if the owner crawl is still the one on screen.
    if (this.crawlId === ownerCrawlId) {
      this.getBus()?.post({
        type: "pagespeed:done",
        analyzed: summary.analyzed,
        skipped: summary.skipped,
      });
    }
    if (!summary.aborted) {
      void vscode.window.showInformationMessage(
        `SafiCrawl: PageSpeed analyzed ${summary.analyzed} URL(s), skipped ${summary.skipped}.`,
      );
    }
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
      if (this.db && this.crawlId !== null) {
        try {
          this.db.saveUrls(this.crawlId, rows, this.jsRenderedByUrl);
        } catch (err) {
          this.logDbError("saveUrls", err);
        }
      }
    }

    if (this.pendingIssues.length > 0) {
      const rows = this.pendingIssues.splice(0, this.pendingIssues.length);
      this.issueBuf.pushMany(rows);
      flushInChunks(rows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "issue:batch", rows: chunk }),
      );
      if (this.db && this.crawlId !== null) {
        try {
          this.db.saveIssues(this.crawlId, rows);
        } catch (err) {
          this.logDbError("saveIssues", err);
        }
      }
    }

    if (this.pendingLinks.length > 0) {
      const rows = this.pendingLinks.splice(0, this.pendingLinks.length);
      this.linkBuf.pushMany(rows);
      flushInChunks(rows, BATCH_SIZE, (chunk) =>
        bus?.post({ type: "link:batch", rows: chunk }),
      );
      if (this.db && this.crawlId !== null) {
        try {
          this.db.saveLinks(this.crawlId, rows);
        } catch (err) {
          this.logDbError("saveLinks", err);
        }
      }
    }
  }

  private logDbError(label: string, err: unknown): void {
    console.error(
      `[SafiCrawl DB] ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  private reset(): void {
    this.urlBuf.clear();
    this.linkBuf.clear();
    this.issueBuf.clear();
    this.pendingUrls.clear();
    this.pendingLinks.length = 0;
    this.pendingIssues.length = 0;
    this.issuesByUrl.clear();
    this.jsRenderedByUrl.clear();
    this.pagespeedRows = [];
    this.psiStrategies = [];
    this.canContinueCurrent = false;
    this.lastStats = makeIdleStats();
    this.lastWebviewStatsAt = 0;
  }
}

function pendingPsiRow(url: string, strategy: PsiStrategy): CwvRow {
  return {
    url,
    strategy,
    performance: null,
    lcpMs: null,
    clsScore: null,
    fcpMs: null,
    inpMs: null,
    ttfbMs: null,
    tbtMs: null,
    error: null,
  };
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
