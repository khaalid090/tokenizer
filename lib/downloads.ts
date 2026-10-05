/**
 * Desktop installer catalogue.
 *
 * The web build has no installers of its own, so the "Download Desktop App"
 * button resolves the visitor's OS/architecture and links straight at the
 * matching release asset (the same pattern Claude Desktop / Claude Code use).
 *
 * ASSET NAMES MUST MATCH what `pnpm tauri:build` actually emits. Tauri v2
 * writes them to `src-tauri/target/release/bundle/`:
 *
 *   macOS    Tokenizer_0.1.0_aarch64.dmg   /   ..._x64.dmg
 *   Windows  Tokenizer_0.1.0_x64-setup.exe
 *   Linux    tokenizer_0.1.0_amd64.AppImage
 */

/** Keep in sync with `version` in src-tauri/tauri.conf.json. */
export const DESKTOP_VERSION = "0.1.0";

/**
 * Where the installers are served from.
 *
 * This is a RELATIVE path on purpose: the files live in `public/downloads/`,
 * so Next serves them from whatever host you deploy to (Netlify, Vercel, any
 * Node server). The same deployed site therefore hosts both the app and the
 * installers - no GitHub, no third-party CDN, no CORS.
 *
 * Populate it with:  pnpm desktop:stage   (after pnpm tauri:build)
 */
export const DOWNLOAD_BASE_URL = "/downloads";

/**
 * Hosted installer URL, used when no installer has been staged yet.
 *
 * Leave `""` to always link at the staged files under `/downloads/`.
 * Point it at your release page (GitHub Releases, a Drive link, your own site)
 * and the button opens that URL instead of 404-ing while `public/downloads/`
 * is still empty.
 */
export const DESKTOP_DOWNLOAD_URL = "";

/**
 * The URL the primary "Download" button should open.
 *
 * Precedence: a staged installer for the visitor's OS -> `DESKTOP_DOWNLOAD_URL`
 * -> `null`.
 *
 * Returning `null` (rather than the platform's expected path) is deliberate:
 * when nothing is staged the old code fell through to `target.url`, which is a
 * guaranteed 404 that the browser then followed. Callers must treat `null` as
 * "no download available" and render a disabled control instead of a link.
 */
export function resolveDownloadUrl(
  target: DownloadTarget | null,
  staged: boolean,
): string | null {
  if (staged && target) return target.url;
  if (DESKTOP_DOWNLOAD_URL) return DESKTOP_DOWNLOAD_URL;
  return null;
}

export type OSKey = "macos" | "windows" | "linux";

export interface DownloadTarget {
  os: OSKey;
  label: string;
  /** Short label used on the primary button. */
  buttonLabel: string;
  /** Direct download URL for the detected platform. */
  url: string;
  /** Exact installer filename, shown as a hint. */
  fileName: string;
  /** How to install once the file lands. */
  installHint: string;
}

interface AssetSpec {
  fileName: string;
  installHint: string;
}

const ASSETS: Record<OSKey, { arm64: AssetSpec; x64: AssetSpec }> = {
  macos: {
    arm64: {
      fileName: `Tokenizer_${DESKTOP_VERSION}_aarch64.dmg`,
      installHint: "Open the .dmg and drag Tokenizer to Applications",
    },
    x64: {
      fileName: `Tokenizer_${DESKTOP_VERSION}_x64.dmg`,
      installHint: "Open the .dmg and drag Tokenizer to Applications",
    },
  },
  windows: {
    arm64: {
      fileName: `Tokenizer_${DESKTOP_VERSION}_arm64-setup.exe`,
      installHint: "Run the installer - it installs Tokenizer for you",
    },
    x64: {
      fileName: `Tokenizer_${DESKTOP_VERSION}_x64-setup.exe`,
      installHint: "Run the installer - it installs Tokenizer for you",
    },
  },
  linux: {
    arm64: {
      fileName: `tokenizer_${DESKTOP_VERSION}_aarch64.AppImage`,
      installHint: "chmod +x the file, then run it",
    },
    x64: {
      fileName: `tokenizer_${DESKTOP_VERSION}_amd64.AppImage`,
      installHint: "chmod +x the file, then run it",
    },
  },
};

const LABELS: Record<OSKey, { label: string; buttonLabel: string }> = {
  macos: { label: "macOS", buttonLabel: "Download for macOS" },
  windows: { label: "Windows", buttonLabel: "Download for Windows" },
  linux: { label: "Linux", buttonLabel: "Download for Linux" },
};

function detectOS(): OSKey {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as unknown as { platform?: string }).platform ?? "";
  if (ua.includes("mac") || platform.toLowerCase().includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
}

function detectArch(): "arm64" | "x64" {
  if (typeof navigator === "undefined") return "x64";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("arm") || ua.includes("aarch64")) return "arm64";
  return "x64";
}

/** Resolves the correct installer for the visitor's current OS + CPU. */
export function getDownloadTarget(): DownloadTarget {
  const os = detectOS();
  const arch = detectArch();
  const asset = ASSETS[os][arch];

  return {
    os,
    label: LABELS[os].label,
    buttonLabel: LABELS[os].buttonLabel,
    url: `${DOWNLOAD_BASE_URL}/${asset.fileName}`,
    fileName: asset.fileName,
    installHint: asset.installHint,
  };
}

/**
 * Every installer variant, one entry per (os, arch) pair.
 *
 * Both architectures are listed for each OS so a visitor on any machine can
 * find the exact build they need. Each row carries its own filename and an
 * explicit CPU label, so "arm64" and "x64" are never ambiguous in the menu.
 */
export const ALL_PLATFORMS: {
  os: OSKey;
  label: string;
  fileName: string;
  archLabel: string;
}[] = (["macos", "windows", "linux"] as OSKey[]).flatMap((os) =>
  (["arm64", "x64"] as const).map((arch) => ({
    os,
    label: LABELS[os].label,
    fileName: ASSETS[os][arch].fileName,
    archLabel: arch === "arm64" ? "Apple Silicon / ARM64" : "Intel / AMD64",
  }))
);