import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, getTheme } from "./lib/theme";

applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
