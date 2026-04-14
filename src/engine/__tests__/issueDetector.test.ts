import * as assert from "node:assert/strict";
import { detect, DEFAULT_THRESHOLDS } from "../issueDetector";
import type { CrawlResult } from "../types";

function makeResult(overrides: Partial<CrawlResult> = {}): CrawlResult {
  return {
    url: "http://localhost/",
    depth: 0,
    statusCode: 200,
    contentType: "text/html",
    size: 2048,
    responseTimeMs: 100,
    redirectChain: [],
    error: null,
    title: "A perfectly fine page title for SEO purposes",
    metaDescription: "A" + "b".repeat(140),
    metaTags: { viewport: "width=device-width" },
    ogTags: { title: "x" },
    twitterTags: { card: "summary" },
    canonical: "http://localhost/",
    robots: null,
    lang: "en",
    charset: "utf-8",
    h1: ["Heading"],
    h2: [],
    h3: [],
    wordCount: 500,
    jsonLd: [{}],
    microdata: [],
    analytics: [],
    hreflang: [],
    images: [{ src: "/x.jpg", alt: "x", width: null, height: null }],
    internalLinkCount: 0,
    externalLinkCount: 0,
    javascriptRendered: false,
    linkedFrom: [],
    ...overrides,
  };
}

suite("issueDetector", () => {
  test("clean page yields no issues", () => {
    assert.deepEqual(detect(makeResult()), []);
  });

  test("flags missing title and h1", () => {
    const issues = detect(makeResult({ title: null, h1: [] }));
    assert.ok(issues.some((i) => i.category === "title" && i.type === "error"));
    assert.ok(issues.some((i) => i.category === "headings"));
  });

  test("flags 404 with only technical error", () => {
    const issues = detect(makeResult({ statusCode: 404 }));
    assert.equal(issues.length, 1);
    assert.equal(issues[0].category, "technical");
    assert.equal(issues[0].type, "error");
  });

  test("flags noindex", () => {
    const issues = detect(makeResult({ robots: "noindex,follow" }));
    assert.ok(issues.some((i) => i.category === "indexability" && i.issue.includes("noindex")));
  });

  test("flags slow response", () => {
    const issues = detect(makeResult({ responseTimeMs: 3500 }));
    assert.ok(issues.some((i) => i.category === "performance" && i.type === "error"));
  });

  test("thresholds are configurable", () => {
    const issues = detect(makeResult({ wordCount: 100 }), { ...DEFAULT_THRESHOLDS, minWordCount: 50 });
    assert.ok(!issues.some((i) => i.category === "content"));
  });
});
