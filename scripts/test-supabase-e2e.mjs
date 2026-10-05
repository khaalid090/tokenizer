#!/usr/bin/env node
/**
 * End-to-end check of the AUTHENTICATED Supabase path.
 *
 *   node scripts/test-supabase-e2e.mjs
 *
 * REUSING AN EXISTING ACCOUNT (recommended - avoids signup rate limits):
 *   add these to .env.local, then run this script:
 *       E2E_EMAIL=you@gmail.com
 *       E2E_PASSWORD=your-password
 *   Nothing is created, and only your own rows are touched.
 *
 * Otherwise a throwaway account is created. Supabase rate-limits signups per
 * IP; delete the throwaway afterwards in Authentication -> Users.
 *
 * The test ROW is always removed at the end.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnv() {
  const file = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(file)) {
    console.error("[e2e] No .env.local found. Copy .env.example -> .env.local first.");
    process.exit(1);
  }
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("[e2e] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing from .env.local");
  process.exit(1);
}

const THROWAWAY_EMAIL = `tokentrim.e2e.${Date.now()}@gmail.com`;
const THROWAWAY_PASSWORD = "TestOnly123!x";
const existingEmail = env.E2E_EMAIL;
const existingPassword = env.E2E_PASSWORD;
const useExisting = Boolean(existingEmail && existingPassword);

const db = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`      ${ok ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures += 1;
  return ok;
};

console.log("[e2e] Supabase authenticated-path test");
console.log(`[e2e] project: ${url}`);
console.log(
  useExisting
    ? `[e2e] account: ${existingEmail} (existing - nothing created)\n`
    : `[e2e] account: ${THROWAWAY_EMAIL} (throwaway)\n`
);

// --- 1. Obtain a session ---------------------------------------------------
let session = null;

if (useExisting) {
  const { data, error } = await db.auth.signInWithPassword({
    email: existingEmail,
    password: existingPassword,
  });
  if (error) {
    console.error(`[e2e] signIn failed: ${error.message}`);
    process.exit(1);
  }
  session = data.session;
} else {
  const { data, error } = await db.auth.signUp({
    email: THROWAWAY_EMAIL,
    password: THROWAWAY_PASSWORD,
  });

  if (error) {
    console.error(`[e2e] signUp failed: ${error.message}`);
    if (error.message.toLowerCase().includes("rate limit")) {
      console.error(
        "\n[e2e] Supabase is rate-limiting new signups from this IP."
      );
      console.error(
        "[e2e] Create the account once in the browser, then add to .env.local:"
      );
      console.error("        E2E_EMAIL=you@gmail.com");
      console.error("        E2E_PASSWORD=your-password");
      console.error("[e2e] then re-run this script.\n");
    }
    process.exit(1);
  }
  session = data.session;
}

// "Confirm email" is on by default, so signUp may return no session at all.
if (!session) {
  console.log("      ..account created; Confirm-email is ON, trying to sign in");
  const { data, error } = await db.auth.signInWithPassword({
    email: THROWAWAY_EMAIL,
    password: THROWAWAY_PASSWORD,
  });
  if (error) {
    console.error(
      "\n[e2e] Confirm-email is enabled, so this test cannot authenticate alone."
    );
    console.error(
      "[e2e] Click the confirmation link, or turn Confirm-email OFF in"
    );
    console.error("[e2e] Supabase -> Authentication -> Providers -> Email.\n");
    process.exit(1);
  }
  session = data.session;
}

check(Boolean(session), "1. signed in and have a session", session?.user?.email);

// --- 2. Insert (mirrors lib/supabase.ts: user_id is never sent) ------------
const row = {
  original_prompt: "Please kindly help me analyse this, thank you very much!",
  optimized_prompt: "Analyse this.",
  mode: "balanced",
  original_tokens: 120,
  optimized_tokens: 60,
  tokens_saved: 60,
  percent_saved: 50,
  cost_saved_usd: 0.00015,
  protected_spans_count: 2,
  validation_passed: true,
  warning: null,
  stages: [{ stage: "original", name: "Original Input", tokens: 120, tokensSaved: 0 }],
  created_at: new Date().toISOString(),
};

const { data: inserted, error: insertErr } = await db
  .from("optimizations")
  .insert(row)
  .select("id,user_id")
  .single();

if (insertErr) {
  console.error(`\n[e2e] INSERT FAILED: ${insertErr.message}`);
  console.error(`[e2e] code: ${insertErr.code || "n/a"}\n`);
  console.error(
    "[e2e] If this is a null-value error on user_id, re-apply supabase/schema.sql"
  );
  console.error("[e2e] in the Supabase SQL Editor.\n");
  process.exit(1);
}

check(true, "2. inserted a row (user_id never sent by the client)");
check(
  inserted.user_id === session.user.id,
  "2b. RLS attached the correct user_id automatically",
  inserted.user_id
);

// --- 3. Read back ---------------------------------------------------------
const { data: history, error: readErr } = await db
  .from("optimizations")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(50);

check(!readErr, "3. history read succeeded", readErr?.message);
check(
  Array.isArray(history) && history.length >= 1,
  "3b. the row is visible to its owner",
  `${history?.length ?? 0} row(s)`
);
check(
  Array.isArray(history) && history.every((r) => r.user_id === session.user.id),
  "3c. every visible row belongs to this user (no cross-user leak)"
);

// --- 4. Aggregate stats ---------------------------------------------------
const { data: stats, error: statsErr } = await db.rpc("get_token_stats");
check(!statsErr, "4. get_token_stats() succeeded", statsErr?.message);

const s = Array.isArray(stats) ? stats[0] : null;
check(
  Number(s?.optimizations_count) >= 1,
  "4b. optimizations_count reflects the insert",
  String(s?.optimizations_count)
);
check(
  Number(s?.total_tokens_saved) === 60,
  "4c. total_tokens_saved is correct",
  String(s?.total_tokens_saved)
);
check(
  Number(s?.average_compression_ratio) === 50,
  "4d. average_compression_ratio computed",
  String(s?.average_compression_ratio)
);

// --- 5. Cleanup -----------------------------------------------------------
const { error: delErr } = await db.from("optimizations").delete().eq("id", inserted.id);
check(!delErr, "5. test row deleted", delErr?.message);

const { data: after } = await db
  .from("optimizations")
  .select("id")
  .eq("id", inserted.id);
check(Array.isArray(after) && after.length === 0, "5b. row is gone");

console.log(`\n[e2e] ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
if (!useExisting) {
  console.log(`[e2e] Delete the throwaway account in Authentication -> Users: ${THROWAWAY_EMAIL}`);
}
console.log("");

process.exit(failures === 0 ? 0 : 1);