/**
 * Server-side auth helpers shared by middleware.ts and app/admin/layout.tsx.
 *
 * The Supabase browser client persists its session in localStorage (see
 * lib/supabase.ts), which server code cannot read. The client therefore also
 * mirrors a compact `{ "access_token": "..." }` JSON into an
 * `sb-<ref>-auth-token` cookie; these helpers decode that cookie, verify the
 * token against Supabase and read the caller's own `profiles` row using the
 * caller's JWT - RLS policy "profiles: read own" lets a user read their own
 * row, so no service_role key is needed for the /admin gate itself.
 */

/** Cookie name Supabase uses for this project (`sb-<project-ref>-auth-token`). */
export function authCookieName(url: string): string {
  // Guard missing/invalid env so Server Components never throw Invalid URL
  // (production omits the message and only shows a digest).
  if (!url || typeof url !== "string") {
    throw new Error("Supabase URL is not configured");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase URL is invalid");
  }
  return `sb-${parsed.hostname.split(".")[0]}-auth-token`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extracts the Bearer token from a raw auth-cookie value.
 *
 * Handles every format that may end up in the cookie:
 *   1. URL-encoded `{ "access_token": "..." }` written by the client mirror
 *      (lib/supabase.ts),
 *   2. a plain (unencoded) JSON session from older code paths,
 *   3. a bare JWT.
 */
export function extractBearerFromCookie(
  raw: string | null | undefined
): string {
  if (!raw) return "";
  const fromJson = (value: string): string => {
    try {
      const parsed = JSON.parse(value);
      if (
        parsed &&
        typeof parsed.access_token === "string" &&
        parsed.access_token.length > 0
      ) {
        return parsed.access_token;
      }
    } catch {
      // not JSON - fall through
    }
    return "";
  };
  return fromJson(raw) || fromJson(safeDecode(raw)) || safeDecode(raw);
}

/**
 * Verifies a bearer token against `GET /auth/v1/user` and returns the user id,
 * or null when the token is missing/expired/invalid.
 */
export async function verifyBearer(
  url: string,
  anonKey: string,
  bearer: string
): Promise<string | null> {
  if (!bearer) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Fast local verification (JWKS)
//
// verifyBearer() costs one round trip to Supabase's /auth/v1/user (measured at
// ~2-3s from this network), which is far too slow for page navigation. The
// Supabase access token is an ES256 JWT signed with the project's keys, and the
// public part is published at /auth/v1/.well-known/jwks.json - so the signature
// and claims can be checked locally in ~1ms with no network call at all.
//
// Security notes:
//   - signature is verified against Supabase's JWKS (unforgeable),
//   - iss must match this project (tokens from other Supabase projects rejected),
//   - role must be "authenticated" (the anon / service_role keys are rejected),
//   - exp must be in the future (expired tokens rejected),
//   - when local verification cannot vouch for the token for ANY reason (other
//     alg, JWKS unavailable, kid rotation, clock skew) we fall back to the
//     authoritative remote check, so a local failure never lets a bad token
//     through - only a local SUCCESS short-circuits the network call.
// Trade-off: a session revoked server-side stays acceptable on callers of this
// helper until its JWT exp (normally <= 1h). Keep remote verifyBearer() for
// privileged paths (admin gate, API writes) where revocation must bite at once.
// -----------------------------------------------------------------------------
type JwksKey = JsonWebKey & { kid?: string };

/** `{ userId }` = verified; `"invalid"` = authentic signature but unacceptable claims; null = cannot determine locally. */
type LocalVerifyResult = { userId: string } | "invalid" | null;

let jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null;
// 1h: Supabase signing keys rotate rarely, and a kid miss still forces a
// rate-limited refresh below, so a long TTL just removes a periodic network
// stall from the first History click after idle.
const JWKS_TTL_MS = 60 * 60_000;
const JWKS_MIN_REFRESH_MS = 60_000; // rate-limit forced refreshes (kid-miss)

async function getJwks(url: string, force: boolean): Promise<JwksKey[]> {
  const now = Date.now();
  const age = jwksCache ? now - jwksCache.fetchedAt : Number.POSITIVE_INFINITY;
  // Normal reads reuse the cache for JWKS_TTL_MS; a forced refresh (kid miss,
  // e.g. key rotation) is only allowed once every JWKS_MIN_REFRESH_MS so a
  // stream of tokens with bogus kids cannot hammer the JWKS endpoint.
  const maxAge = force ? JWKS_MIN_REFRESH_MS : JWKS_TTL_MS;
  if (jwksCache && age < maxAge) return jwksCache.keys;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { keys?: JwksKey[] };
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        jwksCache = { keys: data.keys, fetchedAt: now };
        return jwksCache.keys;
      }
    }
  } catch {
    // Network failure - serve the stale cache if we have one.
  }
  return jwksCache?.keys ?? [];
}

