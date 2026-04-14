import * as vscode from "vscode";
import type { SavedCrawl } from "../types/messages";

export class SavedCrawlItem extends vscode.TreeItem {
  constructor(public readonly crawl: SavedCrawl) {
    super(crawl.baseUrl, vscode.TreeItemCollapsibleState.None);
    this.description = `${crawl.urlCount} URLs \u2022 ${crawl.status}`;
    this.tooltip = `${crawl.baseUrl}\nStarted ${crawl.startedAt}`;
    this.contextValue = crawl.canResume ? "saficrawl.saved.resumable" : "saficrawl.saved";
    this.iconPath = new vscode.ThemeIcon(statusIcon(crawl.status));
  }
}

function statusIcon(status: SavedCrawl["status"]): string {
  switch (status) {
    case "running": return "sync";
    case "paused": return "debug-pause";
    case "completed": return "check";
    case "error": return "error";
    default: return "globe";
  }
}

export class SavedCrawlsProvider implements vscode.TreeDataProvider<SavedCrawlItem> {
  private _onDidChange = new vscode.EventEmitter<SavedCrawlItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private crawls: SavedCrawl[] = [];

  setCrawls(crawls: SavedCrawl[]): void {
    this.crawls = crawls;
    this._onDidChange.fire();
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: SavedCrawlItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SavedCrawlItem[] {
    return this.crawls.map((c) => new SavedCrawlItem(c));
  }
}
