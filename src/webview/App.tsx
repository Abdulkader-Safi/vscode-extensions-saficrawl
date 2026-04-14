import React from "react";
import { AppShell } from "./components/AppShell";
import { useMessageBridge } from "./store";

const App: React.FC = () => {
  useMessageBridge();
  return <AppShell />;
};

export default App;
