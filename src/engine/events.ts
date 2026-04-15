import { EventEmitter } from "node:events";
import type { CrawlResult, CrawlStatsSnapshot, Issue, Link } from "./types";

export interface CrawlerEventMap {
  "url:crawled": [CrawlResult];
  "issue:found": [Issue];
  "link:found": [Link];
  "stats:tick": [CrawlStatsSnapshot];
  done: [CrawlStatsSnapshot];
  error: [{ url: string; error: string }];
  // Emitted once after seed + sitemap URLs have been enqueued (and survived filters)
  // so the UI can pre-populate pending rows for everything that will be crawled.
  "queue:seeded": [{ urls: string[] }];
}

export class CrawlerEvents extends EventEmitter {
  override emit<K extends keyof CrawlerEventMap>(
    event: K,
    ...args: CrawlerEventMap[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof CrawlerEventMap>(
    event: K,
    listener: (...args: CrawlerEventMap[K]) => void,
  ): this {
    return super.on(event, listener as (...a: unknown[]) => void);
  }

  override off<K extends keyof CrawlerEventMap>(
    event: K,
    listener: (...args: CrawlerEventMap[K]) => void,
  ): this {
    return super.off(event, listener as (...a: unknown[]) => void);
  }
}
