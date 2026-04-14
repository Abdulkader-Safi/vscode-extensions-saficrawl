import type { CrawlerConfig } from "./types";

export interface FilterContext {
  config: CrawlerConfig;
  baseDomain: string;
  robotsAllowed: (url: string, ua: string) => boolean;
}

export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {return null;}
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isInternal(url: string, baseDomain: string): boolean {
  return extractDomain(url) === baseDomain;
}

export function shouldCrawl(url: string, depth: number, ctx: FilterContext): boolean {
  const { config, baseDomain, robotsAllowed } = ctx;

  if (depth > config.maxDepth) {return false;}
  if (!isInternal(url, baseDomain) && !config.includeExternal) {return false;}

  const pathname = safePathname(url).toLowerCase();
  if (config.excludeExtensions.some((ext) => pathname.endsWith(ext.toLowerCase()))) {return false;}
  if (config.includeExtensions.length > 0) {
    const ok = config.includeExtensions.some((ext) => pathname.endsWith(ext.toLowerCase()));
    if (!ok) {return false;}
  }

  if (config.urlRegex) {
    try {
      if (!new RegExp(config.urlRegex).test(url)) {return false;}
    } catch {
      // invalid regex → ignore
    }
  }

  if (config.excludePatterns.some((pat) => globMatch(url, pat))) {return false;}

  if (config.respectRobots && !robotsAllowed(url, config.userAgent)) {return false;}

  return true;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function globMatch(value: string, pattern: string): boolean {
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return re.test(value);
}
