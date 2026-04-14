import type { Webview } from "vscode";
import type { HostToWebview, WebviewToHost } from "../types/messages";

export type HostHandler = (msg: WebviewToHost) => void | Promise<void>;

export class HostBus {
  constructor(private readonly webview: Webview) {}

  post(msg: HostToWebview): void {
    void this.webview.postMessage(msg);
  }

  onMessage(handler: HostHandler) {
    return this.webview.onDidReceiveMessage((raw: unknown) => {
      if (!raw || typeof raw !== "object" || !("type" in raw)) {
        return;
      }
      void handler(raw as WebviewToHost);
    });
  }
}
