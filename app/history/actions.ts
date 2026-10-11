"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authCookieName, extractBearerFromCookie } from "@/lib/server-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * Deletes one history row for the signed-in caller.
 *
 * Defined as a Server Action so the client HistoryList can invoke it without
 * the page (a Server Component) passing a plain function to a Client
 * Component, which React forbids ("Event handlers cannot be passed to Client
 * Component props"). The action re-reads the bearer from the auth cookie and
 * forwards it to the same /api/history DELETE endpoint, so authorization,
 * audit logging and stats recompute stay in one place. Next.js re-renders the
 * page after the action, so the list and stats bar refresh automatically.
 */
export async function deleteHistoryItem(id: number): Promise<void> {
  const cookieStore = await cookies();
  const bearer = extractBearerFromCookie(
    cookieStore.get(authCookieName(SUPABASE_URL))?.value
  );
  if (!bearer) {
    redirect("/");
  }

  const host = process.env.NEXT_PUBLIC_HOST ?? "http://localhost:3000";
  const res = await fetch(
    `${host}/api/history?id=${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearer}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error("Failed to delete history item");
  }
}
