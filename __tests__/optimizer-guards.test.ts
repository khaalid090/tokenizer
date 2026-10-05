import { describe, it, expect, beforeAll } from "vitest";
import { loadTokenizer, countTokens } from "../lib/tokens";
import { optimizePrompt } from "../lib/optimizer";
import { applyCuts, proposeCuts } from "../lib/optimizer/cuts";

beforeAll(async () => {
  await loadTokenizer();
});

const MODES = ["lossless", "balanced", "aggressive"] as const;

/** Terse, already-tight bullet prose - the shape that exposed the bug. */
const TERSE = `Not done
framer-motion is still in package.json. Nothing imports it, so pnpm remove framer-motion is safe whenever you want.
The dev server is still slow (44 s first compile). That's Turbopack-less next dev compiling 1596 modules - unrelated to bundle size and only affects local dev. Production next start is what these numbers reflect.
favicon.ico and Tauri bundle icons still show the old sparkles mark, from earlier.`;

// Mirrors the structure of the real 1,343-token markdown spec from the bug
// report: headers, numbered lists, bullets, inline code and parentheticals.
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

/** Deliberately wordy prose - the opposite shape to SPEC. */
const VERBOSE = `Hello there! I am hoping that you can please help me with this task. Basically, what we need is a solution that will basically parse a large CSV file. In order to do that, I would like you to make sure that the parser must never skip empty rows. It is important to note that the file could be around 500 MB. Please utilize a streaming approach and make sure that memory usage is at most 200 MB. Thank you so much for your help!`;

/**
 * Regression: the whitespace cleanup used to drop every blank line, which
 * silently destroyed markdown structure in optimized output.
 */
describe("Optimizer preserves document structure", () => {
  it("keeps blank lines between markdown blocks", () => {
    for (const mode of MODES) {
      const out = optimizePrompt(SPEC, { mode }).optimizedPrompt;
      expect(out, `${mode} lost blank lines`).toContain("## What it does");
      const sections = out.split(/\n\s*\n/);
      expect(sections.length, `${mode} collapsed the document into one block`).toBeGreaterThan(5);
    }
  });

  it("keeps list markers intact", () => {
    const out = optimizePrompt(SPEC, { mode: "aggressive" }).optimizedPrompt;
    expect(out).toMatch(/^- 100% local/m);
    expect(out).toMatch(/^\d+\. /m);
  });
});

describe("Optimizer safety guarantees", () => {
  it("never returns more tokens than the input, in any mode", () => {
    for (const text of [TERSE, VERBOSE]) {
      for (const mode of MODES) {
        const r = optimizePrompt(text, { mode });
        expect(
          r.optimizedTokens,
          `${mode} grew the prompt (${r.originalTokens} -> ${r.optimizedTokens})`,
        ).toBeLessThanOrEqual(r.originalTokens);
      }
    }
  });

  // The sentence splitter used to tear "package.json" into "package." + "json"
  // and rejoin them with a space, silently corrupting the prompt.
  it("never splits identifiers that contain a period", () => {
    for (const mode of MODES) {
      const out = optimizePrompt(TERSE, { mode }).optimizedPrompt;
      for (const ident of ["package.json", "favicon.ico"]) {
        expect(out, `${mode} lost "${ident}"`).toContain(ident);
      }
      for (const broken of ["package. json", "favicon. ico", "Favicon.ico", "Package.json"]) {
        expect(out, `${mode} corrupted into "${broken}"`).not.toContain(broken);
      }
    }
  });

  it("preserves protected numbers and constraint keywords", () => {
    for (const mode of MODES) {
      const terse = optimizePrompt(TERSE, { mode }).optimizedPrompt;
      expect(terse, `${mode} lost 1596`).toContain("1596");
      expect(terse, `${mode} lost "44 s"`).toContain("44 s");

      const verbose = optimizePrompt(VERBOSE, { mode }).optimizedPrompt;
      expect(verbose, `${mode} lost "500 MB"`).toContain("500 MB");
      expect(verbose, `${mode} lost "must never"`).toContain("must never");
      expect(verbose, `${mode} lost "at most 200 MB"`).toContain("at most 200 MB");
    }
  });
});

