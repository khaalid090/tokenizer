import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/AdminShell";
import {
  authCookieName,
  extractBearerFromCookie,
  fetchOwnProfileFlags,
  verifyBearer,
} from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Admin Panel - Tokenizer",
  description: "Platform administration dashboard for Tokenizer.",
  robots: { index: false, follow: false },
};

/**
 * Server component that re-verifies admin status before rendering anything.
 *
 * The middleware already redirected non-admins away, but a server component is
 * the belt-and-braces check: it runs even if the middleware is bypassed (e.g.
 * a direct server request, a stale deployment, or a misconfigured matcher).
 *
 * It reads the `sb-<project-ref>-auth-token` cookie (mirrored from localStorage
 * by lib/supabase.ts), verifies the token with the public anon key and reads
 * the caller's own profile row with the caller's JWT - so no service_role key
 * is needed here.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    redirect("/");
  }

  const rawCookie = (await cookies()).get(authCookieName(url))?.value;
  const bearer = extractBearerFromCookie(rawCookie);
  if (!bearer) {
    redirect("/");
  }

  const userId = await verifyBearer(url, anonKey, bearer);
  if (!userId) {
    redirect("/");
  }

  const profile = await fetchOwnProfileFlags(url, anonKey, bearer, userId);
  if (!profile || !profile.is_admin || profile.banned) {
    redirect("/");
  }

  return <AdminShell user={userId}>{children}</AdminShell>;
}
