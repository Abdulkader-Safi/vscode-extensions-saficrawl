import { request, ProxyAgent, Agent, type Dispatcher } from "undici";
import type { CrawlerConfig } from "./types";

export interface HttpResponse {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
  responseTimeMs: number;
  redirectChain: string[];
}

export class HttpError extends Error {
  constructor(message: string, readonly url: string, readonly statusCode?: number) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpClient {
  private readonly dispatcher: Dispatcher;

  constructor(private readonly config: Pick<
    CrawlerConfig,
    | "userAgent"
    | "timeoutSec"
    | "retries"
    | "acceptLanguage"
    | "followRedirects"
    | "proxy"
    | "customHeaders"
    | "maxFileSizeMB"
  >) {
    this.dispatcher = config.proxy
      ? new ProxyAgent({ uri: config.proxy, connectTimeout: config.timeoutSec * 1000 })
      : new Agent({ connectTimeout: config.timeoutSec * 1000 });
  }

  async get(url: string): Promise<HttpResponse> {
    let lastError: unknown = null;
    const maxAttempts = this.config.retries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.attempt(url);
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await backoff(attempt);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new HttpError("Unknown error", url);
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }

  private async attempt(url: string): Promise<HttpResponse> {
    const started = Date.now();
    const redirectChain: string[] = [];
    let currentUrl = url;
    const maxRedirects = this.config.followRedirects ? 10 : 0;
    const maxBytes = this.config.maxFileSizeMB * 1024 * 1024;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await request(currentUrl, {
        dispatcher: this.dispatcher,
        method: "GET",
        headersTimeout: this.config.timeoutSec * 1000,
        bodyTimeout: this.config.timeoutSec * 1000,
        headers: this.buildHeaders(),
        maxRedirections: 0,
      });

      const status = res.statusCode;
      const location = headerString(res.headers, "location");

      if (this.config.followRedirects && status >= 300 && status < 400 && location) {
        redirectChain.push(currentUrl);
        currentUrl = new URL(location, currentUrl).toString();
        await drain(res.body);
        continue;
      }

      const body = await readLimited(res.body, maxBytes);
      return {
        url,
        finalUrl: currentUrl,
        statusCode: status,
        headers: flattenHeaders(res.headers),
        body,
        responseTimeMs: Date.now() - started,
        redirectChain,
      };
    }

    throw new HttpError(`Too many redirects (>${maxRedirects})`, url);
  }

  private buildHeaders(): Record<string, string> {
    return {
      "user-agent": this.config.userAgent,
      "accept-language": this.config.acceptLanguage,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...this.config.customHeaders,
    };
  }
}

function headerString(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const raw = headers[name];
  if (Array.isArray(raw)) {return raw[0] ?? null;}
  return typeof raw === "string" ? raw : null;
}

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) {out[k] = v.join(", ");}
    else if (typeof v === "string") {out[k] = v;}
  }
  return out;
}

async function drain(body: NodeJS.ReadableStream): Promise<void> {
  for await (const _chunk of body) {
    // discard
  }
}

async function readLimited(body: NodeJS.ReadableStream, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > max) {
      (body as unknown as { destroy?: () => void }).destroy?.();
      break;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
