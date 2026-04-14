import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { Link, Placement } from "./types";
import { normalizeUrl } from "./urlFilter";

const NAV_RE = /\b(nav|menu|header)\b/i;
const FOOTER_RE = /\bfooter\b/i;

export function extractLinks(html: string, sourceUrl: string, baseDomain: string): Link[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: Link[] = [];

  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = ($a.attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) {return;}

    const targetUrl = normalizeUrl(href, sourceUrl);
    if (!targetUrl) {return;}

    const key = `${sourceUrl}|${targetUrl}`;
    if (seen.has(key)) {return;}
    seen.add(key);

    const targetDomain = hostWithoutWww(targetUrl);
    const isInternal = targetDomain === baseDomain;
    const anchorText = collapseWhitespace($a.text()).slice(0, 100);
    const placement = detectPlacement($, el);
    const rel = $a.attr("rel") ?? null;

    links.push({
      sourceUrl,
      targetUrl,
      anchorText,
      isInternal,
      targetDomain,
      placement,
      rel,
    });
  });

  return links;
}

export class SourcePageIndex {
  private readonly map = new Map<string, Set<string>>();

  add(target: string, source: string): void {
    let set = this.map.get(target);
    if (!set) {
      set = new Set();
      this.map.set(target, set);
    }
    set.add(source);
  }

  sourcesFor(target: string): string[] {
    return [...(this.map.get(target) ?? [])];
  }
}

function detectPlacement($: cheerio.CheerioAPI, el: AnyNode): Placement {
  let node: AnyNode | null = el;
  while (node && "parent" in node && node.parent) {
    const p = node.parent as Element;
    if (p.type === "tag") {
      const tag = (p.name ?? "").toLowerCase();
      const cls = ($(p).attr("class") ?? "") + " " + ($(p).attr("id") ?? "");
      if (tag === "footer" || FOOTER_RE.test(cls)) {return "footer";}
      if (tag === "nav" || tag === "header" || NAV_RE.test(cls)) {return "navigation";}
    }
    node = p;
  }
  return "body";
}

function hostWithoutWww(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
