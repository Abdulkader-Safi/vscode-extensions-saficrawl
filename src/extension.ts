import * as vscode from "vscode";
import { SafiCrawlPanel } from "./WebviewProvider";
import { StatusBar } from "./ui/statusBar";
import { SavedCrawlsProvider } from "./ui/sidebar";
import type { WebviewToHost } from "./types/messages";

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBar();
  const sidebar = new SavedCrawlsProvider();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("saficrawl.sidebar", sidebar)
  );

  const handleWebviewMessage = async (msg: WebviewToHost): Promise<void> => {
    switch (msg.type) {
      case "ready":
        pushEnvironment();
        pushSettings();
        break;
      case "settings:get":
        pushSettings();
        break;
      case "settings:update":
        await updateSettings(msg.patch);
        break;
      case "notify":
        notify(msg.level, msg.message);
        break;
      case "crawl:start":
      case "crawl:stop":
      case "crawl:pauseResume":
      case "crawl:load":
      case "crawl:resume":
      case "crawl:archive":
      case "crawl:delete":
      case "export":
      case "saved:refresh":
      case "installBrowsers":
        // Wired to controller in M2.
        vscode.window.showInformationMessage(`SafiCrawl: "${msg.type}" will be wired in M2.`);
        break;
    }
  };

  const openPanel = () => SafiCrawlPanel.createOrShow(context.extensionUri, handleWebviewMessage);

  const pushEnvironment = () => {
    SafiCrawlPanel.current?.bus.post({
      type: "environment",
      isWebVsCode: vscode.env.uiKind === vscode.UIKind.Web,
      playwrightInstalled: context.globalState.get<boolean>("playwright.installed", false),
    });
  };

  const pushSettings = () => {
    const cfg = vscode.workspace.getConfiguration("SafiCrawl");
    SafiCrawlPanel.current?.bus.post({
      type: "settings:loaded",
      settings: configToPlain(cfg),
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("SafiCrawl.dashboard", () => openPanel()),
    vscode.commands.registerCommand("SafiCrawl.start", async () => {
      const url = await vscode.window.showInputBox({
        prompt: "Enter a URL to crawl",
        placeHolder: "https://example.com",
        validateInput: (v) => (isValidUrl(v) ? undefined : "Enter a valid http(s) URL"),
      });
      if (!url) {return;}
      openPanel();
      SafiCrawlPanel.current?.bus.post({ type: "crawl:started", baseUrl: url, crawlId: null });
      vscode.window.showInformationMessage(`SafiCrawl: Start Crawl wired in M2. (${url})`);
    }),
    vscode.commands.registerCommand("SafiCrawl.stop", () => notify("info", "Stop: wired in M2.")),
    vscode.commands.registerCommand("SafiCrawl.pauseResume", () => notify("info", "Pause/Resume: wired in M2.")),
    vscode.commands.registerCommand("SafiCrawl.export", () => notify("info", "Export: wired in M6.")),
    vscode.commands.registerCommand("SafiCrawl.load", () => notify("info", "Load: wired in M5.")),
    vscode.commands.registerCommand("SafiCrawl.settings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:abdulkadersafi.saficrawl")
    ),
    vscode.commands.registerCommand("SafiCrawl.installBrowsers", () =>
      notify("info", "Install Playwright Browsers: wired in M4.")
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("SafiCrawl")) {pushSettings();}
    })
  );
}

export function deactivate(): void {}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function notify(level: "info" | "warn" | "error", message: string): void {
  const prefix = "SafiCrawl: ";
  if (level === "error") {vscode.window.showErrorMessage(prefix + message);}
  else if (level === "warn") {vscode.window.showWarningMessage(prefix + message);}
  else {vscode.window.showInformationMessage(prefix + message);}
}

async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("SafiCrawl");
  for (const [key, value] of Object.entries(patch)) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

function configToPlain(cfg: vscode.WorkspaceConfiguration): Record<string, unknown> {
  // Snapshot all SafiCrawl.* keys by walking inspect() for each contributed key. Cheap enough for M0.
  const keys = [
    "crawler.maxDepth", "crawler.maxUrls", "crawler.delay", "crawler.concurrency",
    "crawler.followRedirects", "crawler.includeExternal", "crawler.discoverSitemaps",
    "requests.userAgent", "requests.timeout", "requests.retries", "requests.respectRobots",
    "requests.acceptLanguage",
    "javascript.enabled", "javascript.browser", "javascript.viewportWidth",
    "javascript.viewportHeight", "javascript.concurrency", "javascript.waitTime",
    "javascript.timeout",
    "filters.includeExtensions", "filters.excludeExtensions", "filters.urlRegex",
    "filters.maxFileSizeMB",
    "pagespeed.enabled", "pagespeed.urlLimit", "pagespeed.strategy",
    "advanced.proxy", "advanced.customHeaders", "advanced.logLevel",
    "diagnostics.enabled", "telemetry.enabled",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {out[k] = cfg.get(k);}
  return out;
}
