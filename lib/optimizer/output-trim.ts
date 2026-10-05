import { CompressionMode, isAggressiveMode } from "../types";

/**
 * Trims wordy output demands ONLY when they are generic fluff and NOT explicit user constraints.
 */
export function trimOutputRequirements(text: string, mode: CompressionMode = "balanced"): string {
  if (!text || mode === "lossless") return text;

  let result = text;

  const genericOutputFluff = [
    /\b(?:please\s+)?explain\s+(?:everything\s+)?in\s+great\s+detail(?:\s+and\s+thoroughness)?\b[.]?/gi,
    /\b(?:please\s+)?be\s+as\s+thorough\s+and\s+detailed\s+as\s+possible\b[.]?/gi,
    /\bgive\s+me\s+a\s+comprehensive\s+and\s+deep\s+explanation\s+of\s+everything\b[.]?/gi,
    /\bfeel\s+free\s+to\s+add\s+any\s+additional\s+thoughts\s+you\s+might\s+have\b[.]?/gi,
    /\bwrite\s+a\s+long\s+and\s+detailed\s+response\b[.]?/gi,
    /\band\s+give\s+me\s+some\s+detailed\s+feedback\??/gi,
  ];

  for (const fluff of genericOutputFluff) {
    if (isAggressiveMode(mode)) {
      result = result.replace(fluff, "");
    } else {
      result = result.replace(fluff, "Be concise.");
    }
  }

  // NB: horizontal whitespace only. `\s{2,}` would match a blank line and
  // collapse every paragraph break in a markdown document onto one line.
  result = result.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.!?])/g, "$1").trim();
  return result;
}
