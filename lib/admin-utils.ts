import { getSupabaseClient } from "./supabase";

/**
 * Fetches an admin API route, attaching the signed-in user's Supabase access
 * token as `Authorization: Bearer ...`. The routes re-verify the token and the
 * is_admin flag server-side (lib/admin.ts), so a missing/expired token simply
 * comes back as a 401/403 that surfaces through the thrown Error.
 *
 * `init` carries the method/body for PUT/POST routes (e.g. AdminSettings).
 */
export async function fetchAdminJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });

  try {
    const client = getSupabaseClient();
    const session = client ? await client.auth.getSession() : null;
    const token = session?.data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch {
    // Not signed in - the route answers 401 and the UI shows that message.
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) =>
      headers.set(key, value)
    );
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
