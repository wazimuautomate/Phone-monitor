import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, getThemeMode } from "./lib/theme";

// Apply the saved theme before the first paint so there's no light/dark flash.
applyTheme(getThemeMode());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
