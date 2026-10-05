import { NextResponse } from "next/server";

/**
 * OAuth callback target (email confirmation links and Google sign-in).
 *
 * Supabase returns here with tokens in the URL fragment. supabase-js is
 * configured with `detectSessionInUrl: true`, so it picks them up automatically;
 * this route's job is simply to bounce the user back to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // `redirect_to` lets us return the user to where they started; default to /.
  const target = searchParams.get("redirect_to") ?? "/";

  // Only ever redirect to a relative path on this origin (open-redirect guard).
  const safeTarget = target.startsWith("/") && !target.startsWith("//") ? target : "/";

  return NextResponse.redirect(`${origin}${safeTarget}`);
}
