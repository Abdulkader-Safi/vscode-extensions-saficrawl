import type {
  PlaywrightBrowser,
  PlaywrightContext,
  PlaywrightLike,
  PlaywrightPage,
} from "./playwrightLoader";

export interface JsRendererOptions {
  browser: "chromium" | "firefox" | "webkit";
  concurrency: number;
  viewportWidth: number;
  viewportHeight: number;
  waitSec: number;
  timeoutSec: number;
  userAgent: string;
}

export interface RenderResult {
  html: string;
  statusCode: number | null;
  error: string | null;
}

const SKIP_EXTENSIONS = [
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".mp4",
  ".webm",
  ".mp3",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
];

export function shouldRender(url: string): boolean {
  try {
    const lower = new URL(url).pathname.toLowerCase();
    return !SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Headless page pool backed by a single Playwright browser with N contexts.
 * Callers acquire a page, render, and release. Pages are reused across URLs.
 */
export class JsRenderer {
  private browser: PlaywrightBrowser | null = null;
  private pool: PlaywrightPage[] = [];
  private contexts: PlaywrightContext[] = [];
  private queue: Array<(page: PlaywrightPage) => void> = [];
  private closed = false;

  private constructor(
    private readonly playwright: PlaywrightLike,
    private readonly options: JsRendererOptions,
  ) {}

  static async create(
    playwright: PlaywrightLike,
    options: JsRendererOptions,
  ): Promise<JsRenderer> {
    const renderer = new JsRenderer(playwright, options);
    await renderer.init();
    return renderer;
  }

  private async init(): Promise<void> {
    const type = this.playwright[this.options.browser];
    if (!type) {throw new Error(`Unsupported browser: ${this.options.browser}`);}
    this.browser = await type.launch({ headless: true });
    for (let i = 0; i < Math.max(1, this.options.concurrency); i++) {
      const ctx = await this.browser.newContext({
        viewport: {
          width: this.options.viewportWidth,
          height: this.options.viewportHeight,
        },
        userAgent: this.options.userAgent,
      });
      const page = await ctx.newPage();
      this.contexts.push(ctx);
      this.pool.push(page);
    }
  }

  async render(url: string): Promise<RenderResult> {
    if (this.closed)
      {return { html: "", statusCode: null, error: "renderer closed" };}
    const page = await this.acquire();
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.options.timeoutSec * 1000,
      });
      if (this.options.waitSec > 0)
        {await page.waitForTimeout(this.options.waitSec * 1000);}
      const html = await page.content();
      return {
        html,
        statusCode: response ? response.status() : null,
        error: null,
      };
    } catch (err) {
      return {
        html: "",
        statusCode: null,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.release(page);
    }
  }

  async close(): Promise<void> {
    if (this.closed) {return;}
    this.closed = true;
    for (const resolver of this.queue.splice(0, this.queue.length)) {
      resolver(null as unknown as PlaywrightPage);
    }
    for (const page of this.pool.splice(0, this.pool.length)) {
      try {
        await page.close();
      } catch {
        /* ignore */
      }
    }
    for (const ctx of this.contexts.splice(0, this.contexts.length)) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
    }
  }

  private acquire(): Promise<PlaywrightPage> {
    const available = this.pool.pop();
    if (available) {return Promise.resolve(available);}
    return new Promise<PlaywrightPage>((resolve) => this.queue.push(resolve));
  }

  private release(page: PlaywrightPage): void {
    const next = this.queue.shift();
    if (next) {next(page);}
    else {this.pool.push(page);}
  }
}
