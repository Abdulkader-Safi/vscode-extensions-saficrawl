import type { CrawlResult, Issue } from "./types";

export interface IssueThresholds {
  titleMin: number;
  titleMax: number;
  metaDescMin: number;
  metaDescMax: number;
  minWordCount: number;
  responseTimeWarnMs: number;
  responseTimeErrorMs: number;
  pageSizeWarnBytes: number;
  pageSizeErrorBytes: number;
}

export const DEFAULT_THRESHOLDS: IssueThresholds = {
  titleMin: 30,
  titleMax: 60,
  metaDescMin: 120,
  metaDescMax: 160,
  minWordCount: 300,
  responseTimeWarnMs: 1000,
  responseTimeErrorMs: 3000,
  pageSizeWarnBytes: 1 * 1024 * 1024,
  pageSizeErrorBytes: 3 * 1024 * 1024,
};

export function detect(result: CrawlResult, thresholds: IssueThresholds = DEFAULT_THRESHOLDS): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, "url">) => issues.push({ url: result.url, ...i });

  // Skip detection for non-HTML / errored pages.
  if (result.error || result.statusCode === null) {
    if (result.error) {
      push({
        type: "error",
        category: "technical",
        issue: "Fetch failed",
        details: result.error,
      });
    }
    return issues;
  }

  // 5.5 Technical — status code
  if (result.statusCode >= 400 && result.statusCode < 600) {
    push({
      type: "error",
      category: "technical",
      issue: `HTTP ${result.statusCode}`,
      details: `Page returned status code ${result.statusCode}.`,
    });
    return issues;
  }
  if (result.statusCode >= 300 && result.statusCode < 400) {
    push({
      type: "info",
      category: "technical",
      issue: `HTTP ${result.statusCode}`,
      details: `Redirect (${result.redirectChain.length} hops).`,
    });
  }

  // 5.1 Title
  if (!result.title) {
    push({ type: "error", category: "title", issue: "Missing title", details: "No <title> tag found." });
  } else if (result.title.length > thresholds.titleMax) {
    push({
      type: "warning",
      category: "title",
      issue: "Title too long",
      details: `${result.title.length} chars (>${thresholds.titleMax}).`,
    });
  } else if (result.title.length < thresholds.titleMin) {
    push({
      type: "warning",
      category: "title",
      issue: "Title too short",
      details: `${result.title.length} chars (<${thresholds.titleMin}).`,
    });
  }

  // 5.2 Meta description
  if (!result.metaDescription) {
    push({
      type: "error",
      category: "meta_description",
      issue: "Missing meta description",
      details: "No <meta name=\"description\"> tag.",
    });
  } else if (result.metaDescription.length > thresholds.metaDescMax) {
    push({
      type: "warning",
      category: "meta_description",
      issue: "Meta description too long",
      details: `${result.metaDescription.length} chars (>${thresholds.metaDescMax}).`,
    });
  } else if (result.metaDescription.length < thresholds.metaDescMin) {
    push({
      type: "warning",
      category: "meta_description",
      issue: "Meta description too short",
      details: `${result.metaDescription.length} chars (<${thresholds.metaDescMin}).`,
    });
  }

  // 5.3 Headings
  if (result.h1.length === 0) {
    push({ type: "error", category: "headings", issue: "Missing H1", details: "No <h1> tag on page." });
  } else if (result.h1.length > 1) {
    push({
      type: "warning",
      category: "headings",
      issue: "Multiple H1 tags",
      details: `Found ${result.h1.length} H1 tags.`,
    });
  }

  // 5.4 Content
  if (result.wordCount < thresholds.minWordCount) {
    push({
      type: "warning",
      category: "content",
      issue: "Thin content",
      details: `${result.wordCount} words (<${thresholds.minWordCount}).`,
    });
  }

  // 5.5 Technical — canonical
  if (!result.canonical) {
    push({
      type: "warning",
      category: "technical",
      issue: "Missing canonical",
      details: "No <link rel=\"canonical\"> tag.",
    });
  } else if (result.canonical !== result.url && result.canonical !== stripTrailingSlash(result.url)) {
    push({
      type: "warning",
      category: "technical",
      issue: "Canonical mismatch",
      details: `Canonical "${result.canonical}" differs from current URL.`,
    });
  }

  // 5.6 Mobile — viewport
  if (!result.metaTags["viewport"]) {
    push({
      type: "error",
      category: "mobile",
      issue: "Missing viewport",
      details: "No <meta name=\"viewport\"> tag.",
    });
  }

  // 5.7 Accessibility
  if (!result.lang) {
    push({
      type: "warning",
      category: "accessibility",
      issue: "Missing html lang",
      details: "No <html lang> attribute.",
    });
  }
  const imgsWithoutAlt = result.images.filter((img) => img.alt === null || img.alt.trim() === "").length;
  if (imgsWithoutAlt > 0) {
    push({
      type: "warning",
      category: "accessibility",
      issue: "Images missing alt",
      details: `${imgsWithoutAlt} image(s) without alt text.`,
    });
  }

  // 5.8 Social
  if (Object.keys(result.ogTags).length === 0) {
    push({
      type: "warning",
      category: "social",
      issue: "Missing OpenGraph tags",
      details: "No og:* meta tags.",
    });
  }
  if (Object.keys(result.twitterTags).length === 0) {
    push({
      type: "warning",
      category: "social",
      issue: "Missing Twitter Card tags",
      details: "No twitter:* meta tags.",
    });
  }

  // 5.9 Structured data
  if (result.jsonLd.length === 0 && result.microdata.length === 0) {
    push({
      type: "error",
      category: "structured_data",
      issue: "No structured data",
      details: "Neither JSON-LD nor microdata found.",
    });
  }

  // 5.10 Performance
  if (result.responseTimeMs > thresholds.responseTimeErrorMs) {
    push({
      type: "error",
      category: "performance",
      issue: "Very slow response",
      details: `${result.responseTimeMs} ms (>${thresholds.responseTimeErrorMs}).`,
    });
  } else if (result.responseTimeMs > thresholds.responseTimeWarnMs) {
    push({
      type: "warning",
      category: "performance",
      issue: "Slow response",
      details: `${result.responseTimeMs} ms (>${thresholds.responseTimeWarnMs}).`,
    });
  }
  if (result.size > thresholds.pageSizeErrorBytes) {
    push({
      type: "error",
      category: "performance",
      issue: "Very large page",
      details: `${(result.size / 1024 / 1024).toFixed(2)} MB.`,
    });
  } else if (result.size > thresholds.pageSizeWarnBytes) {
    push({
      type: "warning",
      category: "performance",
      issue: "Large page",
      details: `${(result.size / 1024 / 1024).toFixed(2)} MB.`,
    });
  }

  // 5.11 Indexability
  const robots = (result.robots ?? "").toLowerCase();
  if (robots.includes("noindex")) {
    push({
      type: "error",
      category: "indexability",
      issue: "noindex directive",
      details: "Robots meta tag contains noindex.",
    });
  }
  if (robots.includes("nofollow")) {
    push({
      type: "error",
      category: "indexability",
      issue: "nofollow directive",
      details: "Robots meta tag contains nofollow.",
    });
  }

  return issues;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
