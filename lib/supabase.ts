import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { OptimizationResult, SessionStats } from "./types";

/**
 * Supabase access layer.
 *
 * IMPORTANT: this is a *sync* store for finished optimization results only.
 * The compression pipeline in lib/optimizer/* is pure TypeScript and always runs
 * on the user's device, so Tokenizer's core feature keeps working with no
 * network and no account. Supabase is only involved when a signed-in user
 * chooses to keep their history and dashboard data in the cloud.
 *
 * The desktop (Tauri) build is a static export, so it talks to Supabase
 * directly from the webview using the public anon key. That is safe because
 * every table is protected by Row Level Security (see supabase/schema.sql):
 * the anon key can only ever see rows belonging to the signed-in user.
 */

const TABLE = "optimizations";

/** Row shape in Postgres (snake_case), as returned by Supabase. */
interface OptimizationRow {
  id: number;
  user_id: string;
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

const HISTORY_COLUMNS =
  "id,user_id,original_prompt,optimized_prompt,mode,original_tokens,optimized_tokens," +
  "tokens_saved,percent_saved,cost_saved_usd,protected_spans_count,validation_passed," +
  "warning,stages,created_at";

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

/**
 * Creates (and memoizes) the browser Supabase client.
 * Returns null when the env vars are missing so the app can degrade to local
 * storage instead of crashing.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  if (cachedClient && cachedUrl === url && cachedKey === anonKey) return cachedClient;

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedUrl = url;
  cachedKey = anonKey;
  return cachedClient;
}

/** True when Supabase env vars are configured in this build. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data.user;
  } catch {
    return null;
  }
}

export interface AuthResult {
  success: boolean;
  error?: string;
  /** True when the account exists but email confirmation is still pending. */
  needsEmailConfirmation?: boolean;
}

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  // supabase-js resolves with `{ error }` for auth failures, but *throws* on
  // transport-level problems (offline, DNS, blocked request, bad URL). Every
  // other helper in this file swallows those; these must too, otherwise the
  // rejection escapes into the caller's event handler.
  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) return { success: false, error: error.message };

    // With "Confirm email" enabled in the Supabase dashboard, signUp returns a
    // user but no session until the confirmation link is clicked.
    return { success: true, needsEmailConfirmation: !data.session };
  } catch {
    return { success: false, error: "Could not reach the sign-in service. Check your connection." };
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  try {
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return { success: false, error: "Could not reach the sign-in service. Check your connection." };
  }
}

/**
 * What the Supabase project reports about the Google provider.
 *
 *  - "enabled"  -> safe to start the OAuth redirect
 *  - "disabled" -> the provider is switched off, so the authorize URL answers
 *                  400 ("Unsupported provider: provider is not enabled"). Because
 *                  supabase-js kicks the redirect off with window.location.href,
 *                  the browser would land on that raw JSON page - so we must not
 *                  navigate at all.
 *  - "unknown"  -> the probe itself failed (offline, blocked request). We fail
 *                  OPEN and try the flow anyway: a transient blip must not lock
 *                  users out of a provider that may well be enabled.
 */
type GoogleProviderState = "enabled" | "disabled" | "unknown";

/** Memoised only on a definitive answer, so a failed probe is retried. */
let googleProviderState: GoogleProviderState | null = null;

const GOOGLE_DISABLED_ERROR =
  "Google sign-in isn't enabled for this project. Turn it on in Supabase -> " +
  "Authentication -> Providers, or use another sign-in method.";

/**
 * Normalises an OAuth failure into something the user can act on.
 *
 * When the provider is off, Supabase answers the authorize URL with
 * `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider:
 * provider is not enabled"}`. In the browser that response is the *page*, so the
 * in-app banner may only ever see the tail of it - match loosely on purpose.
 */
export function mapGoogleAuthError(rawMessage: string): string {
  return /provider is not enabled|unsupported provider|error_code.*validation_failed/i.test(
    rawMessage,
  )
    ? GOOGLE_DISABLED_ERROR
    : rawMessage;
}

