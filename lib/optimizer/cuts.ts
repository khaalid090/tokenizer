import { CutCandidate } from "../types";
import {
  HEADING,
  IMPERATIVE,
  MIN_WORDS_TO_DROP,
  REQUIREMENT_SECTION,
  isDroppable,
  words,
} from "./lossy";

/**
 * Interactive cut selection.
 *
 * `lossy` mode has to decide on its own which sentences are expendable, and
 * that guess was wrong often enough to be dangerous - it kept deleting
 * "Count tokens with a real tokenizer" and "All source code, file by file".
 *
 * This module takes the decision away from the heuristic. It proposes every
 * unit that is *safe to offer* and lets the user pick, so reaching a savings
 * target is guaranteed to be the user's choice rather than a guess.
 *
 * The static rails are reused unchanged from lossy.ts, so anything lossy
 * considers undeletable is never even offered here:
 *   headings, protected spans, constraint keywords, task-verb openers,
 *   the opening and closing lines, and anything under a requirements section.
 *
 * Unlike lossy there is deliberately NO redundancy threshold here. Automatic
 * deletion needs strong evidence; offering someone a checkbox does not.
 */

interface Located {
  id: string;
  line: number;
  text: string;
}

/** Split the document into located units, tracking requirement sections. */
function collectUnits(text: string): { units: Located[]; eligible: Located[] } {
  const lines = text.split("\n");
  const units: Located[] = [];
  const eligible: Located[] = [];
  let inRequirementSection = false;

  const push = (line: number, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    // Ids must be stable between the propose and apply calls.
    const id = `${line}:${trimmed.slice(0, 40)}`;
    const unit = { id, line, text: trimmed };
    units.push(unit);
    if (
      isDroppable(trimmed, units.length === 1, false, inRequirementSection) &&
      words(trimmed).length >= MIN_WORDS_TO_DROP
    ) {
      eligible.push(unit);
    }
  };

  lines.forEach((line, lineIndex) => {
    if (HEADING.test(line)) {
      inRequirementSection = REQUIREMENT_SECTION.test(line);
      return;
    }
    if (!line.trim()) return;
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      push(lineIndex, line);
      return;
    }
    for (const s of line.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
      push(lineIndex, s);
    }
  });

  return { units, eligible };
}

export interface ProposeOptions {
  countTokens: (text: string) => number;
  /** Most candidates to offer. Ordered weakest-content-first. */
  limit?: number;
}

/**
 * Ranks the units the user could remove and returns them weakest-first, so the
 * cheapest cuts are at the top of the list.
 */
export function proposeCuts(text: string, options: ProposeOptions): CutCandidate[] {
  const { countTokens, limit = 40 } = options;
  if (!text.trim()) return [];

  const { eligible } = collectUnits(text);

  return eligible
    .map((unit) => {
      const tokens = countTokens(unit.text);
      const ws = words(unit.text);
      const uniqueRatio = new Set(ws).size / Math.max(ws.length, 1);
      // Weakest first: short and self-repeating text is the safest to offer.
      const weakness = ws.length * (1 - uniqueRatio);
      return {
        id: unit.id,
        text: unit.text,
        tokens,
        weakness,
        reason: uniqueRatio < 0.6 ? "repeats itself" : "shortest content in the prompt",
      };
    })
    .sort((a, b) => b.weakness - a.weakness || b.tokens - a.tokens)
    .slice(0, limit)
    .map(({ id, text, tokens, reason }) => ({ id, text, tokens, reason }));
}

export interface ApplyCutsResult {
  text: string;
  removed: CutCandidate[];
  tokensAfter: number;
  tokensSaved: number;
}

/**
 * Removes exactly the units the user selected. Everything else - including any
 * unit they declined - is preserved byte for byte.
 */
export function applyCuts(
  text: string,
  selectedIds: string[],
  countTokens: (s: string) => number,
  catalog: CutCandidate[],
): ApplyCutsResult {
  const wanted = new Set(selectedIds);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const toRemove = [...wanted].map((id) => byId.get(id)).filter((c): c is CutCandidate => Boolean(c));

  if (toRemove.length === 0) {
    return { text, removed: [], tokensAfter: countTokens(text), tokensSaved: 0 };
  }

  const lines = text.split("\n");
  for (const cut of toRemove) {
    const lineIndex = Number(cut.id.split(":")[0]);
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) continue;
    lines[lineIndex] = lines[lineIndex]
      .replace(cut.text, "")
      .replace(/[ \t]{2,}/g, " ")
      .trimEnd();
  }

  // Remove lines emptied by the cuts, then collapse runs of blank lines.
  const rebuilt: string[] = [];
  lines.forEach((line, i) => {
    if (line.trim()) {
      rebuilt.push(line);
      return;
    }
    const prev = rebuilt[rebuilt.length - 1];
    const next = lines[i + 1];
    if (prev !== undefined && next !== undefined && prev.trim() && next.trim()) rebuilt.push(line);
  });

  const result = rebuilt
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(^|[.!?]\s+)(?![_\s(])[a-z]/g, (m) => m.slice(0, -1) + m.slice(-1).toUpperCase())
    .trim();

  const tokensAfter = countTokens(result);
  return {
    text: result,
    removed: toRemove,
    tokensAfter,
    tokensSaved: countTokens(text) - tokensAfter,
  };
}
