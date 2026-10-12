"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authCookieName, extractBearerFromCookie } from "@/lib/server-auth";
import { deleteHistoryWithBearer } from "@/lib/server-history";

/**
 * Deletes one history row for the signed-in caller via Supabase (RLS).
 *
 * Defined as a Server Action so HistoryList can invoke it without the page
 * (a Server Component) passing a plain function to a Client Component.
 */
export async function deleteHistoryItem(id: number): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    redirect("/");
  }

  const cookieStore = await cookies();
  let bearer = "";
  try {
    bearer = extractBearerFromCookie(
      cookieStore.get(authCookieName(supabaseUrl))?.value
    );
  } catch {
    redirect("/");
  }
  if (!bearer) {
    redirect("/");
  }

  await deleteHistoryWithBearer(supabaseUrl, supabaseAnonKey, bearer, id);
  revalidatePath("/history");
}