async function getGoogleProviderState(): Promise<GoogleProviderState> {
  if (googleProviderState) return googleProviderState;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return "unknown";

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    if (!res.ok) return "unknown";

    const data = (await res.json()) as { external?: Record<string, boolean> };
    googleProviderState = data?.external?.google ? "enabled" : "disabled";
    return googleProviderState;
  } catch {
    return "unknown";
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  // Pre-flight: check the provider BEFORE handing control to supabase-js,
  // whose redirect leaves no chance to render a friendly message.
  if ((await getGoogleProviderState()) === "disabled") {
    return { success: false, error: GOOGLE_DISABLED_ERROR };
  }

  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      // Belt and braces: should the server still reject the provider, surface
      // the actionable message instead of the raw API text.
      return { success: false, error: mapGoogleAuthError(error.message) };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Could not reach Google sign-in. Check your connection." };
  }
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // ignore - the local session is cleared regardless
  }
}

/**
 * Sends a password-reset email.
 *
 * `redirectTo` must be allow-listed in the Supabase dashboard under
 * Authentication -> URL Configuration, otherwise Supabase silently falls back
 * to the Site URL and the link lands on the wrong origin.
 */
export async function sendPasswordReset(
  email: string,
  redirectTo?: string
): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo ?? `${window.location.origin}/`,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Could not reach the sign-in service. Check your connection.",
    };
  }
}

/**
 * Completes a password reset.
 *
 * Supabase puts the recovery token in the URL hash; `detectSessionInUrl` turns
 * it into a session, after which the user may set a new password.
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  try {
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Could not reach the sign-in service. Check your connection.",
    };
  }
}

/** Subscribes to auth changes. Returns an unsubscribe function. */
export function onAuthStateChange(
  handler: (session: Session | null) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    handler(session);
  });

  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// History (row-level secured: a user can only read/write their own rows)
// ---------------------------------------------------------------------------

function rowToResult(row: OptimizationRow): OptimizationResult {
  return {
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

/**
 * Normalises the aggregate row from get_token_stats() into `SessionStats`.
 *
 * The SQL function declares snake_case columns (`total_tokens_saved`, ...), so
 * those are the keys Postgres actually returns. We read them explicitly and
 * coerce with `num()` so a null aggregate becomes 0 rather than NaN.
 */
function toStats(data: unknown): SessionStats {
  const row = (Array.isArray(data) ? data[0] : (data ?? {})) as Record<string, unknown>;
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

export interface SupabaseHistoryPayload {
  history: OptimizationResult[];
  stats: SessionStats;
}

/**
 * Loads the signed-in user's history + aggregate dashboard stats.
 * Returns null on any failure so the caller can fall back to local storage.
 */
export async function fetchSupabaseHistory(
  limit = 50
): Promise<SupabaseHistoryPayload | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const [historyRes, statsRes] = await Promise.all([
      client
        .from(TABLE)
        .select(HISTORY_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit),
      client.rpc("get_token_stats"),
    ]);

    if (historyRes.error || statsRes.error) return null;

    return {
      // Supabase's dynamic `.select()` is untyped, so narrow via `unknown`
      // and let rowToResult do the real shape validation.
      history: ((historyRes.data ?? []) as unknown as OptimizationRow[]).map(rowToResult),
      stats: toStats(statsRes.data),
    };
  } catch {
    return null;
  }
}

/** Saves one optimization to the user's account. Returns updated stats. */
export async function postSupabaseRecord(
  result: OptimizationResult
): Promise<SessionStats | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    // `user_id` is intentionally omitted: the RLS insert policy forces it to
    // auth.uid(), so a client can never write into someone else's account.
    const { error } = await client.from(TABLE).insert({
      original_prompt: result.originalPrompt,
      optimized_prompt: result.optimizedPrompt,
      mode: result.mode,
      original_tokens: result.originalTokens,
      optimized_tokens: result.optimizedTokens,
      tokens_saved: result.tokensSaved,
      percent_saved: result.percentSaved,
      cost_saved_usd: result.costSavedUSD,
      protected_spans_count: result.protectedSpansCount,
      validation_passed: result.validationPassed,
      warning: result.warning ?? null,
      stages: result.stages ?? [],
      created_at: new Date(result.timestamp).toISOString(),
    });

    if (error) return null;

    const { data, error: statsError } = await client.rpc("get_token_stats");
    if (statsError) return null;
    return toStats(data);
  } catch {
    return null;
  }
}

/** Deletes every row belonging to the signed-in user. */
export async function clearSupabaseHistory(): Promise<SessionStats | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { error } = await client.from(TABLE).delete().neq("id", 0);
    if (error) return null;

    const { data, error: statsError } = await client.rpc("get_token_stats");
    if (statsError) return null;
    return toStats(data);
  } catch {
    return null;
  }
}
