import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "node:zlib";
import type { HttpClient } from "./httpClient";

const STANDARD_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemaps.xml", "/sitemap/sitemap.xml"];
const MAX_DEPTH = 10;

export interface SitemapDiscovery {
  urls: string[];
  sitemapsTried: string[];
  robotsUrl: string;
}

export async function discover(baseUrl: string, http: HttpClient): Promise<SitemapDiscovery> {
  const origin = new URL(baseUrl).origin;
  const robotsUrl = origin + "/robots.txt";
  const sitemapLocations = new Set<string>();

  try {
    const res = await http.get(robotsUrl);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      for (const line of res.body.toString("utf8").split(/\r?\n/)) {
        const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
        if (m) {sitemapLocations.add(m[1].trim());}
      }
    }
  } catch {
    // robots.txt is best-effort
  }

  for (const path of STANDARD_PATHS) {sitemapLocations.add(origin + path);}

  const urls = new Set<string>();
  const tried: string[] = [];
  for (const loc of sitemapLocations) {
    tried.push(loc);
    await walkSitemap(loc, http, urls, 0);
  }

  return { urls: [...urls], sitemapsTried: tried, robotsUrl };
}

async function walkSitemap(
  sitemapUrl: string,
  http: HttpClient,
  sink: Set<string>,
  depth: number
): Promise<void> {
  if (depth > MAX_DEPTH) {return;}
  let res;
  try {
    res = await http.get(sitemapUrl);
  } catch {
    return;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {return;}

  let body = res.body;
  const encoding = (res.headers["content-encoding"] ?? "").toLowerCase();
  if (sitemapUrl.endsWith(".gz") || encoding === "gzip") {
    try {
      body = gunzipSync(body);
    } catch {
      return;
    }
  }

  const xml = body.toString("utf8");
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    trimValues: true,
  });

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return;
  }

  const root = (doc as Record<string, unknown> | null) ?? {};
  const sitemapIndex = (root as { sitemapindex?: { sitemap?: unknown } }).sitemapindex;
  const urlset = (root as { urlset?: { url?: unknown } }).urlset;

  if (sitemapIndex) {
    const entries = arrayOf(sitemapIndex.sitemap);
    for (const e of entries) {
      const loc = readLoc(e);
      if (loc) {await walkSitemap(loc, http, sink, depth + 1);}
    }
    return;
  }

  if (urlset) {
    const entries = arrayOf(urlset.url);
    for (const e of entries) {
      const loc = readLoc(e);
      if (loc) {sink.add(loc);}
    }
  }
}

function arrayOf(value: unknown): unknown[] {
  if (Array.isArray(value)) {return value;}
  if (value === undefined || value === null) {return [];}
  return [value];
}

function readLoc(entry: unknown): string | null {
  if (typeof entry === "string") {return entry.trim() || null;}
  if (entry && typeof entry === "object" && "loc" in entry) {
    const loc = (entry as { loc: unknown }).loc;
    if (typeof loc === "string") {return loc.trim() || null;}
  }
  return null;
}
