import * as vscode from "vscode";
import { ReactWebviewProvider } from "./WebviewProvider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("react-starter.openReactView", () => {
      ReactWebviewProvider.createOrShow(context.extensionUri);
    })
  );

  // const disposable = vscode.commands.registerCommand(
  //   "react-starter.helloWorld",
  //   () => {
  //     vscode.window.showInformationMessage("Hello World from react-starter!");
  //   }
  // );
  //
  // context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
