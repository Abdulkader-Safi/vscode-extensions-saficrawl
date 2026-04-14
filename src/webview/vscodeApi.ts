// Acquire the VS Code API once and export it
declare const acquireVsCodeApi: () => {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

// Call acquireVsCodeApi only once and export the instance
export const vscode = acquireVsCodeApi();
