import type { NextConfig } from "next";
import path from "node:path";

/**
 * TokenTrim ships from a single codebase in two flavours:
 *
 *  1. Web app  - `pnpm dev` / `pnpm build` / `pnpm start`
 *                Standard Next.js server, API routes (SQLite persistence) included.
 *
 *  2. Desktop  - `pnpm tauri:dev` / `pnpm tauri:build`
 *                The same UI is statically exported to `out/` and served from the
 *                Tauri webview. API routes cannot be statically exported, so
 *                scripts/next-build-tauri.mjs sets them aside for the duration of
 *                the export build; the app falls back to local storage there.
 */
const isDesktopBuild = process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next otherwise infers the workspace root from any lockfile it finds in a
  // parent folder, which breaks build tracing (ENOENT on .nft.json files).
  outputFileTracingRoot: path.join(__dirname),
  ...(isDesktopBuild
    ? {
        // Static bundle consumed by src-tauri/tauri.conf.json -> build.frontendDist
        output: "export",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
