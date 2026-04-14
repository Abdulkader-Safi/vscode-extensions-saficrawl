import * as vscode from "vscode";
import { HostBus, type HostHandler } from "./messaging/bus";

export class SafiCrawlPanel {
  public static current: SafiCrawlPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  public readonly bus: HostBus;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.bus = new HostBus(this.panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri, onMessage: HostHandler): SafiCrawlPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SafiCrawlPanel.current) {
      SafiCrawlPanel.current.panel.reveal(column);
      return SafiCrawlPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      "saficrawl.panel",
      "SafiCrawl",
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
        retainContextWhenHidden: true,
      }
    );

    const instance = new SafiCrawlPanel(panel, extensionUri);
    instance.disposables.push(instance.bus.onMessage(onMessage));
    SafiCrawlPanel.current = instance;
    return instance;
  }

  public reveal(): void {
    this.panel.reveal();
  }

  public dispose(): void {
    SafiCrawlPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    const nonce = randomNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data: https:; connect-src 'none';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>SafiCrawl</title>
    <style>
      body { margin: 0; padding: 0; }
      #root { width: 100%; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {out += chars.charAt(Math.floor(Math.random() * chars.length));}
  return out;
}
