import { describe, it, expect } from "vitest";
import { optimizePrompt } from "../lib/optimizer";
import { extractProtectedSpans, restoreProtectedSpans } from "../lib/optimizer/protect";
import { normalize } from "../lib/optimizer/normalize";
import { deduplicate } from "../lib/optimizer/dedupe";
import { optimizeHistory } from "../lib/optimizer/history";
import { countTokens, loadTokenizer } from "../lib/tokens";
import { beforeAll } from "vitest";

// The encoder now loads asynchronously (it is a large chunk pulled in after
// first paint). Await it so optimizePrompt() and countTokens() below run
// against real cl100k_base counts rather than the word-count estimate.
beforeAll(async () => {
  await loadTokenizer();
});

describe("Tokenizer Optimizer Pipeline", () => {
  it("preserves code blocks without alteration", () => {
    const prompt = `Hello, could you please take a look at my code?
\`\`\`typescript
function calculateSum(a: number, b: number): number {
  return a + b;
}
\`\`\`
Thanks so much!`;

    const result = optimizePrompt(prompt, { mode: "balanced" });
    expect(result.optimizedPrompt).toContain("function calculateSum");
    expect(result.optimizedPrompt).toContain("return a + b;");
    expect(result.validationPassed).toBe(true);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("preserves inline code, file paths, numbers, and URLs", () => {
    const prompt = `Please inspect \`src/config.json\` at https://api.example.com/v1 and verify that the count is exactly 42 on 2026-09-28.`;
    const result = optimizePrompt(prompt, { mode: "balanced" });

    expect(result.optimizedPrompt).toContain("`src/config.json`");
    expect(result.optimizedPrompt).toContain("https://api.example.com/v1");
    expect(result.optimizedPrompt).toContain("42");
    expect(result.optimizedPrompt).toContain("2026-09-28");
    expect(result.optimizedPrompt).toContain("exactly");
    expect(result.validationPassed).toBe(true);
  });

  it("preserves sentences containing critical constraint keywords: must, never, always, only, exactly, at least, at most, do not", () => {
    const prompt = `
Hi there! I would appreciate your help.
You must never disclose secretApiKey.
You always have to return responses in JSON format.
There must be at least 5 elements and at most 10 elements.
Do not use any external dependencies.
`;
    const result = optimizePrompt(prompt, { mode: "balanced" });

    expect(result.optimizedPrompt).toContain("must never disclose secretApiKey");
    expect(result.optimizedPrompt).toContain("always have to return responses in JSON format");
    expect(result.optimizedPrompt).toContain("at least 5 elements and at most 10 elements");
    expect(result.optimizedPrompt).toContain("Do not use any external dependencies");
    expect(result.validationPassed).toBe(true);
  });

  it("successfully deduplicates repeated sentences and instructions", () => {
    const prompt = `Make sure the output is written in Python. Make sure the output is written in Python. Also verify the tests pass.`;
    const deduped = deduplicate(prompt, "balanced");
    expect(deduped.match(/written in Python/g)?.length).toBe(1);
  });

  it("normalizes pleasantries, filler phrases and hedging", () => {
    const input = "Hello there! Could you please kindly help me in order to do this? As a matter of fact, it is important to note that this is fast.";
    const normalized = normalize(input, "balanced");
    expect(normalized.toLowerCase()).not.toContain("could you please kindly");
    expect(normalized).not.toContain("in order to");
    expect(normalized).toContain("to");
  });

  it("handles conversation history optimization", () => {
    const messages = [
      { id: "1", role: "system" as const, content: "You are a helpful coding tutor." },
      { id: "2", role: "user" as const, content: "Hi" },
      { id: "3", role: "assistant" as const, content: "Hello! How can I help you today?" },
      { id: "4", role: "user" as const, content: "I am writing a Python script to parse CSV files." },
      { id: "5", role: "assistant" as const, content: "You can use Python's built-in csv module or pandas." },
      { id: "6", role: "user" as const, content: "How do I filter rows where age > 25 in pandas?" },
    ];

    const result = optimizeHistory(messages, "pandas filtering age query", 2);
    expect(result.optimizedMessages.length).toBeLessThan(messages.length);
    // Recent query preserved
    expect(result.optimizedMessages.some((m) => m.content.includes("age > 25"))).toBe(true);
  });

  it("accurate token counting with js-tiktoken", () => {
    const count = countTokens("Hello world! This is TokenTrim token counting.");
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe("number");
  });
});
