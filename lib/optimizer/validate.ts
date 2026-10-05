import { ProtectedSpan } from "../types";
import { CONSTRAINT_KEYWORDS } from "./protect";

export interface ValidationReport {
  isValid: boolean;
  missingSpans: ProtectedSpan[];
  missingKeywords: string[];
  warning?: string;
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * Safety validation:
 * Verifies that:
 * 1. All protected spans (code blocks, numbers, URLs, file paths, variables, quoted text, constraint sentences)
 *    are present in the output.
 * 2. All constraint keywords from the original prompt survived in the output.
 */
export function validatePreservation(
  originalPrompt: string,
  compressedPrompt: string,
  originalSpans: ProtectedSpan[]
): ValidationReport {
  const missingSpans: ProtectedSpan[] = [];
  const missingKeywords: string[] = [];

  const normCompressed = normalizeWhitespace(compressedPrompt);

  // 1. Verify every protected span's original text exists in compressed prompt
  for (const span of originalSpans) {
    const spanText = span.original.trim();
    if (!spanText) continue;

    // Check direct substring
    if (compressedPrompt.includes(spanText)) {
      continue;
    }

    // Check whitespace-normalized substring
    const normSpan = normalizeWhitespace(spanText);
    if (normCompressed.includes(normSpan)) {
      continue;
    }

    // Check without trailing punctuation
    const strippedSpan = normSpan.replace(/[.!?]+$/, "").trim();
    if (normCompressed.includes(strippedSpan)) {
      continue;
    }

    missingSpans.push(span);
  }

  // 2. Verify all constraint keywords that existed in original prompt still exist
  const origLower = originalPrompt.toLowerCase();
  const compLower = compressedPrompt.toLowerCase();

  for (const kw of CONSTRAINT_KEYWORDS) {
    const kwRegex = new RegExp(`\\b${kw}\\b`, "i");
    if (kwRegex.test(origLower)) {
      if (!kwRegex.test(compLower)) {
        missingKeywords.push(kw);
      }
    }
  }

  const isValid = missingSpans.length === 0 && missingKeywords.length === 0;

  let warning: string | undefined;
  if (!isValid) {
    const reasons: string[] = [];
    if (missingSpans.length > 0) {
      reasons.push(
        `${missingSpans.length} protected item(s) altered: ${missingSpans.map((s) => s.type).join(", ")}`
      );
    }
    if (missingKeywords.length > 0) {
      reasons.push(`Lost constraint keyword(s): ${missingKeywords.join(", ")}`);
    }
    warning = `Safety check failed (${reasons.join("; ")}). Restoring safe baseline.`;
  }

  return {
    isValid,
    missingSpans,
    missingKeywords,
    warning,
  };
}
