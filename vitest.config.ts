import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Every suite awaits `loadTokenizer()` in a `beforeAll`, which parses the
    // ~500 KB cl100k_base rank table. That comfortably exceeds Vitest's 10s
    // default on a cold cache (and on a loaded machine), and it surfaces as
    // "Hook timed out" in every file at once rather than as a real
    // assertion failure. The guard suites also run compression over long
    // fixtures, so give per-hook and per-test budgets that fit the workload.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