async function verifyJwtLocally(
  url: string,
  bearer: string
): Promise<LocalVerifyResult> {
  const parts = bearer.split(".");
  if (parts.length !== 3) return null;
  const [h64, p64, s64] = parts;

  let header: { alg?: unknown; kid?: unknown };
  let payload: { sub?: unknown; exp?: unknown; iss?: unknown; role?: unknown };
  try {
    header = JSON.parse(Buffer.from(h64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(p64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  // Only ES256 is handled locally; anything else falls back to remote verify.
  if (header.alg !== "ES256" || typeof header.kid !== "string") return null;

  // Signature FIRST: once Supabase's own key vouches for the token, claim
  // failures are definitive facts (exp / iss / role) that no remote call can
  // change - so an EXPIRED session is rejected in ~1ms instead of waiting
  // 2-3s for the remote check to agree. Anything short of a valid signature
  // (garbage, tampered payload, unknown kid, JWKS unreachable) returns null so
  // the caller falls back to the authoritative remote verification.
  let keys = await getJwks(url, false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Possible key rotation - force one rate-limited refresh, then give up.
    keys = await getJwks(url, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;
  if (jwk.kty !== "EC" || (jwk as { crv?: unknown }).crv !== "P-256") {
    return null;
  }

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const signedData = new TextEncoder().encode(`${h64}.${p64}`);
    const signature = Buffer.from(s64, "base64url");
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      signedData
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  // Signature is authentic - now the claims decide, with a small grace period
  // on exp so a slightly-ahead server clock never bounces a live session.
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return "invalid";
  }
  if (payload.role !== "authenticated") return "invalid";
  if (
    typeof payload.exp !== "number" ||
    Date.now() >= payload.exp * 1000 + 30_000
  ) {
    return "invalid";
  }
  const expectedIss = `${url.replace(/\/+$/, "")}/auth/v1`;
  if (String(payload.iss ?? "").replace(/\/+$/, "") !== expectedIss) {
    return "invalid";
  }
  return { userId: payload.sub };
}

/**
 * Local-first verification: ES256 signature + claims checked locally in ~1ms,
 * with an automatic fallback to the remote /auth/v1/user check whenever local
 * verification cannot vouch for the token. Use for user-facing page renders;
 * keep plain verifyBearer() where server-side revocation must be immediate.
 */
export async function verifyBearerFast(
  url: string,
  anonKey: string,
  bearer: string
): Promise<string | null> {
  if (!bearer) return null;
  try {
    const local = await verifyJwtLocally(url, bearer);
    if (local !== null) {
      // `{ userId }` -> accept; "invalid" -> authentic signature but the
      // claims say no (expired, foreign iss, non-authenticated role), which no
      // remote round trip would ever overturn - reject immediately.
      return typeof local === "object" ? local.userId : null;
    }
  } catch {
    // fall through to the authoritative remote check
  }
  return verifyBearer(url, anonKey, bearer);
}

/**
 * Reads `is_admin` / `banned` for the caller's own profile row using the
 * CALLER's JWT.
 *
 * Querying with a session-less anon client would always return zero rows:
 * RLS only exposes rows where `auth.uid() = id`, and auth.uid() is null for
 * the anon key. Passing the caller's token makes PostgREST resolve auth.uid()
 * to them, so the "read own row" policy applies.
 */
export async function fetchOwnProfileFlags(
  url: string,
  anonKey: string,
  bearer: string,
  userId: string
): Promise<{ is_admin: boolean; banned: boolean } | null> {
  try {
    const res = await fetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}` +
        `&select=is_admin,banned&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as { is_admin?: unknown; banned?: unknown };
    return {
      is_admin: row.is_admin === true,
      banned: row.banned === true,
    };
  } catch {
    return null;
  }
}
