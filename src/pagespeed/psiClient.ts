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
    if (options.signal?.aborted) {return { analyzed, skipped, aborted: true };}

    for (const strategy of options.strategies) {
      if (options.signal?.aborted) {return { analyzed, skipped, aborted: true };}
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

async function fetchOne(
  url: string,
  strategy: PsiStrategy,
  apiKey: string,
  backoff: number,
): Promise<{
  status: "ok" | "rateLimited" | "error" | "keyRevoked";
  row: CwvRow;
}> {
  if (backoff > 0) {await delay(backoff);}
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
