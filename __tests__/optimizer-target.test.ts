import { describe, it, expect, beforeAll } from "vitest";
import { loadTokenizer } from "../lib/tokens";
import { optimizePrompt } from "../lib/optimizer";
import { SAMPLE_PROMPTS } from "../lib/sample-prompts";

beforeAll(async () => {
  await loadTokenizer();
});

// A dense, requirement-heavy markdown spec - the shape that used to compress by
// a mere 1%. Almost every line is a requirement, constraint or deliverable.
const SPEC = `You are a senior full-stack engineer and UI/UX designer. Build a complete, working web app called "TokenTrim": an AI Token Optimization tool that compresses prompts before the user sends them anywhere, and shows exactly how many tokens and how much cost that saves.

## What it does (important: this app does NOT call any AI model)

User pastes a prompt -> TokenTrim analyzes and compresses it -> shows original vs optimized side by side with a diff and token/cost savings -> user copies the optimized prompt and pastes it into ChatGPT, Claude, Kimi, or their own app. There is no API key field anywhere and no outbound call to any AI provider.

## Core optimization logic

Build a compression pipeline that runs on the prompt text, in this order:
1. Normalize: strip filler words, pleasantries ("please", "could you kindly"), hedging words, repeated punctuation, extra whitespace.
2. Deduplicate: detect repeated or near-duplicate sentences and redundant context; keep only one copy of each idea.
3. Restructure: turn verbose paragraphs into a compact Task / Context / Constraints / Output format.
4. Safety validation: never alter code blocks, URLs, numbers, file paths, quoted text, variable names, or constraint sentences (must, never, only, at least, at most).

## Constraints and non-goals
- 100% local. No outbound network calls. No API key anywhere.
- No placeholder code - everything must run with \`npm install && npm run dev\`.
- Meaning preservation over compression: when unsure, keep the original wording.
- Handle errors gracefully (empty prompt, huge input, Supabase not configured - app should still work locally without login).
- Show 2-3 sample prompts on the home screen demonstrating 30-50% savings, usable without signing in.

## Deliverables
1. Full project file tree
2. All source code, file by file
3. Supabase SQL schema and setup steps
4. Setup instructions (including .env.local)
5. Three before/after demo examples with real token counts

Start with a brief architecture outline, then write all the code.`;

describe("Lossy savings target", () => {
  it("stays redundancy-only by default (deletes nothing from a dense spec)", () => {
    const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 30 });
    expect(r.droppedUnits ?? [], "default lossy must not delete unique content").toEqual([]);
    expect(r.validationPassed).toBe(true);
  });

  it("an explicit target may drop optional lines but keeps every requirement", () => {
    const r = optimizePrompt(SPEC, {
      mode: "lossy",
      targetPercent: 30,
      requireRedundancy: false,
    });

    // Meaningfully better than the old ~1-3%, even on a requirement-dense spec.
    expect(r.percentSaved).toBeGreaterThanOrEqual(20);
    expect(r.validationPassed).toBe(true);
    expect((r.droppedUnits ?? []).length).toBeGreaterThan(0);

    // Every structural rail survives: headings, the opening role/task line, the
    // closing ask, deliverables and constraint keywords.
    for (const kept of [
      "senior full-stack engineer",
      "## What it does",
      "## Core optimization logic",
      "## Constraints and non-goals",
      "## Deliverables",
      "Full project file tree",
      "All source code, file by file",
      "Supabase SQL schema and setup steps",
      "must, never",
      "at least",
      "at most",
      "Start with a brief architecture outline",
    ]) {
      expect(r.optimizedPrompt, `dropped required content: ${kept}`).toContain(kept);
    }

    // Every deletion is reported, and the removed text really is gone.
    for (const d of r.droppedUnits ?? []) {
      expect(d.text.trim().length).toBeGreaterThan(0);
      expect(d.reason.length).toBeGreaterThan(0);
      expect(r.optimizedPrompt).not.toContain(d.text);
    }
  });
});

describe("Savings on verbose long prompts", () => {
  it("reaches at least 30% in balanced mode on a verbose prompt", () => {
    const verbose = SAMPLE_PROMPTS[0];
    const r = optimizePrompt(verbose.prompt, { mode: "balanced" });
    expect(r.percentSaved, `only saved ${r.percentSaved}%`).toBeGreaterThanOrEqual(30);
  });
});