import { CompressionMode, isAggressiveMode } from "../types";

/**
 * Calculates Jaccard similarity between two token sets.
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const set2 = new Set(str2.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates repeated sentences or near-duplicate sentences across the text.
 */
export function deduplicate(text: string, mode: CompressionMode = "balanced"): string {
  if (!text) return "";

  const threshold = mode === "lossless" ? 1.0 : isAggressiveMode(mode) ? 0.70 : 0.85;

  // Process the text line by line so the newline structure survives verbatim.
  // A previous version split on /(?<=[.!?\n])\s+/ and rejoined with " ", which
  // collapsed every paragraph onto one line and destroyed the markdown layout.
  // `keptSentences` stays document-wide so near-duplicates are still caught
  // across lines; only the emission is line-local.
  const keptLines: string[] = [];
  const keptSentences: string[] = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      keptLines.push(""); // preserve blank lines
      continue;
    }

    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const keptHere: string[] = [];
    for (const sentence of sentences) {
      // A masked span (code block, filename, constraint, ...) is opaque content,
      // never a duplicate candidate.
      if (sentence.includes("__TTP_")) {
        keptHere.push(sentence);
        keptSentences.push(sentence);
        continue;
      }

      const isDuplicate = keptSentences.some((existing) => {
        if (existing.includes("__TTP_")) return false;
        if (sentence === existing) return true;
        return (
          threshold < 1.0 &&
          sentence.length > 15 &&
          jaccardSimilarity(sentence, existing) >= threshold
        );
      });

      if (!isDuplicate) {
        keptHere.push(sentence);
        keptSentences.push(sentence);
      }
    }

    keptLines.push(keptHere.join(" "));
  }

  return keptLines.join("\n");
}
