import * as vscode from "vscode";
import type { CrawlStats } from "../types/messages";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "SafiCrawl.dashboard";
    this.setIdle();
    this.item.show();
  }

  setIdle(): void {
    this.item.text = "$(globe) SafiCrawl";
    this.item.tooltip = "Open SafiCrawl dashboard";
  }

  update(stats: CrawlStats): void {
    const rate = stats.urlsPerSec.toFixed(1);
    switch (stats.status) {
      case "running":
        this.item.text = `$(sync~spin) Crawling ${stats.crawled}/${stats.maxUrls} \u2022 ${rate} URLs/s`;
        break;
      case "paused":
        this.item.text = `$(debug-pause) Paused ${stats.crawled}/${stats.maxUrls}`;
        break;
      case "stopping":
        this.item.text = `$(debug-stop) Stopping\u2026 (${stats.crawled})`;
        break;
      case "completed":
        this.item.text = `$(check) Crawl done \u2022 ${stats.crawled} URLs`;
        break;
      case "error":
        this.item.text = `$(error) Crawl error`;
        break;
      default:
        this.setIdle();
        return;
    }
    this.item.tooltip = `SafiCrawl \u2014 ${stats.status}`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
