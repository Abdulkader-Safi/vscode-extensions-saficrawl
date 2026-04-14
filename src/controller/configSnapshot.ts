import type { WorkspaceConfiguration } from "vscode";
import { DEFAULT_CONFIG, type CrawlerConfig } from "../engine/types";

export function readConfig(cfg: WorkspaceConfiguration): CrawlerConfig {
  return {
    maxDepth: num(cfg, "crawler.maxDepth", DEFAULT_CONFIG.maxDepth),
    maxUrls: num(cfg, "crawler.maxUrls", DEFAULT_CONFIG.maxUrls),
    delaySec: num(cfg, "crawler.delay", DEFAULT_CONFIG.delaySec),
    concurrency: num(cfg, "crawler.concurrency", DEFAULT_CONFIG.concurrency),
    followRedirects: bool(
      cfg,
      "crawler.followRedirects",
      DEFAULT_CONFIG.followRedirects,
    ),
    includeExternal: bool(
      cfg,
      "crawler.includeExternal",
      DEFAULT_CONFIG.includeExternal,
    ),
    discoverSitemaps: bool(
      cfg,
      "crawler.discoverSitemaps",
      DEFAULT_CONFIG.discoverSitemaps,
    ),
    userAgent: str(cfg, "requests.userAgent", DEFAULT_CONFIG.userAgent),
    timeoutSec: num(cfg, "requests.timeout", DEFAULT_CONFIG.timeoutSec),
    retries: num(cfg, "requests.retries", DEFAULT_CONFIG.retries),
    respectRobots: bool(
      cfg,
      "requests.respectRobots",
      DEFAULT_CONFIG.respectRobots,
    ),
    acceptLanguage: str(
      cfg,
      "requests.acceptLanguage",
      DEFAULT_CONFIG.acceptLanguage,
    ),
    includeExtensions: arr(
      cfg,
      "filters.includeExtensions",
      DEFAULT_CONFIG.includeExtensions,
    ),
    excludeExtensions: arr(
      cfg,
      "filters.excludeExtensions",
      DEFAULT_CONFIG.excludeExtensions,
    ),
    urlRegex: str(cfg, "filters.urlRegex", DEFAULT_CONFIG.urlRegex),
    maxFileSizeMB: num(
      cfg,
      "filters.maxFileSizeMB",
      DEFAULT_CONFIG.maxFileSizeMB,
    ),
    proxy: str(cfg, "advanced.proxy", DEFAULT_CONFIG.proxy),
    customHeaders: obj(
      cfg,
      "advanced.customHeaders",
      DEFAULT_CONFIG.customHeaders,
    ),
    excludePatterns: DEFAULT_CONFIG.excludePatterns,
    jsEnabled: bool(cfg, "javascript.enabled", DEFAULT_CONFIG.jsEnabled),
    jsBrowser: enumStr(
      cfg,
      "javascript.browser",
      ["chromium", "firefox", "webkit"],
      DEFAULT_CONFIG.jsBrowser,
    ) as CrawlerConfig["jsBrowser"],
    jsViewportWidth: num(
      cfg,
      "javascript.viewportWidth",
      DEFAULT_CONFIG.jsViewportWidth,
    ),
    jsViewportHeight: num(
      cfg,
      "javascript.viewportHeight",
      DEFAULT_CONFIG.jsViewportHeight,
    ),
    jsConcurrency: num(
      cfg,
      "javascript.concurrency",
      DEFAULT_CONFIG.jsConcurrency,
    ),
    jsWaitSec: num(cfg, "javascript.waitTime", DEFAULT_CONFIG.jsWaitSec),
    jsTimeoutSec: num(cfg, "javascript.timeout", DEFAULT_CONFIG.jsTimeoutSec),
    jsPlaywrightPath: str(
      cfg,
      "javascript.playwrightPath",
      DEFAULT_CONFIG.jsPlaywrightPath,
    ),
  };
}

function enumStr(
  cfg: WorkspaceConfiguration,
  key: string,
  allowed: string[],
  d: string,
): string {
  const v = cfg.get<string>(key);
  return typeof v === "string" && allowed.includes(v) ? v : d;
}

const HOT_KEYS = new Set<keyof CrawlerConfig>(["delaySec"]);

export function hotApplicablePatch(
  oldCfg: CrawlerConfig,
  newCfg: CrawlerConfig,
): { hot: Partial<CrawlerConfig>; deferred: Array<keyof CrawlerConfig> } {
  const hot: Partial<CrawlerConfig> = {};
  const deferred: Array<keyof CrawlerConfig> = [];
  for (const key of Object.keys(newCfg) as Array<keyof CrawlerConfig>) {
    if (!deepEq(oldCfg[key], newCfg[key])) {
      if (HOT_KEYS.has(key)) {
        (hot as Record<string, unknown>)[key] = newCfg[key];
      } else {
        deferred.push(key);
      }
    }
  }
  return { hot, deferred };
}

function num(cfg: WorkspaceConfiguration, key: string, d: number): number {
  const v = cfg.get<number>(key);
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function bool(cfg: WorkspaceConfiguration, key: string, d: boolean): boolean {
  const v = cfg.get<boolean>(key);
  return typeof v === "boolean" ? v : d;
}
function str(cfg: WorkspaceConfiguration, key: string, d: string): string {
  const v = cfg.get<string>(key);
  return typeof v === "string" ? v : d;
}
function arr(cfg: WorkspaceConfiguration, key: string, d: string[]): string[] {
  const v = cfg.get<string[]>(key);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : d;
}
function obj(
  cfg: WorkspaceConfiguration,
  key: string,
  d: Record<string, string>,
): Record<string, string> {
  const v = cfg.get<Record<string, string>>(key);
  return v && typeof v === "object" && !Array.isArray(v) ? v : d;
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((x, i) => deepEq(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) {
      return false;
    }
    return ka.every((k) =>
      deepEq(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}
