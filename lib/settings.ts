import { AppSettings, CompressionMode, ThemeName } from "./types";
import { DEFAULT_PRICE_PER_1M } from "./tokens";

const SETTINGS_KEY = "tokentrim_settings";

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "balanced",
  pricePer1M: DEFAULT_PRICE_PER_1M,
  theme: "dark",
};

const MODES: CompressionMode[] = ["lossless", "balanced", "aggressive", "lossy"];
const THEMES: ThemeName[] = ["dark", "light"];

/**
 * Keeps only the fields Tokenizer understands. Older saved settings may still
 * contain provider/model/apiKey entries from previous versions - they are
 * deliberately dropped so no key material survives in storage.
 */
export function sanitizeSettings(raw: unknown): AppSettings {
  const input = (raw ?? {}) as Partial<AppSettings> & Record<string, unknown>;
  const mode = MODES.includes(input.mode as CompressionMode)
    ? (input.mode as CompressionMode)
    : DEFAULT_SETTINGS.mode;
  const theme = THEMES.includes(input.theme as ThemeName)
    ? (input.theme as ThemeName)
    : DEFAULT_SETTINGS.theme;
  const price = Number(input.pricePer1M);

  return {
    mode,
    theme,
    pricePer1M:
      Number.isFinite(price) && price >= 0 ? price : DEFAULT_SETTINGS.pricePer1M,
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const clean = sanitizeSettings(settings);
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    // storage unavailable (private mode / quota) - settings stay in memory
  }
  return clean;
}

/** Applies the chosen appearance theme to <html data-theme="...">. */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}
