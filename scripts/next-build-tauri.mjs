#!/usr/bin/env node
/**
 * Desktop (Tauri) build step -- `pnpm build:desktop` / `pnpm tauri:build`.
 *
 * Route handlers (app/api/**\/route.ts) need a Node server and cannot be
 * statically exported, so this script temporarily renames them while
 * `next build` runs with TAURI_BUILD=1 (next.config.ts switches to
 * `output: "export"`). The static bundle lands in `out/`; the desktop app keeps
 * its history in localStorage instead (see lib/persistence.ts).
 *
 * Route handlers are restored afterwards even when the build fails, so the web
 * app in the same checkout is never affected.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Scan the whole app/ tree, not just app/api: dynamic route handlers such as
// app/auth/callback also cannot be statically exported.
const appRoot = path.join(projectRoot, "app");
const STASH_SUFFIX = ".desktop-build-stash";

function collectRouteFiles(dir, hits = []) {
  if (!fs.existsSync(dir)) return hits;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRouteFiles(full, hits);
    else if (entry.isFile() && entry.name === "route.ts") hits.push(full);
  }
  return hits;
}

const routeFiles = collectRouteFiles(appRoot);

function restoreRouteHandlers() {
  let restored = 0;
  for (const file of routeFiles) {
    const stashed = `${file}${STASH_SUFFIX}`;
    if (fs.existsSync(stashed)) {
      fs.renameSync(stashed, file);
      restored += 1;
    }
  }
  return restored;
}

function disableRouteHandlers() {
  let disabled = 0;
  for (const file of routeFiles) {
    if (fs.existsSync(file)) {
      fs.renameSync(file, `${file}${STASH_SUFFIX}`);
      disabled += 1;
    }
  }
  return disabled;
}

// Recover first (in case a previous run was interrupted), then disable.
restoreRouteHandlers();
const disabledCount = disableRouteHandlers();
if (disabledCount > 0) {
  console.log(
    `[build:desktop] ${disabledCount} route handler(s) disabled for the export build (web-only feature)`
  );
}

try {
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, TAURI_BUILD: "1" },
  });
  process.exitCode = result.status ?? 1;
} finally {
  const restored = restoreRouteHandlers();
  console.log(`[build:desktop] ${restored} route handler(s) restored`);
}
