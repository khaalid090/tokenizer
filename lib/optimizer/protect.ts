import { CompressionMode, ProtectedSpan } from "../types";

export const CONSTRAINT_KEYWORDS = [
  "must",
  "never",
  "always",
  "only",
  "exactly",
  "at least",
  "at most",
  "do not",
  "don't",
  "shall not",
  "cannot",
];

function splitIntoSentenceTokens(text: string): string[] {
  // Regex to split on sentence boundary while not splitting on URLs or abbreviations
  // We match sentences ending with period/exclamation/question followed by space or newline, or newlines
  const tokens: string[] = [];
  let current = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    current += char;

    if (char === "\n") {
      tokens.push(current);
      current = "";
      i++;
      continue;
    }

    if (char === "." || char === "!" || char === "?") {
      // Check if this dot is part of a URL (e.g. .com or .org) or number (3.14) or next is not whitespace
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];

      // If nextChar is whitespace or end of string, and not preceded by common abbreviation or inside number
      const isNumber = /\d/.test(prevChar || "") && /\d/.test(nextChar || "");
      const isUrlPattern = /[a-zA-Z0-9]/.test(prevChar || "") && /[a-zA-Z0-9]/.test(nextChar || "");

      if (!isNumber && !isUrlPattern && (nextChar === " " || nextChar === "\n" || nextChar === "\r" || nextChar === undefined)) {
        tokens.push(current);
        current = "";
      }
    }
    i++;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Extracts and replaces protected spans with unique tokens.
 * NEVER alter:
 * - code blocks
 * - inline code
 * - URLs
 * - file paths
 * - numbers
 * - dates
 * - quoted text
 * - constraint sentences
 * - variable names
 */
