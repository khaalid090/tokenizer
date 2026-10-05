/**
 * Platform helpers - web app vs. native desktop (Tauri) build.
 */

/**
 * True when the UI is running inside the Tauri webview.
 * Tauri v2 injects `__TAURI_INTERNALS__`; older/global builds expose `__TAURI__`.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/** Public web deployment, shown as a note inside the desktop build. */
export const WEB_APP_URL = "https://tokenizer.app";
