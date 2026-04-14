import * as assert from "node:assert/strict";
import { extractLinks } from "../linkManager";

const HTML = `
<html><body>
  <nav><a href="/home">Home</a></nav>
  <main><a href="https://other.example.com/x">External</a><a href="/doc?q=1">Docs</a></main>
  <footer><a href="/privacy" rel="nofollow">Privacy</a></footer>
</body></html>`;

suite("linkManager", () => {
  test("extracts and classifies links with placement and rel", () => {
    const links = extractLinks(HTML, "http://example.com/page", "example.com");
    assert.equal(links.length, 4);

    const nav = links.find((l) => l.targetUrl === "http://example.com/home");
    assert.equal(nav?.placement, "navigation");
    assert.equal(nav?.isInternal, true);

    const ext = links.find((l) => l.targetUrl.startsWith("https://other.example.com"));
    assert.equal(ext?.isInternal, false);
    assert.equal(ext?.placement, "body");

    const footer = links.find((l) => l.targetUrl === "http://example.com/privacy");
    assert.equal(footer?.placement, "footer");
    assert.equal(footer?.rel, "nofollow");

    const docs = links.find((l) => l.targetUrl === "http://example.com/doc?q=1");
    assert.equal(docs?.placement, "body");
  });
});