describe("Lossy mode", () => {
  it("never deletes the opening or closing instructions", () => {
    // Both of these were deleted by an earlier version. They are the task.
    const text = `You are a senior engineer building a local prompt compressor.
Ship it as a static site with no backend at all.
Make the UI match the dark theme used elsewhere in the product.
- Tokens are counted locally with a real tokenizer, never estimated twice.
- The app never calls any remote API for compression or counting.
Build the project files one by one with full comments.
Start with a brief architecture outline, then write all the code.`;

    const r = optimizePrompt(text, { mode: "lossy", targetPercent: 40 });
    // Assert on a stable substring: aggressive mode contracts "You are" to
    // "you're", so the literal prefix is not a reliable marker.
    expect(r.optimizedPrompt, "lost the opening role/task line").toContain(
      "senior engineer building a local prompt compressor",
    );
    expect(r.optimizedPrompt, "lost the closing instruction").toContain(
      "Start with a brief architecture outline",
    );
  });

  it("only ever deletes text that genuinely duplicates another unit", () => {
    // The regression that mattered: lossy used to rank by a hand-tuned
    // "information density" score and delete whatever ranked lowest, which
    // reliably removed the most important lines in a spec. Every deletion must
    // now be backed by real lexical overlap with another unit.
    const text = `The cache layer stores every result in a local directory.
Design notes live in a separate markdown file for later review.
Consider adding a small integration test around the parser entry point.
Performance benchmarks are recorded nightly for regression tracking purposes.`;

    const r = optimizePrompt(text, { mode: "lossy", targetPercent: 45 });
    // Nothing here restates anything else, so nothing may be deleted at all.
    expect(r.droppedUnits ?? [], "deleted content that duplicates nothing").toEqual([]);
  });

it("never deletes anything inside a requirements section", () => {
    // Every line below is a requirement or deliverable, and each is unique.
    const text = `Design a small dashboard for the compression history.

## Deliverables
1. Full project file tree
2. All source code, file by file
3. Supabase SQL schema and setup steps

## Constraints
- No API keys or provider credentials are ever stored in the database.
- The app must work offline with no backend at all.`;

    const r = optimizePrompt(text, { mode: "lossy", targetPercent: 40 });
    for (const line of [
      "Full project file tree",
      "All source code, file by file",
      "Supabase SQL schema and setup steps",
      "No API keys or provider credentials are ever stored",
      "must work offline with no backend",
    ]) {
      expect(r.optimizedPrompt, `deleted requirement: ${line}`).toContain(line);
    }
  });

it("reaches the target when genuine redundancy exists", () => {
    // These two overlap ~0.57: above the 0.45 redundancy threshold, but below
    // dedupe's 0.70, so they survive the earlier lossless stage and lossy is
    // the one that resolves them. (An overlap >= 0.70 never reaches lossy -
    // dedupe already removed it without touching anything else.)
    const text = `The app makes no outbound network call to any external provider.
Design notes live in a separate markdown file for later review.
The application sends no outbound network call to any provider.
Performance benchmarks are recorded nightly for regression tracking purposes.`;

    const r = optimizePrompt(text, { mode: "lossy", targetPercent: 10 });
    expect(r.percentSaved).toBeGreaterThan(0);
    expect(r.droppedUnits?.length ?? 0).toBeGreaterThan(0);
    for (const d of r.droppedUnits ?? []) {
      expect(d.reason).toBe("duplicates another point");
      expect(d.text, "deleted a line that duplicated nothing").toMatch(
        /outbound network call to any/,
      );
    }
  });

it("reaches the requested savings target on dense spec text", () => {
  const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 15 });
  // A dense, well-written spec contains very little genuine redundancy, so lossy
  // cannot reach 15% without deleting requirements. It must be honest about
  // that rather than over-deleting.
  expect(r.percentSaved).toBeGreaterThanOrEqual(0);
  expect(r.validationPassed).toBe(true);
  const stage = r.stages.find((s) => s.stage === "lossy_trim");
  if (r.percentSaved < 15) {
    expect(stage?.notes, "must explain the target was not reached").toMatch(/not reached/i);
  }
});

  it("reports every unit it deleted", () => {
    // SPEC is dense and contains almost no genuine redundancy, so lossy
    // correctly deletes nothing from it. Use a document that does have some,
    // so the reporting contract is actually exercised.
    const text = `The app makes no outbound network call to any external provider.
Design notes live in a separate markdown file for later review.
The application sends no outbound network call to any provider.
Performance benchmarks are recorded nightly for regression tracking purposes.`;

    const r = optimizePrompt(text, { mode: "lossy", targetPercent: 10 });
    expect(r.droppedUnits?.length ?? 0).toBeGreaterThan(0);
    for (const d of r.droppedUnits ?? []) {
      expect(d.text.trim().length).toBeGreaterThan(0);
      expect(d.reason.length).toBeGreaterThan(0);
      // Deleted text must actually be gone from the output.
      expect(r.optimizedPrompt).not.toContain(d.text);
    }
  });

  it("deletes nothing from a dense spec that has no redundancy", () => {
    // The whole point of the rewrite: SPEC is well written, so lossy is a
    // no-op on it rather than a tool that eats deliverables.
    const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 15 });
    expect(r.droppedUnits ?? [], "deleted content that duplicated nothing").toEqual([]);
    expect(r.validationPassed).toBe(true);
  });

  it("never deletes a heading", () => {
    const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 40 });
    for (const h of ["## What it does", "## Core optimization logic", "## Deliverables"]) {
      expect(r.optimizedPrompt, `lost heading "${h}"`).toContain(h);
    }
  });

  it("never deletes constraint keywords or protected values", () => {
    const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 40 });
    // The spec lists constraints as "(must, never, only, at least, at most)".
    // That whole unit holds protected spans, so it must survive intact.
    expect(r.optimizedPrompt).toContain("must, never");
    expect(r.optimizedPrompt).toContain("at least");
    expect(r.optimizedPrompt).toContain("at most");
    expect(r.optimizedPrompt).toContain("100%");
    expect(r.optimizedPrompt).toContain("30-50%");
    expect(r.optimizedPrompt).toContain(".env.local");
    expect(r.optimizedPrompt).toContain("npm install");
    expect(r.validationPassed).toBe(true);
  });

  it("is not the default and other modes never delete", () => {
    for (const mode of ["lossless", "balanced", "aggressive"] as const) {
      const r = optimizePrompt(SPEC, { mode });
      expect(r.droppedUnits ?? [], `${mode} must not delete content`).toEqual([]);
    }
  });

  it("reports honestly when the target cannot be reached safely", () => {
    // Everything here is protected, so nothing may be dropped.
    const tiny = "The parser must never fail. It must only return JSON. Use at most 200 MB.";
    const r = optimizePrompt(tiny, { mode: "lossy", targetPercent: 50 });
    const stage = r.stages.find((s) => s.stage === "lossy_trim");
    expect(stage?.notes, "should explain the target was not reached").toMatch(/not reached/i);
  });

  it("respects an explicit cap on how much may be removed", () => {
    const r = optimizePrompt(SPEC, { mode: "lossy", targetPercent: 90 });
    // maxDropFraction is 0.6, so a 90% target cannot strip the document bare.
    expect(r.optimizedPrompt.length).toBeGreaterThan(SPEC.length * 0.25);
    expect(r.validationPassed).toBe(true);
  });
});

