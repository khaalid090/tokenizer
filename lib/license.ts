/**
 * License / upgrade model for Tokenizer.
 *
 * Tokenizer ships free, but not every mode is free. `lossy` is the one mode that
 * *deletes* content, so it is reserved for paid users. Everything else —
 * lossless, balanced, aggressive — runs locally and forever.
 *
 * The check is intentionally trivial: there is no payment stack in this
 * codebase yet, so "upgraded" is a single flag toggled from the Settings
 * modal's Upgrade button. Swap the body of `setPremium(true)` for a real
 * checkout (Stripe / Lemon Squeezer / Paddle) when one lands.
 *
 * State is kept in localStorage so a paid session survives a reload, and a
 * `storage` listener lets the flag update across tabs.
 */

export type LicenseTier = "free" | "pro";

const LICENSE_KEY = "tokentrim_license";
const FREE_MODES: ReadonlySet<string> = new Set([
  "lossless",
  "balanced",
  "aggressive",
]);

/** Modes that require a paid license. */
export const PRO_MODES: ReadonlySet<string> = new Set(["lossy"]);

function readTier(): LicenseTier {
  if (typeof window === "undefined") return "free";
  try {
    return window.localStorage.getItem(LICENSE_KEY) === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

let current: LicenseTier = readTier();

/** Current license tier, updated in-memory and across tabs. */
export function getLicenseTier(): LicenseTier {
  return current;
}

/** True when the user is paid up, so `lossy` (and any future pro features) is unlocked. */
export function isPro(): boolean {
  // A license entitlement only exists for a *user in a session*. In SSR, tests
  // or any environment without a window there is no user to gate, so the
  // pipeline runs freely — the gate is purely a browser-session concern.
  if (typeof window === "undefined") return true;

  // Local builds default to unlocked so the lossy pipeline can be exercised
  // without a checkout. `process.env.NODE_ENV` is replaced at build time, so a
  // production bundle never inherits this.
  if (process.env.NODE_ENV !== "production") return true;

  return current === "pro";
}

/** True for the compression modes that ship with the free tier. */
export function isFreeMode(mode: string): boolean {
  return FREE_MODES.has(mode);
}

/** True for the compression modes gated behind the paid tier. */
export function isProMode(mode: string): boolean {
  return PRO_MODES.has(mode);
}

/** Whether a given compression mode is available under the current license. */
export function canUseMode(mode: string): boolean {
  return isFreeMode(mode) || isPro();
}

/**
 * Activate the paid tier. The real implementation would run a checkout and
 * persist the result server-side; here it just flips the local flag so the
 * UI can be exercised end to end.
 */
export function upgradeToPro(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LICENSE_KEY, "pro");
  } catch {
    // storage unavailable - flag stays in memory only
  }
  current = "pro";
  window.dispatchEvent(new Event("tokentrim:license"));
}

/** Revoke the paid tier (e.g. on sign-out or a refund). */
export function downgradeToFree(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LICENSE_KEY);
  } catch {
    // storage unavailable
  }
  current = "free";
  window.dispatchEvent(new Event("tokentrim:license"));
}

// Keep the in-memory flag in sync across tabs and direct edits.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === LICENSE_KEY) {
      current = e.newValue === "pro" ? "pro" : "free";
    }
  });
}