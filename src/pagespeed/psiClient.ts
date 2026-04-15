import { request } from "undici";
import type { CwvRow, PsiStrategy } from "./types";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const REQUEST_SPACING_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export interface RunBatchOptions {
  apiKey: string;
  strategies: PsiStrategy[];
  limit: number;
  onResult?: (row: CwvRow) => void;
  onAbort?: (reason: string) => void;
  signal?: { aborted: boolean };
}

export interface RunBatchSummary {
  analyzed: number;
  skipped: number;
  aborted: boolean;
}

/**
 * Runs Google PageSpeed Insights over a URL list with a small rate budget.
 * Streams results via onResult as they arrive.
 * Hard-disables on 403/invalid-key (returns aborted=true).
 */
export async function runBatch(
  urls: string[],
  options: RunBatchOptions,
): Promise<RunBatchSummary> {
  const limited = urls.slice(0, Math.max(0, options.limit));
  let analyzed = 0;
  let skipped = 0;
  let backoff = 0;

  for (const url of limited) {
    if (options.signal?.aborted) {
      return { analyzed, skipped, aborted: true };
    }

    for (const strategy of options.strategies) {
      if (options.signal?.aborted) {
        return { analyzed, skipped, aborted: true };
      }
      const row = await fetchOne(url, strategy, options.apiKey, backoff);
      if (row.status === "keyRevoked") {
        options.onAbort?.("Invalid PageSpeed API key — feature disabled.");
        return { analyzed, skipped: limited.length - analyzed, aborted: true };
      }
      if (row.status === "rateLimited") {
        backoff = Math.min(MAX_BACKOFF_MS, backoff === 0 ? 2000 : backoff * 2);
        skipped++;
      } else {
        backoff = 0;
        analyzed++;
        options.onResult?.(row.row);
      }
      await delay(REQUEST_SPACING_MS);
    }
  }

  return { analyzed, skipped, aborted: false };
}

export async function fetchOne(
  url: string,
  strategy: PsiStrategy,
  apiKey: string,
  backoff: number,
): Promise<{
  status: "ok" | "rateLimited" | "error" | "keyRevoked";
  row: CwvRow;
}> {
  if (backoff > 0) {
    await delay(backoff);
  }
  const endpoint = `${ENDPOINT}?url=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}&strategy=${strategy}`;
  try {
    const res = await request(endpoint, {
      method: "GET",
      headersTimeout: 30_000,
      bodyTimeout: 60_000,
    });
    if (res.statusCode === 403) {
      return {
        status: "keyRevoked",
        row: errorRow(url, strategy, "403 Forbidden"),
      };
    }
    if (res.statusCode === 429) {
      return {
        status: "rateLimited",
        row: errorRow(url, strategy, "429 Rate Limited"),
      };
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return {
        status: "error",
        row: errorRow(url, strategy, `HTTP ${res.statusCode}`),
      };
    }
    const text = await res.body.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { status: "ok", row: parseResponse(url, strategy, parsed) };
  } catch (err) {
    return {
      status: "error",
      row: errorRow(
        url,
        strategy,
        err instanceof Error ? err.message : String(err),
      ),
    };
  }
}

function parseResponse(
  url: string,
  strategy: PsiStrategy,
  body: Record<string, unknown>,
): CwvRow {
  const lighthouse =
    (body.lighthouseResult as Record<string, unknown> | undefined) ?? {};
  const categories =
    (lighthouse.categories as Record<string, { score?: number }> | undefined) ??
    {};
  const audits =
    (lighthouse.audits as
      | Record<string, { numericValue?: number }>
      | undefined) ?? {};
  const loading =
    (body.loadingExperience as Record<string, unknown> | undefined) ?? {};
  const metrics =
    (loading.metrics as Record<string, { percentile?: number }> | undefined) ??
    {};

  return {
    url,
    strategy,
    performance:
      typeof categories.performance?.score === "number"
        ? categories.performance.score
        : null,
    lcpMs: toNumber(audits["largest-contentful-paint"]?.numericValue),
    clsScore: toNumber(audits["cumulative-layout-shift"]?.numericValue),
    fcpMs: toNumber(audits["first-contentful-paint"]?.numericValue),
    inpMs: toNumber(metrics["INTERACTION_TO_NEXT_PAINT"]?.percentile),
    ttfbMs: toNumber(audits["server-response-time"]?.numericValue),
    tbtMs: toNumber(audits["total-blocking-time"]?.numericValue),
    error: null,
  };
}