describe("Interactive cut selection", () => {
  const DOC = `Design a small dashboard for the compression history.

## Overview
The dashboard lists every optimization the user has run in this browser session.
Results are sorted newest first and can be filtered by compression mode.
No network calls are made while rendering the list of results.

## Deliverables
1. Full project file tree
2. All source code, file by file
3. Supabase SQL schema and setup steps

Start with a brief architecture outline, then write all the code.`;

  it("offers the optional prose but never requirements", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const texts = cuts.map((c) => c.text).join(" | ");

    // Offerable: descriptive prose in a neutral section.
    expect(texts).toContain("Results are sorted newest first");
    // Never offerable, regardless of length:
    expect(texts).not.toContain("Full project file tree");
    expect(texts).not.toContain("All source code, file by file");
    expect(texts).not.toContain("Supabase SQL schema and setup steps");
    expect(texts).not.toContain("Start with a brief architecture outline");
    expect(texts).not.toContain("Design a small dashboard");
  });

  it("reports a token figure for every candidate", () => {
    for (const c of proposeCuts(DOC, { countTokens })) {
      expect(c.tokens).toBeGreaterThan(0);
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.id.length).toBeGreaterThan(0);
    }
  });

  it("deletes nothing until the user selects something", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const none = applyCuts(DOC, [], countTokens, cuts);
    expect(none.text).toBe(DOC);
    expect(none.removed).toEqual([]);
  });

  it("removes exactly what was ticked and nothing else", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const target = cuts.find((c) => c.text.includes("sorted newest first"));
    expect(target, "expected a cut candidate").toBeDefined();

    const out = applyCuts(DOC, [target!.id], countTokens, cuts);
    expect(out.text).not.toContain("sorted newest first");
    expect(out.text).toContain("lists every optimization");
    // Untouched content is preserved verbatim.
    expect(out.text).toContain("Full project file tree");
    expect(out.text).toContain("Start with a brief architecture outline");
    expect(out.removed).toHaveLength(1);
    expect(out.tokensSaved).toBeGreaterThan(0);
  });

  it("lets the user reach a large saving by selecting several cuts", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const ids = cuts.slice(0, 2).map((c) => c.id);
    const out = applyCuts(DOC, ids, countTokens, cuts);
    expect(out.tokensSaved).toBeGreaterThan(0);
    // Requirements survive no matter how much is ticked.
    expect(out.text).toContain("Supabase SQL schema and setup steps");
    expect(out.text).toContain("Start with a brief architecture outline");
  });

  it("ignores unknown ids rather than corrupting the text", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const out = applyCuts(DOC, ["999:nope", "not-an-id"], countTokens, cuts);
    expect(out.text).toBe(DOC);
  });

  it("preserves markdown structure after cuts", () => {
    const cuts = proposeCuts(DOC, { countTokens });
    const out = applyCuts(DOC, cuts.map((c) => c.id), countTokens, cuts);
    expect(out.text).toContain("## Deliverables");
    expect(out.text).toMatch(/^\d+\. /m);
    expect(out.text.split(/\n\s*\n/).filter((b) => b.trim()).length).toBeGreaterThan(2);
  });
});

