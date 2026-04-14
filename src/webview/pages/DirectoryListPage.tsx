import React, { useState, useEffect } from "react";
import { vscode } from "../vscodeApi";

interface DirectoryItem {
  name: string;
  type: "file" | "directory";
}

interface DirectoryData {
  contents?: DirectoryItem[];
  path?: string;
  error?: string;
}

const DirectoryListPage: React.FC = () => {
  const [directoryData, setDirectoryData] = useState<DirectoryData | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    handleLoadDirectory();
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "directoryContents") {
        setDirectoryData(message.data);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleLoadDirectory = () => {
    setLoading(true);
    vscode.postMessage({
      type: "getDirectoryContents",
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="mb-6 text-3xl font-bold">Directory Contents</h1>

      <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        {/* <button
          onClick={handleLoadDirectory}
          disabled={loading}
          className="w-full px-4 py-2 font-medium text-white transition-colors duration-200 bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          {loading ? "Loading..." : "Load Current Directory"}
        </button> */}

        {directoryData && (
          <div className="">
            {directoryData.error ? (
              <div className="p-4 border border-red-700 rounded-md bg-red-900/30">
                <p className="text-red-400">{directoryData.error}</p>
              </div>
            ) : (
              <>
                {directoryData.path && (
                  <div className="p-3 mb-4 bg-gray-700 rounded-md">
                    <p className="text-sm text-gray-300">
                      <span className="font-medium">Path:</span>{" "}
                      <code className="text-blue-400">
                        {directoryData.path}
                      </code>
                    </p>
                  </div>
                )}

                {directoryData.contents && directoryData.contents.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="mb-3 text-lg font-medium">
                      Items ({directoryData.contents.length})
                    </h3>
                    <div className="overflow-hidden bg-gray-700 rounded-md">
                      {directoryData.contents.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center px-4 py-3 transition-colors border-b border-gray-600 last:border-b-0 hover:bg-gray-600"
                        >
                          <span className="mr-3 text-xl">
                            {item.type === "directory" ? "📁" : "📄"}
                          </span>
                          <span className="flex-1 font-medium">
                            {item.name}
                          </span>
                          <span className="text-xs text-gray-400 uppercase">
                            {item.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-700 rounded-md">
                    <p className="text-gray-400">Directory is empty</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* {!directoryData && !loading && (
          <div className="p-4 mt-6 bg-gray-700 rounded-md">
            <h3 className="mb-2 text-sm font-medium">How it works:</h3>
            <p className="text-sm text-gray-300">
              Click the button above to request the current workspace directory
              contents from the VSCode extension. The extension will read the
              directory and send the results back to this webview.
            </p>
          </div>
        )} */}
      </div>
    </div>
  );
};

export default DirectoryListPage;
