import * as cheerio from "cheerio";
import type { CrawlResult, ImageInfo } from "./types";
import { normalizeUrl } from "./urlFilter";

export interface ExtractorInput {
  url: string;
  depth: number;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  size: number;
  responseTimeMs: number;
  redirectChain: string[];
  headers: Record<string, string>;
  html: string;
}

const ANALYTICS_SIGNATURES: Array<[string, RegExp]> = [
  ["google-analytics", /\b(?:gtag\(|ga\(|G-[A-Z0-9]{6,}|UA-\d+-\d+)\b/],
  ["google-tag-manager", /\bGTM-[A-Z0-9]{4,}\b/],
  ["facebook-pixel", /\bfbq\s*\(/],
  ["hotjar", /\bhjid\b|static\.hotjar\.com/],
  ["mixpanel", /\bmixpanel\./],
  ["segment", /\banalytics\.load\s*\(/],
];

export function parsePage(input: ExtractorInput): CrawlResult {
  const $ = cheerio.load(input.html, { xmlMode: false });

  const title = textOrNull($("head > title").first().text());
  const metaTags = collectMeta($);
  const ogTags = pickPrefixed(metaTags, "og:");
  const twitterTags = pickPrefixed(metaTags, "twitter:");

  const canonicalHref = $('link[rel="canonical"]').attr("href") ?? null;
  const canonical = canonicalHref ? normalizeUrl(canonicalHref, input.finalUrl) : null;

  const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $("h2").slice(0, 10).map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3 = $("h3").slice(0, 10).map((_, el) => $(el).text().trim()).get().filter(Boolean);

  const bodyText = visibleText($);
  const wordCount = (bodyText.match(/\w+/g) ?? []).length;

  const jsonLd = parseJsonLd($);
  const microdata = parseMicrodata($);
  const analytics = detectAnalytics($);
  const hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({
      hreflang: $(el).attr("hreflang") ?? "",
      href: $(el).attr("href") ?? "",
    }))
    .get()
    .filter((h) => h.hreflang && h.href);

  const images: ImageInfo[] = $("img")
    .slice(0, 20)
    .map((_, el) => ({
      src: normalizeUrl($(el).attr("src") ?? "", input.finalUrl) ?? "",
      alt: attrOrNull($(el).attr("alt")),
      width: attrOrNull($(el).attr("width")),
      height: attrOrNull($(el).attr("height")),
    }))
    .get()
    .filter((img) => img.src);

  const baseDomain = hostWithoutWww(input.finalUrl);
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) {return;}
    const abs = normalizeUrl(href, input.finalUrl);
    if (!abs) {return;}
    if (hostWithoutWww(abs) === baseDomain) {internalLinkCount++;}
    else {externalLinkCount++;}
  });

  return {
    url: input.url,
    depth: input.depth,
    statusCode: input.statusCode,
    contentType: input.contentType,
    size: input.size,
    responseTimeMs: input.responseTimeMs,
    redirectChain: input.redirectChain,
    error: null,

    title,
    metaDescription: metaTags["description"] ?? null,
    metaTags,
    ogTags,
    twitterTags,
    canonical,
    robots: metaTags["robots"] ?? null,
    lang: $("html").attr("lang") ?? null,
    charset: detectCharset($, input.headers),

    h1,
    h2,
    h3,
    wordCount,

    jsonLd,
    microdata,
    analytics,
    hreflang,
    images,

    internalLinkCount,
    externalLinkCount,

    javascriptRendered: false,
    linkedFrom: [],
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function attrOrNull(value: string | undefined): string | null {
  if (value === undefined) {return null;}
  return value;
}

function collectMeta($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $("meta").each((_, el) => {
    const name = ($(el).attr("name") ?? $(el).attr("property") ?? "").trim().toLowerCase();
    const content = $(el).attr("content");
    if (name && typeof content === "string") {out[name] = content;}
  });
  return out;
}

function pickPrefixed(map: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) {out[k.slice(prefix.length)] = v;}
  }
  return out;
}

function visibleText($: cheerio.CheerioAPI): string {
  const $clone = cheerio.load($.html());
  $clone("script, style, noscript, template").remove();
  return $clone("body").text() ?? "";
}

function parseJsonLd($: cheerio.CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) {return;}
    try {
      out.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD: skip silently (Features.md §3 tolerance)
    }
  });
  return out;
}

function parseMicrodata($: cheerio.CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $("[itemtype]").each((_, el) => {
    const $el = $(el);
    const props: Record<string, string> = {};
    $el.find("[itemprop]").each((_, p) => {
      const key = $(p).attr("itemprop") ?? "";
      const value = $(p).attr("content") ?? $(p).attr("href") ?? $(p).text().trim();
      if (key) {props[key] = value;}
    });
    out.push({ itemtype: $el.attr("itemtype"), props });
  });
  return out;
}

function detectAnalytics($: cheerio.CheerioAPI): string[] {
  const found = new Set<string>();
  const scriptBodies: string[] = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (src) {scriptBodies.push(src);}
    const body = $(el).contents().text();
    if (body) {scriptBodies.push(body);}
  });
  const haystack = scriptBodies.join("\n");
  for (const [name, re] of ANALYTICS_SIGNATURES) {
    if (re.test(haystack)) {found.add(name);}
  }
  return [...found];
}

function detectCharset($: cheerio.CheerioAPI, headers: Record<string, string>): string | null {
  const metaCharset = $("meta[charset]").attr("charset");
  if (metaCharset) {return metaCharset;}
  const ct = headers["content-type"] ?? "";
  const m = /charset=([^;]+)/i.exec(ct);
  return m ? m[1].trim() : null;
}

function hostWithoutWww(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
