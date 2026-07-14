// Prepare the files Electron packages:
//   build/web/**     the built dashboard (copied from web/dist)
//   build/helper.cjs the helper, bundled to a single CommonJS file
//
// Run AFTER `npm run build -w web` and `npm run build -w helper` (this script
// bundles helper/dist/index.js, so the helper must be compiled first).
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, ".."); // desktop/
const repo = path.resolve(root, ".."); // repo root
const webDist = path.join(repo, "web", "dist");
const helperEntry = path.join(repo, "helper", "dist", "index.js");
const outDir = path.join(root, "build");

function fail(msg) {
  console.error(`\n[desktop/build] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(webDist)) fail("web/dist missing — run `npm run build -w web` first.");
if (!existsSync(helperEntry)) fail("helper/dist/index.js missing — run `npm run build -w helper` first.");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1) Copy the built dashboard.
cpSync(webDist, path.join(outDir, "web"), { recursive: true });
console.log("[desktop/build] copied web/dist -> build/web");

// 2) Bundle the helper (+ its deps, e.g. ws) into one CJS file the Electron
//    main process can require(). Native optional deps of ws are marked external;
//    ws falls back gracefully when they are absent.
await build({
  entryPoints: [helperEntry],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: path.join(outDir, "helper.cjs"),
  external: ["electron", "bufferutil", "utf-8-validate"],
  logLevel: "info",
});
console.log("[desktop/build] bundled helper -> build/helper.cjs");
console.log("[desktop/build] assets ready:", outDir);
