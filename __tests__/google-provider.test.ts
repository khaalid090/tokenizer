import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapGoogleAuthError } from "../lib/supabase";

/**
 * Guards the Google pre-flight check in lib/supabase.ts.
 *
 * Supabase reports `"google": false` on this project, so signInWithOAuth would
 * redirect the browser to an authorize URL that answers 400 with raw JSON -
 * stranding the user with no chance for the UI to explain. The pre-flight must
 * refuse to navigate when the provider is off, while still failing OPEN when
 * the probe itself is unavailable.
 *
 * NOTE on scope: supabase-js only performs the real browser redirect when a
 * `document` exists, so under Node the OAuth hand-off itself is not
 * reproducible here. These tests pin the behaviour we own - the pre-flight
 * decision and the request it makes (and must not make) - while the message
 * mapping is covered as a pure function.
 */
type Mod = typeof import("../lib/supabase");

const SETTINGS_URL = "https://test.supabase.co/auth/v1/settings";
const DISABLED_MSG_FRAGMENT = "isn't enabled for this project";

/** Loads a fresh copy of the module so the memoised provider state resets. */
async function loadModule(): Promise<Mod> {
  vi.resetModules();
  return import("../lib/supabase");
}

describe("signInWithGoogle pre-flight", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    // getSupabaseClient() bails on the server unless `window` exists.
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000", href: "" },
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks the redirect and returns an actionable message when Google is off", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("/auth/v1/settings")) {
          return new Response(JSON.stringify({ external: { google: false } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Any other request would be the OAuth hand-off starting.
        throw new Error(`must not have requested ${url}`);
      }),
    );

    const mod = await loadModule();
    const result = await mod.signInWithGoogle();

    expect(result.success).toBe(false);
    expect(result.error).toContain(DISABLED_MSG_FRAGMENT);
    // Tells the user what to do next instead of dumping raw API JSON at them.
    expect(result.error).toContain("Supabase -> Authentication -> Providers");

    // Exactly one call - the settings probe. Never redirected off the app.
    expect(seen).toEqual([SETTINGS_URL]);
    expect(window.location.href).toBe("");
  });

  it("does not block when the provider is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("/auth/v1/settings")) {
          return new Response(JSON.stringify({ external: { google: true } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Under Node supabase-js never reaches the authorize endpoint, but if
        // a future version does, answer rather than throw.
        return new Response(JSON.stringify({ url: "https://accounts.google.com/auth" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const mod = await loadModule();
    const result = await mod.signInWithGoogle();

    expect(result.error ?? "").not.toContain(DISABLED_MSG_FRAGMENT);
    expect(result.success).toBe(true);
  });
  it("fails OPEN when the settings probe itself errors", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("/auth/v1/settings")) throw new Error("network down");
        return new Response(JSON.stringify({ url: "https://accounts.google.com/auth" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const mod = await loadModule();
    const result = await mod.signInWithGoogle();

    // A transient blip must not lock users out of a possibly-enabled provider.
    expect(result.error ?? "").not.toContain(DISABLED_MSG_FRAGMENT);
    expect(seen).toContain(SETTINGS_URL);
    expect(result.success).toBe(true);
  });

  it("memoises a definitive probe result across calls", async () => {
    let hits = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        if (String(input).includes("/auth/v1/settings")) hits += 1;
        return new Response(JSON.stringify({ external: { google: false } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const mod = await loadModule();
    await mod.signInWithGoogle();
    await mod.signInWithGoogle();

    // The second click reuses the cached answer instead of re-probing.
    expect(hits).toBe(1);
  });
});

describe("mapGoogleAuthError", () => {
  const FRIENDLY = "isn't enabled for this project";
  const RAW_PAYLOAD =
    '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}';

  it("rewrites the raw Supabase 400 payload into the actionable message", () => {
    const mapped = mapGoogleAuthError(RAW_PAYLOAD);
    expect(mapped).toContain(FRIENDLY);
    expect(mapped).not.toContain("validation_failed");
    expect(mapped).not.toContain("Unsupported provider");
  });

  it("rewrites the bare msg string supabase-js surfaces", () => {
    expect(mapGoogleAuthError("Unsupported provider: provider is not enabled")).toContain(
      FRIENDLY,
    );
  });

  it("passes unrelated auth errors through untouched", () => {
    expect(mapGoogleAuthError("Invalid login credentials")).toBe("Invalid login credentials");
    expect(mapGoogleAuthError("Email not confirmed")).toBe("Email not confirmed");
  });
});
