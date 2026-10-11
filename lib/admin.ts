import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side admin helpers.
 *
 * These functions live in lib/admin.ts and are imported ONLY by the API
 * routes under app/api/admin/ and by the /admin layout. They use the
 * `service_role` key, which bypasses Row Level Security - so they are never
 * imported by any client component, and the key never reaches the browser.
 */

let cachedServiceClient: SupabaseClient | null = null;

/** Memoized service-role client. Returns null if the key is not configured. */
export function getServiceClient(): SupabaseClient | null {
  if (cachedServiceClient) return cachedServiceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedServiceClient;
}

export interface AdminContext {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Verifies the caller's Bearer token and confirms they are an admin.
 * Returns the admin context, or a 401/403 NextResponse.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<AdminContext | NextResponse> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Server auth is not configured." },
      { status: 503 }
    );
  }

  const verifyClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let user: User;
  try {
    const { data, error } = await verifyClient.auth.getUser(token);
    if (error || !data?.user) {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }
    user = data.user;
  } catch {
    return NextResponse.json(
      { error: "Could not verify your session." },
      { status: 503 }
    );
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server." },
      { status: 503 }
    );
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("is_admin, banned")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "No account profile found." },
      { status: 403 }
    );
  }

  if (profile.banned) {
    return NextResponse.json(
      { error: "This account has been suspended." },
      { status: 403 }
    );
  }

  if (!profile.is_admin) {
    return NextResponse.json(
      { error: "You do not have permission to access the admin panel." },
      { status: 403 }
    );
  }

  return { user, supabase: service };
}

export interface AuditEntry {
  admin_user_id: string;
  action: string;
  target_user_id?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Writes a row to admin_audit_log. Safe to call fire-and-forget: failures are
 * logged but never thrown, so a transient DB hiccup can never take down an
 * admin action that has already succeeded.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_user_id: entry.admin_user_id,
      action: entry.action,
      target_user_id: entry.target_user_id ?? null,
      details: entry.details ?? {},
    });
  } catch (err) {
    console.error("Failed to write admin audit log:", err);
  }
}

/** Returns the current admin count. Uses the service client (bypasses RLS). */
export async function countAdmins(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  if (error || count === null) return 0;
  return count;
}

/** True when the user id is currently banned. */
export async function isBanned(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("banned")
    .eq("id", userId)
    .maybeSingle();
  return data?.banned === true;
}