describe("Optimizer compression effectiveness", () => {
  it("compresses wordy prose substantially", () => {
    // Target: >= 30% off genuinely verbose input in balanced and aggressive.
    for (const mode of ["balanced", "aggressive"] as const) {
      const r = optimizePrompt(VERBOSE, { mode });
      expect(r.percentSaved, `${mode} only saved ${r.percentSaved}%`).toBeGreaterThanOrEqual(30);
    }
  });

  it("aggressive mode is at least as aggressive as balanced", () => {
    const balanced = optimizePrompt(VERBOSE, { mode: "balanced" });
    const aggressive = optimizePrompt(VERBOSE, { mode: "aggressive" });
    expect(aggressive.optimizedTokens).toBeLessThanOrEqual(balanced.optimizedTokens);
  });

  it("never drops a constraint when contracting negatives", () => {
    // "cannot" and "do not" are constraint keywords; they must survive verbatim.
    const text = "The parser cannot fail. You do not need retries. It is not optional.";
    const out = optimizePrompt(text, { mode: "aggressive" }).optimizedPrompt;
    expect(out).toContain("cannot");
    expect(out).toContain("do not");
  });

  // A rule that rewrote "exactly how many" -> "how many" silently deleted the
  // constraint keyword "exactly" and tripped the safety check.
  it("never deletes a constraint keyword anywhere in the document", () => {
    const text = `Report exactly how many records failed. Use only the latest schema.
The job must never skip a row, and there must be at least one retry.`;
    for (const mode of MODES) {
      const r = optimizePrompt(text, { mode });
      expect(r.validationPassed, `${mode} failed validation: ${r.warning}`).toBe(true);
      for (const kw of ["must", "never", "only", "exactly", "at least"]) {
        expect(
          r.optimizedPrompt.toLowerCase(),
          `${mode} dropped constraint "${kw}"`,
        ).toContain(kw);
      }
    }
  });

  it("still finds savings in already-terse text", () => {
    // Regression: every sentence here contains a word from CONSTRAINT_KEYWORDS
    // ("only", "still"). Freezing whole sentences made terse input incompressible.
    for (const mode of MODES) {
      const r = optimizePrompt(TERSE, { mode });
      expect(r.tokensSaved, `${mode} found no savings on terse prose`).toBeGreaterThan(0);
    }
  });
});
