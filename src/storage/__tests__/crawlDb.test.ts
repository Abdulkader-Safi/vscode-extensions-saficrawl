import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CrawlDb } from "../crawlDb";
import { DEFAULT_CONFIG } from "../../engine/types";
import type { IssueRow, LinkRow, UrlRow } from "../../types/messages";
import type { CwvRow } from "../../pagespeed/types";

suite("CrawlDb round-trip", () => {
  let tmpDir = "";
  let db: CrawlDb | null = null;

  setup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "saficrawl-test-"));
    db = await CrawlDb.open(path.join(tmpDir, "crawl.sqlite"));
  });

  teardown(() => {
    db?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("persists and reloads a synthetic crawl", () => {
    const id = db!.createCrawl("http://example.com/", DEFAULT_CONFIG);
    assert.ok(id > 0);

    const urls: UrlRow[] = [
      {
        url: "http://example.com/",
        statusCode: 200,
        title: "Home",
        wordCount: 350,
        loadTimeMs: 120,
        issueCount: 2,
        depth: 0,
        internal: true,
      },
      {
        url: "http://example.com/about",
        statusCode: 200,
        title: "About",
        wordCount: 500,
        loadTimeMs: 140,
        issueCount: 0,
        depth: 1,
        internal: true,
      },
    ];
    const links: LinkRow[] = [
      {
        sourceUrl: "http://example.com/",
        targetUrl: "http://example.com/about",
        anchorText: "About",
        isInternal: true,
        targetDomain: "example.com",
        targetStatus: 200,
        placement: "navigation",
      },
    ];
    const issues: IssueRow[] = [
      {
        url: "http://example.com/",
        type: "warning",
        category: "title",
        issue: "Title too short",
        details: "18 chars",
      },
      {
        url: "http://example.com/",
        type: "error",
        category: "meta_description",
        issue: "Missing meta description",
        details: "No tag",
      },
    ];
    const pagespeed: CwvRow[] = [
      {
        url: "http://example.com/",
        strategy: "mobile",
        performance: 0.92,
        lcpMs: 2300,
        clsScore: 0.05,
        fcpMs: 1200,
        inpMs: 180,
        ttfbMs: 400,
        tbtMs: 60,
        error: null,
      },
    ];

    db!.saveUrls(id, urls);
    db!.saveLinks(id, links);
    db!.saveIssues(id, issues);
    db!.savePageSpeed(id, pagespeed);
    db!.saveQueue(id, [["http://example.com/deferred", 2]]);
    db!.saveCheckpoint(id, {
      visited: urls.map((u) => u.url),
      queue: [["http://example.com/deferred", 2]],
    });
    db!.setStatus(id, "completed", false);

    const list = db!.listCrawls();
    assert.equal(list.length, 1);
    assert.equal(list[0].baseUrl, "http://example.com/");
    assert.equal(list[0].urlCount, 2);
    assert.equal(list[0].linkCount, 1);
    assert.equal(list[0].issueCount, 2);
    assert.equal(list[0].pagespeedCount, 1);
    assert.equal(list[0].status, "completed");

    const loaded = db!.loadCrawl(id);
    assert.ok(loaded);
    assert.equal(loaded!.urls.length, 2);
    assert.equal(loaded!.urls[0].title, "Home");
    assert.equal(loaded!.links.length, 1);
    assert.equal(loaded!.links[0].placement, "navigation");
    assert.equal(loaded!.issues.length, 2);
    assert.equal(loaded!.pagespeed.length, 1);
    assert.equal(loaded!.pagespeed[0].performance, 0.92);
    assert.deepEqual(loaded!.checkpoint?.queue, [
      ["http://example.com/deferred", 2],
    ]);

    const resumeQueue = db!.getResumeQueue(id);
    assert.equal(resumeQueue.length, 1);
    assert.equal(resumeQueue[0][0], "http://example.com/deferred");
  });

  test("archive hides from default list; delete cascades", () => {
    const id = db!.createCrawl("http://a.test/", DEFAULT_CONFIG);
    db!.saveUrls(id, [
      {
        url: "http://a.test/",
        statusCode: 200,
        title: null,
        wordCount: null,
        loadTimeMs: 50,
        issueCount: 0,
        depth: 0,
        internal: true,
      },
    ]);

    db!.archiveCrawl(id);
    assert.equal(db!.listCrawls(false).length, 0);
    assert.equal(db!.listCrawls(true).length, 1);

    db!.deleteCrawl(id);
    assert.equal(db!.listCrawls(true).length, 0);
    assert.equal(db!.getVisitedUrls(id).length, 0);
  });

  test("recoverInterrupted flips orphan running rows to interrupted", () => {
    const id = db!.createCrawl("http://b.test/", DEFAULT_CONFIG);
    const ids = db!.recoverInterrupted();
    assert.deepEqual(ids, [id]);
    const after = db!.getCrawl(id);
    assert.equal(after?.status, "interrupted");
    assert.equal(after?.canResume, true);
  });
});
