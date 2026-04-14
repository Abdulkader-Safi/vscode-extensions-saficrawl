import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class ReactWebviewProvider {
  public static currentPanel: ReactWebviewProvider | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri
  ) {
    this._panel = panel;

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (data) => {
        switch (data.type) {
          case "showNotification":
            vscode.window.showInformationMessage(data.message);
            break;
          case "getDirectoryContents":
            this._handleGetDirectoryContents();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ReactWebviewProvider.currentPanel) {
      ReactWebviewProvider.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "reactView",
      "React App",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
        retainContextWhenHidden: true,
      }
    );

    ReactWebviewProvider.currentPanel = new ReactWebviewProvider(
      panel,
      extensionUri
    );
  }

  public dispose() {
    ReactWebviewProvider.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _handleGetDirectoryContents() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this._panel.webview.postMessage({
        type: "directoryContents",
        data: { error: "No workspace folder open" },
      });
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    try {
      const items = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(workspaceRoot)
      );
      const contents = items.map(([name, type]) => ({
        name,
        type: type === vscode.FileType.Directory ? "directory" : "file",
      }));

      this._panel.webview.postMessage({
        type: "directoryContents",
        data: { contents, path: workspaceRoot },
      });
    } catch (error) {
      this._panel.webview.postMessage({
        type: "directoryContents",
        data: { error: "Failed to read directory" },
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>React Starter</title>
				<style>
					body { margin: 0; padding: 0; }
					#root { width: 100%; height: 100vh; }
				</style>
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
				// <script nonce="${nonce}">
        // console.log('Webview HTML loaded');
        // console.log('Root element:', document.getElementById('root'));
        // console.log('Script URI:', '${scriptUri}');
        // console.log('Style URI:', '${styleUri}');
				// </script>
			</body>
			</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