function errorRow(url: string, strategy: PsiStrategy, message: string): CwvRow {
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
    error: message,
  };
}

function toNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PsiWorkerOptions {
  apiKey: string;
  strategies: PsiStrategy[];
  concurrency: number;
  onResult?: (row: CwvRow) => void;
  onProgress?: (analyzed: number, skipped: number) => void;
  onAbort?: (reason: string) => void;
}

/**
 * Streaming PageSpeed Insights worker.
 * Runs N concurrent workers, each pulling from an internal queue with ~1 s spacing per worker.
 * Enqueue URLs at any time; call `drain()` to wait for the queue to empty.
 */
export class PsiWorker {
  private readonly queue: string[] = [];
  private readonly seen = new Set<string>();
  private readonly concurrency: number;
  private active = 0;
  private analyzed = 0;
  private skipped = 0;
  private aborted = false;
  private backoffMs = 0;
  private drainResolvers: Array<() => void> = [];
  private pokeResolver: (() => void) | null = null;
  private pokePromise: Promise<void> | null = null;

  constructor(private readonly options: PsiWorkerOptions) {
    this.concurrency = Math.max(1, Math.min(5, options.concurrency));
    for (let i = 0; i < this.concurrency; i++) {
      void this.workerLoop();
    }
  }

  enqueue(url: string): void {
    if (this.aborted) {
      return;
    }
    if (this.seen.has(url)) {
      return;
    }
    this.seen.add(url);
    this.queue.push(url);
    this.poke();
  }

  get summary(): { analyzed: number; skipped: number; aborted: boolean } {
    return {
      analyzed: this.analyzed,
      skipped: this.skipped,
      aborted: this.aborted,
    };
  }

  abort(reason = "aborted"): void {
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    this.queue.length = 0;
    this.options.onAbort?.(reason);
    this.poke();
    this.resolveDrainers();
  }

  /** Wait until the queue is empty and all workers are idle. */
  drain(): Promise<{ analyzed: number; skipped: number; aborted: boolean }> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.aborted || (this.queue.length === 0 && this.active === 0)) {
          resolve(this.summary);
        } else {
          this.drainResolvers.push(() => resolve(this.summary));
        }
      };
      check();
    });
  }

  private resolveDrainers(): void {
    const resolvers = this.drainResolvers.splice(0, this.drainResolvers.length);
    for (const r of resolvers) {
      r();
    }
  }

  private poke(): void {
    if (this.pokeResolver) {
      const r = this.pokeResolver;
      this.pokeResolver = null;
      this.pokePromise = null;
      r();
    }
  }

  private waitForWork(): Promise<void> {
    if (this.pokePromise) {
      return this.pokePromise;
    }
    this.pokePromise = new Promise<void>((resolve) => {
      this.pokeResolver = resolve;
    });
    return this.pokePromise;
  }

  private async workerLoop(): Promise<void> {
    while (!this.aborted) {
      const url = this.queue.shift();
      if (!url) {
        if (this.active === 0) {
          this.resolveDrainers();
        }
        await this.waitForWork();
        continue;
      }
      this.active++;
      try {
        for (const strategy of this.options.strategies) {
          if (this.aborted) {
            break;
          }
          const res = await fetchOne(
            url,
            strategy,
            this.options.apiKey,
            this.backoffMs,
          );
          if (res.status === "keyRevoked") {
            this.abort("Invalid PageSpeed API key \u2014 feature disabled.");
            break;
          }
          if (res.status === "rateLimited") {
            this.backoffMs = Math.min(
              MAX_BACKOFF_MS,
              this.backoffMs === 0 ? 2000 : this.backoffMs * 2,
            );
            this.skipped++;
          } else {
            this.backoffMs = 0;
            this.analyzed++;
            this.options.onResult?.(res.row);
          }
          this.options.onProgress?.(this.analyzed, this.skipped);
          await delay(REQUEST_SPACING_MS);
        }
      } finally {
        this.active--;
        if (this.queue.length === 0 && this.active === 0) {
          this.resolveDrainers();
        }
      }
    }
    this.resolveDrainers();
  }
}
