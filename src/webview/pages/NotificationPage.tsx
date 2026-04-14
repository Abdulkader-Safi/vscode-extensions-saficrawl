import React, { useState } from "react";
import { vscode } from "../vscodeApi";

const NotificationPage: React.FC = () => {
  const [message, setMessage] = useState("Hello from React!");

  const handleSendNotification = () => {
    vscode.postMessage({
      type: "showNotification",
      message: message,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="mb-6 text-3xl font-bold">Send Notification</h1>

      <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        <div className="mb-4">
          <label htmlFor="message" className="block mb-2 text-sm font-medium">
            Notification Message
          </label>
          <input
            id="message"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your message..."
          />
        </div>

        <button
          onClick={handleSendNotification}
          className="w-full px-4 py-2 font-medium text-white transition-colors duration-200 bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          Send Notification
        </button>

        <div className="p-4 mt-6 bg-gray-700 rounded-md">
          <h3 className="mb-2 text-sm font-medium">How it works:</h3>
          <p className="text-sm text-gray-300">
            This button sends a message to the VSCode extension, which then
            displays a notification using{" "}
            <code className="px-1 py-0.5 bg-gray-600 rounded text-xs">
              vscode.window.showInformationMessage()
            </code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotificationPage;