export function extractProtectedSpans(
  text: string,
  // Freezing whole constraint sentences keeps `lossless` perfectly safe, but it also
  // means any sentence containing a word like "only" can never be compressed.
  // "only" is far too common in ordinary prose to treat as a hard constraint
  // (e.g. "unrelated to bundle size and only affects local dev"). Balanced and
  // aggressive modes therefore skip the whole-sentence freeze and rely on
  // validatePreservation() to confirm the constraint keywords still survive.
  mode: CompressionMode = "lossless",
): {
  maskedText: string;
  spans: ProtectedSpan[];
} {
  const spans: ProtectedSpan[] = [];
  let spanCounter = 0;

  function createPlaceholder(type: ProtectedSpan["type"]): string {
    return `__TTP_${type.toUpperCase()}_${spanCounter++}__`;
  }

  let working = text;

  // 1. Code blocks (```...```)
  working = working.replace(/```[\s\S]*?```/g, (match) => {
    const ph = createPlaceholder("code_block");
    spans.push({ id: ph, placeholder: ph, type: "code_block", original: match });
    return ph;
  });

  // 2. URLs first before sentence split so dots in domains aren't split
  working = working.replace(
    /\b(?:https?:\/\/|www\.)[^\s<>'")]+/gi,
    (match) => {
      const ph = createPlaceholder("url");
      spans.push({ id: ph, placeholder: ph, type: "url", original: match });
      return ph;
    }
  );

  // 3. Inline code (`...`)
  working = working.replace(/`[^`\r\n]+`/g, (match) => {
    const ph = createPlaceholder("inline_code");
    spans.push({ id: ph, placeholder: ph, type: "inline_code", original: match });
    return ph;
  });

  // 4. File paths
  //
  // Two alternatives. The first catches paths that begin with a slash, a drive
  // letter or "./". The second catches *bare* filenames such as "package.json"
  // or "favicon.ico" - previously unprotected, which let later stages corrupt
  // them (sentence-splitting turned them into "package. json", and
  // sentence-capitalisation turned them into "Favicon.ico"). The extension is
  // restricted to a known list so ordinary prose ("e.g.", "U.S.") is not
  // mistaken for a filename.
  working = working.replace(
    /(?:[a-zA-Z]:\\|\/|\.\.?\/)[a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]{1,8}\b|\b[A-Za-z0-9_-]{1,32}\.(?:json|ico|icns|png|jpe?g|svg|gif|webp|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|md|txt|rs|toml|lock|ya?ml|sql|py|go|java|kt|rb|php|c|cc|cpp|h|hpp|sh|bash|bat|ps1|env|ini|cfg|conf|xml|pdf|zip|tar|gz|wasm)\b|(?<![\w.])\.[A-Za-z0-9_-]{1,32}(?:\.[A-Za-z0-9_-]{1,16})?/gi,
    (match) => {
      const ph = createPlaceholder("file_path");
      spans.push({ id: ph, placeholder: ph, type: "file_path", original: match });
      return ph;
    }
  );

  // 5. Quoted text ("..." or '...')
  working = working.replace(
    /"([^"\r\n]{2,})"/g,
    (match) => {
      const ph = createPlaceholder("quoted_text");
      spans.push({ id: ph, placeholder: ph, type: "quoted_text", original: match });
      return ph;
    }
  );

  // 6. Constraint sentences
  //    Freezing whole sentences is safest, but it also blocks compression of
  //    ordinary prose - "only" alone appears in most specs. Only `lossless`
  //    freezes them; the other modes rely on validatePreservation() to confirm
  //    the constraint keywords survive. Steps 7-9 (dates, variables, numbers)
  //    always run - an earlier version returned early here and silently dropped
  //    number/date protection in balanced and aggressive mode.
  if (mode === "lossless") {
    const sentenceTokens = splitIntoSentenceTokens(working);
    const processedSentenceTokens = sentenceTokens.map((segment) => {
      if (!segment.trim() || /^\s*__TTP_/.test(segment)) return segment;

      const lower = segment.toLowerCase();
      const hasConstraint = CONSTRAINT_KEYWORDS.some((kw) => {
        if (kw === "at least" || kw === "at most" || kw === "do not" || kw === "shall not") {
          return lower.includes(kw);
        }
        return new RegExp(`\\b${kw}\\b`, "i").test(lower);
      });

      if (hasConstraint && segment.trim().length > 3) {
        const ph = createPlaceholder("constraint_sentence");
        spans.push({ id: ph, placeholder: ph, type: "constraint_sentence", original: segment });
        return ph;
      }
      return segment;
    });
    working = processedSentenceTokens.join("");
  }

  // 7. Dates
  working = working.replace(
    /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?,? \d{4})\b/gi,
    (match) => {
      const ph = createPlaceholder("date");
      spans.push({ id: ph, placeholder: ph, type: "date", original: match });
      return ph;
    }
  );

  // 8. Variable names
  working = working.replace(
    /\b([a-z]+[A-Z0-9][a-zA-Z0-9]*|[A-Z]{2,}_[A-Z0-9_]+|[a-z0-9]+_[a-z0-9_]+)\b/g,
    (match) => {
      if (match.startsWith("__TTP_")) return match;
      const ph = createPlaceholder("variable_name");
      spans.push({ id: ph, placeholder: ph, type: "variable_name", original: match });
      return ph;
    }
  );

  // 9. Numbers
  working = working.replace(
    /(?:[\$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/g,
    (match) => {
      if (/^__TTP_/.test(match)) return match;
      const ph = createPlaceholder("number");
      spans.push({ id: ph, placeholder: ph, type: "number", original: match });
      return ph;
    }
  );

  return { maskedText: working, spans };
}

/**
 * Restores all extracted protected spans back into the text recursively until no placeholders remain.
 */
export function restoreProtectedSpans(text: string, spans: ProtectedSpan[]): string {
  let restored = text;
  const spanMap = new Map<string, string>();
  for (const s of spans) {
    spanMap.set(s.placeholder, s.original);
  }

  // Loop to resolve any nested placeholders
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    for (const [placeholder, original] of spanMap.entries()) {
      if (restored.includes(placeholder)) {
        restored = restored.split(placeholder).join(original);
        changed = true;
      }
    }
  }

  return restored;
}
