import { OptimizationResult, SessionStats } from "./types";
import {
  clearSupabaseHistory,
  fetchSupabaseHistory,
  getSupabaseClient,
  postSupabaseRecord,
} from "./supabase";

/**
 * Persistence layer used by the app shell.
 *
 *  Supabase      -> signed-in users; history + dashboard synced in the cloud
 *                   (works in both the web and the desktop build).
 *  SQLite server -> web build fallback when Supabase is not configured.
 *  localStorage  -> desktop build / offline fallback.
 *
 * The compression pipeline itself is identical in every mode and always runs
 * locally on the user's device.
 */

// Re-exported so the UI can treat every storage backend through one module.
export {
  clearSupabaseHistory,
  fetchSupabaseHistory,
  postSupabaseRecord,
};

export type PersistenceMode = "supabase" | "server" | "local";

const HISTORY_KEY = "tokentrim_history";
const STATS_KEY = "tokentrim_session_stats";
const MAX_LOCAL_HISTORY = 50;

export function emptyStats(): SessionStats {
  return {
    totalTokensSaved: 0,
    totalCostSavedUSD: 0,
    totalTokensOriginal: 0,
    totalTokensOptimized: 0,
    averageCompressionRatio: 0,
    optimizationsCount: 0,
  };
}

/** Adds one optimization to the running totals (used offline / before a server sync). */
export function computeNextStats(prev: SessionStats, result: OptimizationResult): SessionStats {
  const totalTokensOriginal = prev.totalTokensOriginal + result.originalTokens;
  const totalTokensOptimized = prev.totalTokensOptimized + result.optimizedTokens;
  const totalTokensSaved = prev.totalTokensSaved + result.tokensSaved;

  return {
    totalTokensSaved,
    totalCostSavedUSD: prev.totalCostSavedUSD + result.costSavedUSD,
    totalTokensOriginal,
    totalTokensOptimized,
    averageCompressionRatio:
      totalTokensOriginal > 0
        ? Math.round((totalTokensSaved / totalTokensOriginal) * 100)
        : 0,
    optimizationsCount: prev.optimizationsCount + 1,
  };
}

// ---------------------------------------------------------------------------
// Local (desktop / offline) storage
// ---------------------------------------------------------------------------

export function loadLocalHistory(): OptimizationResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OptimizationResult[]) : [];
  } catch {
    return [];
  }
}

export function loadLocalStats(): SessionStats | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    return { ...emptyStats(), ...(JSON.parse(raw) as SessionStats) };
  } catch {
    return null;
  }
}

/** Warm-cache storage for the history list. Written by the workspace/dashboard
 *  pages right after `loadHistory()` succeeds, read by the History page as a
 *  stale-while-revalidate cache: the list is available for an instant render
 *  from the browser's own memory, while a background fetch refreshes it.
 *  The JSON is tiny and mirrors the cookie-less in-memory session. */
export function saveHistoryToSessionStorage(
  history: OptimizationResult[],
  stats: SessionStats
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      "tokentrim_history",
      JSON.stringify({ history, stats })
    );
  } catch {
    // Storage full/blocked - the live list still works, the cache just misses.
  }
}

export function loadHistoryFromSessionStorage(): {
  history: OptimizationResult[];
  stats: SessionStats;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("tokentrim_history");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.history) || !parsed.stats) return null;
    return {
      history: parsed.history as OptimizationResult[],
      stats: { ...emptyStats(), ...parsed.stats },
    };
  } catch {
    return null;
  }
}

export function saveLocalRecord(result: OptimizationResult, stats: SessionStats): void {
  if (typeof window === "undefined") return;
  try {
    const next = [result, ...loadLocalHistory()].slice(0, MAX_LOCAL_HISTORY);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // storage unavailable - history simply stays in memory for this session
  }
}

export function clearLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
    window.localStorage.removeItem(STATS_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Server storage (web build, /api/history -> SQLite)
// ---------------------------------------------------------------------------

export interface ServerHistoryPayload {
  history: OptimizationResult[];
  stats: SessionStats;
}

/**
 * The caller's Supabase access token, or null when signed out.
 *
 * `/api/history` is authenticated, so every request must carry this. Read
 * straight from the persisted session rather than cached in state, so a token
 * refresh in another tab is picked up without a reload.
 */
async function getAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Builds the auth header, or null when there is no session to send. */
async function authHeader(): Promise<Record<string, string> | null> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function fetchServerHistory(limit = 50): Promise<ServerHistoryPayload | null> {
  try {
    const headers = await authHeader();
    // Without a session the endpoint would 401 anyway; returning null lets the
    // caller fall through to local storage instead of surfacing an error.
    if (!headers) return null;

    const res = await fetch(`/api/history?limit=${limit}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;
    return {
      history: Array.isArray(data.history) ? data.history : [],
      stats: data.stats ? { ...emptyStats(), ...data.stats } : emptyStats(),
    };
  } catch {
    return null;
  }
}

export async function postServerRecord(result: OptimizationResult): Promise<SessionStats | null> {
  try {
    const headers = await authHeader();
    if (!headers) return null;

    const res = await fetch("/api/history", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success && data.stats ? data.stats : null;
  } catch {
    return null;
  }
}

export async function clearServerHistory(): Promise<SessionStats | null> {
  try {
    const headers = await authHeader();
    if (!headers) return null;

    const res = await fetch("/api/history", { method: "DELETE", headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success && data.stats ? data.stats : null;
  } catch {
    return null;
  }
}
