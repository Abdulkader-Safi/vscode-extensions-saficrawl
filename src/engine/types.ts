export type Placement = "navigation" | "body" | "footer";
export type IssueType = "error" | "warning" | "info";

export type IssueCategory =
  | "title"
  | "meta_description"
  | "headings"
  | "content"
  | "technical"
  | "mobile"
  | "accessibility"
  | "social"
  | "structured_data"
  | "performance"
  | "indexability"
  | "duplication";

export interface CrawlerConfig {
  maxDepth: number;
  maxUrls: number;
  delaySec: number;
  concurrency: number;
  followRedirects: boolean;
  includeExternal: boolean;
  discoverSitemaps: boolean;
  userAgent: string;
  timeoutSec: number;
  retries: number;
  respectRobots: boolean;
  acceptLanguage: string;
  includeExtensions: string[];
  excludeExtensions: string[];
  urlRegex: string;
  maxFileSizeMB: number;
  proxy: string;
  customHeaders: Record<string, string>;
  excludePatterns: string[];
}

export const DEFAULT_CONFIG: CrawlerConfig = {
  maxDepth: 3,
  maxUrls: 5000,
  delaySec: 1,
  concurrency: 5,
  followRedirects: true,
  includeExternal: false,
  discoverSitemaps: true,
  userAgent: "SafiCrawl/0.1 (+compatible; SEO-audit)",
  timeoutSec: 10,
  retries: 3,
  respectRobots: true,
  acceptLanguage: "en-US,en;q=0.9",
  includeExtensions: [],
  excludeExtensions: [".pdf", ".zip", ".mp4", ".jpg", ".png", ".gif", ".svg", ".css", ".js"],
  urlRegex: "",
  maxFileSizeMB: 10,
  proxy: "",
  customHeaders: {},
  excludePatterns: [],
};

export interface Link {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  isInternal: boolean;
  targetDomain: string;
  placement: Placement;
  rel: string | null;
}

export interface Issue {
  url: string;
  type: IssueType;
  category: IssueCategory;
  issue: string;
  details: string;
}

export interface ImageInfo {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
}

export interface CrawlResult {
  url: string;
  depth: number;
  statusCode: number | null;
  contentType: string | null;
  size: number;
  responseTimeMs: number;
  redirectChain: string[];
  error: string | null;

  title: string | null;
  metaDescription: string | null;
  metaTags: Record<string, string>;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  charset: string | null;

  h1: string[];
  h2: string[];
  h3: string[];
  wordCount: number;

  jsonLd: unknown[];
  microdata: unknown[];

  analytics: string[];
  hreflang: { hreflang: string; href: string }[];
  images: ImageInfo[];

  internalLinkCount: number;
  externalLinkCount: number;

  javascriptRendered: boolean;
  linkedFrom: string[];
}

export interface CrawlStatsSnapshot {
  crawled: number;
  queued: number;
  maxUrls: number;
  urlsPerSec: number;
  elapsedMs: number;
  errors: number;
  status: "idle" | "running" | "paused" | "stopping" | "completed" | "error";
}
