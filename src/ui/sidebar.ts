import * as vscode from "vscode";
import type { CrawlDb, StoredCrawl } from "../storage/crawlDb";

type SidebarNode = DomainGroupItem | SavedCrawlItem;

/**
 * Normalize a crawl's base URL to a grouping key. `www.x.com` and `x.com`
 * collapse into `x.com`; other subdomains remain distinct. Falls back to
 * the raw string on unparseable input so nothing ever disappears.
 */
export function domainKey(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return baseUrl.toLowerCase();
  }
}

export class DomainGroupItem extends vscode.TreeItem {
  constructor(
    public readonly domain: string,
    public readonly crawls: StoredCrawl[],
  ) {
    super(domain, vscode.TreeItemCollapsibleState.Collapsed);
    const count = crawls.length;
    this.description = `${count} run${count === 1 ? "" : "s"}`;
    this.contextValue = "saficrawl.domaingroup";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.command = {
      command: "SafiCrawl.openDomainHistory",
      title: "Open History",
      arguments: [
        {
          domain,
          crawlIds: crawls.map((c) => c.id),
        },
      ],
    };
    this.tooltip = new vscode.MarkdownString(
      [
        `**${domain}**`,
        `${count} run${count === 1 ? "" : "s"}`,
        `Latest: ${new Date(crawls[0]?.completedAt ?? crawls[0]?.startedAt ?? Date.now()).toLocaleString()}`,
      ].join("\n\n"),
    );
  }
}

export class SavedCrawlItem extends vscode.TreeItem {
  constructor(public readonly crawl: StoredCrawl) {
    super(shortUrl(crawl.baseUrl), vscode.TreeItemCollapsibleState.None);
    const when = new Date(
      crawl.completedAt ?? crawl.startedAt,
    ).toLocaleString();
    this.description = `${crawl.urlCount.toLocaleString()} URLs \u2022 ${crawl.status}`;
    this.tooltip = new vscode.MarkdownString(
      [
        `**${crawl.baseUrl}**`,
        `Status: \`${crawl.status}\``,
        `URLs: ${crawl.urlCount.toLocaleString()} \u2022 Links: ${crawl.linkCount.toLocaleString()} \u2022 Issues: ${crawl.issueCount.toLocaleString()}`,
        `Errors: ${crawl.errorCount} \u2022 PageSpeed: ${crawl.pagespeedCount}`,
        crawl.completedAt ? `Completed: ${when}` : `Started: ${when}`,
        crawl.canResume ? "Resumable" : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    this.contextValue = contextFor(crawl);
    this.iconPath = new vscode.ThemeIcon(statusIcon(crawl.status));
    this.command = {
      command: "SafiCrawl.loadFromTree",
      title: "Load",
      arguments: [crawl.id],
    };
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

function statusIcon(status: StoredCrawl["status"]): string {
  switch (status) {
    case "running":
      return "sync";
    case "paused":
      return "debug-pause";
    case "completed":
      return "check";
    case "error":
      return "error";
    case "interrupted":
      return "warning";
    case "stopping":
      return "stop";
    default:
      return "globe";
  }
}

function contextFor(crawl: StoredCrawl): string {
  const parts = ["saficrawl.saved"];
  if (crawl.canResume) {
    parts.push("resumable");
  }
  if (crawl.archivedAt !== null) {
    parts.push("archived");
  }
  return parts.join(".");
}

export class SavedCrawlsProvider implements vscode.TreeDataProvider<SidebarNode> {
  private _onDidChange = new vscode.EventEmitter<
    SidebarNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private db: CrawlDb | null = null;
  private showArchived = false;

  setDb(db: CrawlDb | null): void {
    this.db = db;
    this._onDidChange.fire();
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  toggleArchived(): void {
    this.showArchived = !this.showArchived;
    this._onDidChange.fire();
  }

  getTreeItem(element: SidebarNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarNode): SidebarNode[] {
    if (!this.db) {
      return [];
    }
    if (element instanceof DomainGroupItem) {
      return element.crawls.map((c) => new SavedCrawlItem(c));
    }
    if (element) {
      return [];
    }
    const crawls = this.db.listCrawls(this.showArchived);
    const groups = new Map<string, StoredCrawl[]>();
    for (const c of crawls) {
      const key = domainKey(c.baseUrl);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(c);
      } else {
        groups.set(key, [c]);
      }
    }
    const out: DomainGroupItem[] = [];
    for (const [domain, bucket] of groups) {
      // listCrawls is already ordered by startedAt DESC, so each bucket is too.
      out.push(new DomainGroupItem(domain, bucket));
    }
    // Keep groups sorted by their most recent run, descending.
    out.sort(
      (a, b) => (b.crawls[0]?.startedAt ?? 0) - (a.crawls[0]?.startedAt ?? 0),
    );
    return out;
  }
}
