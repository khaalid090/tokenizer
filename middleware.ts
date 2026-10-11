import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authCookieName,
  extractBearerFromCookie,
  fetchOwnProfileFlags,
  verifyBearer,
} from "@/lib/server-auth";

/**
 * Middleware.
 *
 * The only job of this file is to gate the /admin route group. Everything else
 * in the app is handled by components and API routes.
 *
 * Why middleware and not just a hidden nav link? Because hiding a link is not
 * security. A non-admin who types /admin/users directly, or who has the URL
 * bookmarked, would still reach the page. This middleware verifies the session
 * server-side and redirects to the normal workspace for anyone who is not an
 * admin - before any admin component ever renders.
 *
 * How the session gets here: the Supabase browser client keeps its session in
 * localStorage (unreadable on the server), so lib/supabase.ts mirrors a compact
 * `{ "access_token": "..." }` JSON into the `sb-<project-ref>-auth-token`
 * cookie. This middleware decodes that cookie, verifies the token against
 * Supabase and reads the caller's own `profiles` row with the caller's JWT
 * (RLS lets you read your own row). No service_role key is involved here.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only the /admin group is gated. The public app and the API routes are
  // unaffected, so this adds no overhead to the common case.
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    // Without Supabase there is no session to verify - send the visitor to the
    // workspace rather than exposing a broken admin shell.
    return NextResponse.redirect(new URL("/", req.url));
  }

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const bearer =
    token || extractBearerFromCookie(req.cookies.get(authCookieName(url))?.value);
  if (!bearer) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const userId = await verifyBearer(url, anonKey, bearer);
  if (!userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Look up the profile with the caller's JWT. If the profile does not exist
  // yet (race between the signup trigger and this check), treat the user as
  // non-admin rather than letting them through.
  const profile = await fetchOwnProfileFlags(url, anonKey, bearer, userId);
  if (!profile || !profile.is_admin || profile.banned) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Carry the user id forward so the admin layout does not have to re-verify.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", userId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Match /admin and everything below it. API routes are NOT matched here -
  // they do their own requireAdmin() check and would create a verify loop.
  matcher: ["/admin/:path*"],
};
