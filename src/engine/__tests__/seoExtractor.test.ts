import * as assert from "node:assert/strict";
import { parsePage } from "../seoExtractor";
import { FULL_SEO_PAGE } from "./fixtures";

suite("seoExtractor", () => {
  test("extracts core SEO fields from a full page", () => {
    const r = parsePage({
      url: "http://localhost/",
      depth: 0,
      finalUrl: "http://localhost/",
      statusCode: 200,
      contentType: "text/html",
      size: FULL_SEO_PAGE.length,
      responseTimeMs: 12,
      redirectChain: [],
      headers: { "content-type": "text/html; charset=utf-8" },
      html: FULL_SEO_PAGE,
    });

    assert.equal(r.title, "SafiCrawl Test Page with Enough Length");
    assert.ok(r.metaDescription && r.metaDescription.length > 50);
    assert.equal(r.lang, "en");
    assert.equal(r.charset, "utf-8");
    assert.equal(r.canonical, "http://localhost/self");
    assert.equal(r.robots, "index,follow");
    assert.deepEqual(r.h1, ["Welcome to SafiCrawl"]);
    assert.equal(r.ogTags["title"], "OG Title");
    assert.equal(r.twitterTags["card"], "summary_large_image");
    assert.equal(r.hreflang.length, 1);
    assert.equal(r.jsonLd.length, 1);
    assert.ok(r.wordCount >= 300, `expected >=300 words, got ${r.wordCount}`);
    assert.ok(r.images.length >= 2);
    assert.equal(r.internalLinkCount, 3);
    assert.equal(r.externalLinkCount, 1);
  });
});
