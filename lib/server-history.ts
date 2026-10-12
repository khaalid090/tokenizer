/**
 * Server-side history access via Supabase (bearer JWT + RLS).
 *
 * Used by the /history Server Component and its delete action. The local
 * SQLite helpers in lib/db.ts are for the Node web server / desktop tooling
 * only - they cannot persist on Vercel serverless.
 */

import { createClient } from "@supabase/supabase-js";
import type { OptimizationResult, SessionStats } from "./types";
import { emptyStats } from "./types";

const TABLE = "optimizations";
const HISTORY_COLUMNS =
  "id,user_id,original_prompt,optimized_prompt,mode,original_tokens,optimized_tokens," +
  "tokens_saved,percent_saved,cost_saved_usd,protected_spans_count,validation_passed," +
  "warning,stages,created_at";

interface OptimizationRow {
  id: number;
  original_prompt: string;
  optimized_prompt: string;
  mode: string;
  original_tokens: number;
  optimized_tokens: number;
  tokens_saved: number;
  percent_saved: number;
  cost_saved_usd: number;
  protected_spans_count: number;
  validation_passed: boolean;
  warning: string | null;
  stages: unknown;
  created_at: string;
}

function userClient(url: string, anonKey: string, bearer: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function rowToResult(row: OptimizationRow): OptimizationResult {
  return {
    id: row.id,
    originalPrompt: row.original_prompt,
    optimizedPrompt: row.optimized_prompt,
    mode: row.mode as OptimizationResult["mode"],
    originalTokens: row.original_tokens,
    optimizedTokens: row.optimized_tokens,
    tokensSaved: row.tokens_saved,
    percentSaved: row.percent_saved,
    costSavedUSD: row.cost_saved_usd,
    stages: Array.isArray(row.stages)
      ? (row.stages as OptimizationResult["stages"])
      : [],
    protectedSpansCount: row.protected_spans_count,
    validationPassed: row.validation_passed,
    warning: row.warning ?? undefined,
    timestamp: new Date(row.created_at).getTime(),
  };
}

function toStats(data: unknown): SessionStats {
  const row = (
    Array.isArray(data) ? data[0] : (data ?? {})
  ) as Record<string, unknown>;
  const num = (key: string): number => {
    const value = Number(row[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    totalTokensSaved: num("total_tokens_saved"),
    totalCostSavedUSD: num("total_cost_saved_usd"),
    totalTokensOriginal: num("total_tokens_original"),
    totalTokensOptimized: num("total_tokens_optimized"),
    averageCompressionRatio: num("average_compression_ratio"),
    optimizationsCount: num("optimizations_count"),
  };
}

export interface ServerHistoryPayload {
  history: OptimizationResult[];
  stats: SessionStats;
}

/** Loads the caller's history + stats using their access token (RLS). */
export async function fetchHistoryWithBearer(
  url: string,
  anonKey: string,
  bearer: string,
  limit = 100
): Promise<ServerHistoryPayload> {
  const client = userClient(url, anonKey, bearer);
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 50));

  const [historyRes, statsRes] = await Promise.all([
    client
      .from(TABLE)
      .select(HISTORY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    client.rpc("get_token_stats"),
  ]);

  if (historyRes.error) {
    throw new Error(historyRes.error.message || "Failed to load history");
  }

  return {
    history: ((historyRes.data ?? []) as unknown as OptimizationRow[]).map(
      rowToResult
    ),
    stats: statsRes.error
      ? emptyStats()
      : { ...emptyStats(), ...toStats(statsRes.data) },
  };
}

/** Deletes one of the caller's history rows (RLS enforces ownership). */
export async function deleteHistoryWithBearer(
  url: string,
  anonKey: string,
  bearer: string,
  id: number
): Promise<void> {
  const client = userClient(url, anonKey, bearer);
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) {
    throw new Error(error.message || "Failed to delete history item");
  }
}
