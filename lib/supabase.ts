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

// ---------------------------------------------------------------------------
// Auth cookie mirror
//
// supabase-js persists the session in localStorage by default, but Next.js
// middleware and the /admin server layout run on the server and can only read
// cookies. After every sign-in / token refresh we therefore also mirror a
// compact `{ "access_token": "..." }` JSON into the `sb-<project-ref>-auth-token`
// cookie (URL-encoded so JSON quotes are cookie-safe, ~1.5 KB - well under the
// 4 KB per-cookie limit). lib/server-auth.ts decodes it server-side.
// ---------------------------------------------------------------------------

function authCookieName(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

function writeAuthCookie(url: string, sessionJson: string | null): void {
  if (typeof document === "undefined") return;
  const name = authCookieName(url);
  if (!sessionJson) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  let token = "";
  try {
    const parsed = JSON.parse(sessionJson);
    if (parsed && typeof parsed.access_token === "string") {
      token = parsed.access_token;
    }
  } catch {
    // ignore malformed values
  }
  if (!token) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  const value = encodeURIComponent(JSON.stringify({ access_token: token }));
  // 30 days; the client refreshes the token (and this cookie) automatically.
  document.cookie = `${name}=${value}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

/**
 * Pushes whatever session currently lives in localStorage into the auth cookie.
 * Called once when the client is created so a user who signed in BEFORE this
 * mirror existed still gets a valid cookie on their next page load.
 */
function syncAuthCookie(url: string): void {
  if (typeof window === "undefined") return;
  try {
    writeAuthCookie(url, window.localStorage.getItem(authCookieName(url)));
  } catch {
    // ignore (storage disabled)
  }
}

/**
 * localStorage-compatible adapter that mirrors `sb-<ref>-auth-token` writes
 * into the auth cookie. All other keys pass straight through to localStorage.
 */
function createMirroredStorage(url: string): Storage {
  return {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      window.localStorage.setItem(key, value);
      if (key === authCookieName(url)) writeAuthCookie(url, value);
    },
    removeItem: (key: string) => {
      window.localStorage.removeItem(key);
      if (key === authCookieName(url)) writeAuthCookie(url, null);
    },
    clear: () => window.localStorage.clear(),
    key: (index: number) => window.localStorage.key(index),
    get length() {
      return window.localStorage.length;
    },
  };
}

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
      storage: createMirroredStorage(url),
    },
  });
  cachedUrl = url;
  cachedKey = anonKey;
  // Existing sessions (signed in before the mirror existed) live only in
  // localStorage - copy them into the cookie so server middleware can see them.
  syncAuthCookie(url);
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
}

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase is not configured." };

  // Preferred path: the server-side /api/auth/signup route creates the
  // account ALREADY CONFIRMED (service-role admin API), so there is no
  // "check your inbox" confirmation step at all. After the account exists we
  // sign in with the same password to establish the session the caller
  // expects. If the route is unavailable (Tauri static export / no service
  // key -> 503, missing route -> 404, network failure -> catch), fall back to
  // the public client-side signUp below, which is subject to the project's
  // "Confirm email" setting.
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (res.ok) {
      const signedIn = await signIn(email, password);
      if (!signedIn.success) return signedIn;
      return { success: true };
    }

    if (res.status !== 404 && res.status !== 503) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        success: false,
        error: data?.error || "Could not create the account.",
      };
    }
  } catch {
    // Could not reach our own origin - fall through to the public path.
  }

  try {
    const { error } = await client.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
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
export function createServiceClient(): SupabaseClient | null {
  if (typeof process !== "undefined" && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return null;
}
export interface AdminProfile {
  id: string;
  email: string | null;
  is_admin: boolean;
  banned: boolean;
  store_previews: boolean;
  total_optimizations: number;
  total_tokens_saved: number;
  total_cost_saved_usd: number;
  last_active_at: string | null;
  created_at: string;
}

export interface BenchmarkPromptRow {
  id: string;
  label: string;
  sample_prompt: string;
  savings_range_label: string;
  sort_order: number;
  is_active: boolean;
}

export interface PlatformSettingsRow {
  id: number;
  default_compression_mode: string;
  default_price_per_1m: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLogRow {
  id: number;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const PROFILE_COLUMNS =
  "id,email,is_admin,banned,store_previews,total_optimizations,total_tokens_saved,total_cost_saved_usd,last_active_at,created_at";

const BENCHMARK_COLUMNS =
  "id,label,sample_prompt,savings_range_label,sort_order,is_active";

const SETTINGS_COLUMNS =
  "id,default_compression_mode,default_price_per_1m,maintenance_mode,maintenance_message,updated_at,updated_by";

const AUDIT_COLUMNS =
  "id,admin_user_id,action,target_user_id,details,created_at";

/** Fetch the caller's own profile (RLS-scoped). Returns null if none. */
export async function fetchOwnProfile(
  userId: string
): Promise<AdminProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToProfile(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

function rowToProfile(row: Record<string, unknown>): AdminProfile {
  const num = (k: string): number => {
    const v = Number(row[k] ?? 0);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    id: String(row.id ?? ""),
    email: typeof row.email === "string" ? row.email : null,
    is_admin: row.is_admin === true,
    banned: row.banned === true,
    store_previews: row.store_previews === true,
    total_optimizations: num("total_optimizations"),
    total_tokens_saved: num("total_tokens_saved"),
    total_cost_saved_usd: num("total_cost_saved_usd"),
    last_active_at: typeof row.last_active_at === "string" ? row.last_active_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

/** Fetch active benchmark prompts ordered by sort_order (public read). */
export async function fetchActiveBenchmarkPrompts(): Promise<BenchmarkPromptRow[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("benchmark_prompts")
      .select(BENCHMARK_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToBenchmark);
  } catch {
    return [];
  }
}

function rowToBenchmark(row: Record<string, unknown>): BenchmarkPromptRow {
  return {
    id: String(row.id ?? ""),
    label: String(row.label ?? ""),
    sample_prompt: String(row.sample_prompt ?? ""),
    savings_range_label: String(row.savings_range_label ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    is_active: row.is_active === true,
  };
}

/** Fetch the platform_settings singleton (public read). */
export async function fetchPlatformSettings(): Promise<PlatformSettingsRow | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("platform_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return rowToSettings(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

function rowToSettings(row: Record<string, unknown>): PlatformSettingsRow {
  return {
    id: Number(row.id ?? 1),
    default_compression_mode: String(row.default_compression_mode ?? "balanced"),
    default_price_per_1m: Number(row.default_price_per_1m ?? 2.5),
    maintenance_mode: row.maintenance_mode === true,
    maintenance_message: typeof row.maintenance_message === "string" ? row.maintenance_message : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

/** Record the caller's last_active_at timestamp. Fire-and-forget; never blocks. */
export function touchProfile(userId: string): void {
  const client = getSupabaseClient();
  if (!client) return;
  client
    .from("profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", userId)
    .then(() => undefined, () => undefined); // PromiseLike: no .catch()
}
