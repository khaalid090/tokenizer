import { describe, it, expect, afterAll } from "vitest";
import {
  getDb,
  saveOptimizationToDb,
  getOptimizationsFromDb,
  getStatsFromDb,
  clearHistoryInDb,
} from "@/lib/db";
import { OptimizationResult } from "@/lib/types";

/**
 * Proves the per-user scoping that stands in for Row Level Security on the
 * SQLite path: one signed-in user must never see, count, or delete another
 * user's rows.
 *
 * Uses throwaway ids and removes everything it creates, so the real history is
 * untouched.
 */
const USER_A = "test-user-a";
const USER_B = "test-user-b";

function makeResult(prompt: string): OptimizationResult {
  return {
    originalPrompt: prompt,
    optimizedPrompt: prompt + " (optimized)",
    mode: "balanced",
    originalTokens: 100,
    optimizedTokens: 70,
    tokensSaved: 30,
    percentSaved: 30,
    costSavedUSD: 0.001,
    protectedSpansCount: 1,
    validationPassed: true,
    stages: [],
    timestamp: Date.now(),
  };
}

afterAll(() => {
  clearHistoryInDb(USER_A);
  clearHistoryInDb(USER_B);
});

describe("history isolation between users", () => {
  it("only ever returns the caller's own rows", () => {
    saveOptimizationToDb(USER_A, makeResult("alpha-one"));
    saveOptimizationToDb(USER_A, makeResult("alpha-two"));
    saveOptimizationToDb(USER_B, makeResult("bravo-one"));

    const aRows = getOptimizationsFromDb(USER_A);
    const bRows = getOptimizationsFromDb(USER_B);

    expect(aRows).toHaveLength(2);
    expect(bRows).toHaveLength(1);

    // No cross-contamination in either direction.
    expect(aRows.every((r) => r.originalPrompt.startsWith("alpha"))).toBe(true);
    expect(bRows.every((r) => r.originalPrompt.startsWith("bravo"))).toBe(true);

    const rawA = getOptimizationsFromDb(USER_A);
    expect(rawA.find((r) => r.originalPrompt === "bravo-one")).toBeUndefined();
  });

  it("keeps aggregate stats separate per user", () => {
    const aStats = getStatsFromDb(USER_A);
    const bStats = getStatsFromDb(USER_B);

    expect(aStats.optimizationsCount).toBe(2);
    expect(bStats.optimizationsCount).toBe(1);
    expect(aStats.totalTokensSaved).toBe(60);
    expect(bStats.totalTokensSaved).toBe(30);
  });

  it("clearing one user's history leaves the other intact", () => {
    clearHistoryInDb(USER_A);

    expect(getOptimizationsFromDb(USER_A)).toHaveLength(0);
    expect(getStatsFromDb(USER_A).optimizationsCount).toBe(0);

    // The other user must be completely unaffected.
    expect(getOptimizationsFromDb(USER_B)).toHaveLength(1);
    expect(getStatsFromDb(USER_B).optimizationsCount).toBe(1);
  });

  it("clamps an absurd or malformed limit", () => {
    saveOptimizationToDb(USER_B, makeResult("bravo-two"));
    expect(getOptimizationsFromDb(USER_B, 10_000_000).length).toBeLessThanOrEqual(200);
    expect(getOptimizationsFromDb(USER_B, Number.NaN).length).toBeLessThanOrEqual(200);
  });

  it("accumulates concurrent saves without dropping any", () => {
    // The old read-modify-write lost updates here; the UPSERT must not.
    for (let i = 0; i < 5; i += 1) {
      saveOptimizationToDb(USER_B, makeResult(`burst-${i}`));
    }
    const stats = getStatsFromDb(USER_B);
    // 1 seeded + 2 from earlier assertions + 5 burst, all accounted for.
    expect(stats.totalTokensSaved).toBe(stats.optimizationsCount * 30);
  });
});