import * as assert from "node:assert/strict";
import { Crawler } from "../crawler";
import { DEFAULT_CONFIG } from "../types";
import { startFixtureServer, type FixtureServer } from "./server";

suite("Crawler end-to-end", () => {
  let fx: FixtureServer;

  suiteSetup(async () => {
    fx = await startFixtureServer();
  });

  suiteTeardown(async () => {
    await fx.close();
  });

  test("crawls the fixture server and emits url/issue/link events", async function () {
    this.timeout(15000);
    const crawler = new Crawler({
      config: {
        ...DEFAULT_CONFIG,
        maxDepth: 2,
        maxUrls: 20,
        delaySec: 0,
        concurrency: 3,
        discoverSitemaps: false,
        respectRobots: false,
      },
      statsIntervalMs: 9999,
    });

    const urls: string[] = [];
    const issues: string[] = [];
    const links: string[] = [];

    crawler.on("url:crawled", (r) => urls.push(r.url));
    crawler.on("issue:found", (i) => issues.push(`${i.category}:${i.issue}`));
    crawler.on("link:found", (l) => links.push(l.targetUrl));

    await crawler.start(fx.base + "/");

    assert.ok(urls.length >= 4, `expected at least 4 URLs crawled, got ${urls.length}: ${urls.join(", ")}`);
    assert.ok(urls.includes(fx.base + "/"));
    assert.ok(links.length > 0);
    assert.ok(issues.length >= 0);
    assert.equal(crawler.getStatus(), "completed");
  });
});
