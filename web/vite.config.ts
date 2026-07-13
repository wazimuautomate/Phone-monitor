import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies the helper so the dashboard talks to it on one origin.
// In production the helper serves the built dashboard directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
      "/health": "http://127.0.0.1:8787",
    },
  },
});
