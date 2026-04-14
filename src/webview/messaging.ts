import { vscode } from "./vscodeApi";
import type { HostToWebview, WebviewToHost } from "../types/messages";

export type WebviewHandler = (msg: HostToWebview) => void;

export function send(msg: WebviewToHost): void {
  vscode.postMessage(msg);
}

export function onMessage(handler: WebviewHandler): () => void {
  const listener = (event: MessageEvent) => {
    const raw = event.data;
    if (!raw || typeof raw !== "object" || !("type" in raw)) {
      return;
    }
    handler(raw as HostToWebview);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
