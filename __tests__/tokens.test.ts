import { describe, it, expect, beforeAll } from "vitest";
import { countTokens, getTokenizer, loadTokenizer } from "../lib/tokens";

/**
 * Guards the `js-tiktoken/lite` + single-rank import in lib/tokens.ts.
 * The encoder now loads asynchronously, so the suite awaits it before asserting
 * exact counts. Switching the encoding source is only safe if it yields counts
 * identical to the old `getEncoding("cl100k_base")` root import.
 */
describe("Tokenizer encoding (lite + cl100k_base rank)", () => {
  beforeAll(async () => {
    await loadTokenizer();
  });

  it("loads a real encoder rather than falling back to word-count estimation", () => {
    expect(getTokenizer()).not.toBeNull();
  });

  it("matches known cl100k_base token counts", () => {
    expect(countTokens("")).toBe(0);
    expect(countTokens("hello world")).toBe(2);
    expect(countTokens("The quick brown fox jumps over the lazy dog")).toBe(9);
  });

  it("distinguishes real tokenization from the x1.3 word-count fallback", () => {
    // The fallback computes ceil(words * 1.3), which cannot produce these
    // values: punctuation splits into separate tokens under cl100k_base.
    expect(countTokens("const x = foo(bar, baz);")).toBe(8);
    expect(countTokens("a.b.c.d")).toBe(4);
  });

  it("handles long and unicode input without throwing", () => {
    expect(countTokens("token ".repeat(500))).toBeGreaterThan(500);
    expect(countTokens("你好世界 🌍 مرحبا")).toBeGreaterThan(0);
  });
});
