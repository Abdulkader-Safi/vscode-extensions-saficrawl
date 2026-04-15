import * as vscode from "vscode";
import type { CrawlDb, StoredCrawl } from "../storage/crawlDb";

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

export class SavedCrawlsProvider implements vscode.TreeDataProvider<SavedCrawlItem> {
  private _onDidChange = new vscode.EventEmitter<
    SavedCrawlItem | undefined | void
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

  getTreeItem(element: SavedCrawlItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SavedCrawlItem[] {
    if (!this.db) {
      return [];
    }
    return this.db
      .listCrawls(this.showArchived)
      .map((c) => new SavedCrawlItem(c));
  }
}
