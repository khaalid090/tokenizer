/*
 * The BPE table for cl100k_base is ~500 KB gzipped, which dominated the initial
 * page load. It is therefore pulled in with a dynamic `import()` instead of a
 * static one: the shell paints and becomes interactive immediately, and the
 * exact encoder lands a moment later.
 *
 * `js-tiktoken/lite` + an explicit single rank is used rather than the package
 * root, because the root entry statically embeds the tables for *every*
 * encoding (~5.4 MB) even though only cl100k_base is ever needed.
 *
 * Until the encoder resolves, countTokens() uses a word-count estimate. The
 * numbers are always shown, never blocked - they just get more precise once
 * the real tokenizer is in memory, at which point the UI re-renders.
 */
import type { Tiktoken, TiktokenBPE } from "js-tiktoken/lite";

type Encoder = Tiktoken;

let encoderInstance: Encoder | null = null;
let loading: Promise<Encoder | null> | null = null;

/** Synchronous accessor; null until the async load below has resolved. */
export function getTokenizer(): Encoder | null {
  return encoderInstance;
}

/**
 * Kicks off (or joins) the one-time tokenizer load. Safe to call repeatedly.
 * Resolves with null if the chunk fails to load, leaving the estimate in place.
 */
export function loadTokenizer(): Promise<Encoder | null> {
  if (encoderInstance) return Promise.resolve(encoderInstance);
  if (loading) return loading;

  loading = (async () => {
    try {
      const [tiktoken, rankModule] = await Promise.all([
        import("js-tiktoken/lite"),
        import("js-tiktoken/ranks/cl100k_base"),
      ]);
      encoderInstance = new tiktoken.Tiktoken(
        (rankModule.default ?? rankModule) as TiktokenBPE,
      );
    } catch (e) {
      console.warn("Failed to load the exact tokenizer; using estimate.", e);
      encoderInstance = null;
    }
    return encoderInstance;
  })();

  return loading;
}

/**
 * Counts the exact tokens using js-tiktoken cl100k_base.
 * Falls back to a word-count estimate until the encoder has loaded.
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  try {
    const enc = getTokenizer();
    if (enc) {
      return enc.encode(text).length;
    }
  } catch (e) {
    console.warn("js-tiktoken counting fallback:", e);
  }
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3);
}

/** Sensible starting point for the cost estimate (USD per 1M input tokens). */
export const DEFAULT_PRICE_PER_1M = 2.5;

/**
 * Local cost estimate. Tokenizer never calls a model provider - this is purely
 * `tokens x your configured price`, so the numbers stay meaningful whatever you use.
 */
export function estimateCostUSD(
  tokens: number,
  pricePer1M: number = DEFAULT_PRICE_PER_1M
): number {
  const price =
    Number.isFinite(pricePer1M) && pricePer1M >= 0 ? pricePer1M : DEFAULT_PRICE_PER_1M;
  return (tokens / 1_000_000) * price;
}
