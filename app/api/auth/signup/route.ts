import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign-up route that creates accounts ALREADY CONFIRMED.
 *
 * The Supabase dashboard's "Confirm email" setting makes the public client-side
 * signUp return a user but no session until the confirmation link is clicked -
 * a pointless inbox round-trip for an app whose compression pipeline runs fully
 * locally. This route uses the service-role admin API (a server-only env var)
 * to create the account with `email_confirm: true`, so the user can sign in
 * immediately: no confirmation email, no extra step.
 *
 * The service-role key never leaves the server. The endpoint accepts exactly
 * what the public signUp call accepts (email + password), so the exposure is
 * unchanged; on desktop/static exports (no route, no key) the client falls
 * back to the public signUp path.
 */

let cachedAdmin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };
  if (
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    password.length < 6
  ) {
    return NextResponse.json(
      {
        error: "Enter a valid email and a password of at least 6 characters.",
      },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    // No service key configured (e.g., the Tauri static export): the client
    // falls back to the public client-side signUp path.
    return NextResponse.json(
      { error: "Server sign-up is not configured." },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });

    if (error) {
      const message = error.message || "Could not create the account.";
      const exists =
        message.toLowerCase().includes("already") ||
        (error as { code?: string }).code === "email_exists";
      return NextResponse.json(
        {
          error: exists
            ? "An account with this email already exists."
            : message,
        },
        { status: exists ? 409 : 502 }
      );
    }

    return NextResponse.json({ success: true, userId: data.user?.id ?? null });
  } catch (err) {
    console.error("[api/auth/signup] admin.createUser failed:", err);
    return NextResponse.json(
      { error: "Sign-up failed. Please try again." },
      { status: 500 }
    );
  }
}
