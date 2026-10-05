import { DroppedUnit } from "../types";
import { CONSTRAINT_KEYWORDS } from "./protect";

/**
 * LOSSY COMPRESSION - deletes content.
 *
 * The only stage that removes meaning rather than wording. Opt-in (`lossy`
 * mode) and every removal is reported back so the UI can show exactly what was
 * thrown away.
 *
 * It runs on the *masked* text, where code, numbers, filenames and constraint
 * sentences are already `__TTP_*__` placeholders. That gives two guarantees for
 * free: a unit containing a placeholder is detectable and never dropped, and
 * dropped text can never contain protected content.
 *
 * A unit is droppable only if ALL of the following hold:
 *   - it is not a markdown heading         (removing one changes the outline)
 *   - it contains no protected span        (code, numbers, paths, quotes)
 *   - it contains no constraint keyword    (must/never/only/exactly/...)
 *   - it does not open with a task verb    (these carry the ask)
 *   - it is not the opening or closing line
 *   - it is NOT inside a requirements section (Deliverables/Constraints/...)
 *   - it overlaps >= RESTATEMENT_THRESHOLD with another unit in the document
 *     (only when `requireRedundancy` is on; with it off, an explicit savings
 *      target may instead drop the lowest-value non-required unit)
 *
 * That last condition is the whole design. Earlier versions ranked sentences
 * by a hand-tuned "information density" score and deleted whatever scored
 * lowest, which reliably removed the most important lines in a spec:
 * "Count tokens with a real tokenizer", "All source code, file by file",
 * "No API keys or provider credentials are ever stored". Short requirement
 * lines always score low, and short requirement lines are usually the point.
 *
 * Lexical overlap, by contrast, is evidence rather than a guess. If two units
 * say substantially the same words, one of them is genuinely redundant, so
 * removing one is safe regardless of which is "more valuable".
 */

export const HEADING = /^\s{0,3}#{1,6}\s/;

/**
 * Sections whose contents are requirements by definition. Nothing under one
 * of these headings is ever a candidate for deletion.
 */
export const REQUIREMENT_SECTION =
  /^\s{0,3}#{1,6}\s*\**\s*(?:deliverables?|constraints?|requirements?|non-?goals?|acceptance criteria|rules|guidelines|scope|musts?|must-?haves?|do|don'?ts?|assumptions?)\b/i;

/** Two units sharing at least this fraction of words are redundant. */
const RESTATEMENT_THRESHOLD = 0.45;

interface Unit {
  line: number;
  text: string;
}

function hasConstraintKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSTRAINT_KEYWORDS.some((kw) =>
    kw.includes(" ") ? lower.includes(kw) : new RegExp(`\\b${kw}\\b`, "i").test(lower),
  );
}

/**
 * Sentences that carry the actual ask. Dropping one of these leaves the model
 * without its instructions, which is far worse than saving a few tokens, so
 * they are never droppable regardless of how verbose they look.
 *
 * This was learned the hard way: an early version deleted "Start with a brief
 * architecture outline, then write all the code." - the single most important
 * line in the document.
 */
export const IMPERATIVE = /^\s*(?:please\s+)?(?:start|begin|build|create|write|make|implement|generate|produce|render|add|include|use|set|define|describe|explain|list|show|provide|give|return|output|ensure|do|then|first)\b/i;

/** Below this, a unit saves so few tokens that deleting it is not worth the risk. */
export const MIN_WORDS_TO_DROP = 6;

export function isDroppable(
  unit: string,
  isFirstUnit: boolean,
  isLastUnit: boolean,
  inRequirementSection: boolean,
): boolean {
  const trimmed = unit.trim();
  if (!trimmed) return false;

  // The opening statement establishes the role and the task.
  if (isFirstUnit) return false;
  // A closing instruction ("..., then write all the code") is the deliverable ask.
  if (isLastUnit && IMPERATIVE.test(trimmed)) return false;

  if (HEADING.test(trimmed)) return false;
  if (trimmed.includes("__TTP_")) return false;
  if (hasConstraintKeyword(trimmed)) return false;
  if (IMPERATIVE.test(trimmed)) return false;

  // Anything under "Deliverables", "Constraints", "Requirements" ... is by
  // definition a requirement, whatever it scores like.
  if (inRequirementSection) return false;

  // Too short to be worth the semantic risk.
  if (words(trimmed).length < MIN_WORDS_TO_DROP) return false;

  return true;
}

export function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Crude English stemmer, used only for redundancy detection.
 *
 * Without it, genuine restatements go undetected whenever the two phrasings
 * differ by an inflection - "no outbound call to any provider" and "no outbound
 * network calls to any provider" share almost nothing as raw word sets, so the
 * overlap score called them unique and refused to remove either.
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && (w.endsWith("ing") || w.endsWith("ed"))) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Word set used for overlap scoring. */
function wordSet(s: string): Set<string> {
  return new Set(words(s).map(stem));
}

/** Jaccard overlap between a word set and every other retained unit. */
function maxOverlap(set: Set<string>, others: Set<string>[]): number {
  let worst = 0;
  for (const other of others) {
    let inter = 0;
    for (const w of set) if (other.has(w)) inter++;
    const union = set.size + other.size - inter;
    if (union > 0) worst = Math.max(worst, inter / union);
  }
  return worst;
}

/**
 * Value score in [0, 1]; higher means "worth keeping". Three cheap, fully
 * deterministic signals: length, internal repetition, and how much the unit
 * restates something else in the document.
 */
function score(text: string, others: Set<string>[]): number {
  const ws = words(text);
  if (ws.length === 0) return 0;

  const lengthScore = Math.min(ws.length / 40, 1);
  const uniqueRatio = new Set(ws).size / ws.length;
  const overlap = maxOverlap(new Set(ws), others);

  return Math.max(0, Math.min(1, 0.55 * lengthScore + 0.25 * uniqueRatio + 0.2 * (1 - overlap)));
}

export interface LossyOptions {
  /** Stop once the masked text is at or below this many tokens. */
  targetTokens: number;
  countTokens: (text: string) => number;
  /** Hard cap: never remove more than this fraction of droppable units. */
  maxDropFraction?: number;
  /**
   * When true (the default) only units that provably restate another unit may
   * be deleted: a unit with no strong lexical counterpart is unique content,
   * and unique content is kept. When false, the lowest-value *non-required*
   * units may also be deleted so an explicit savings target can actually be
   * reached. Every structural rail (see isDroppable) still applies either way,
   * so requirements, constraints, headings and the opening/closing
   * instructions are never touched.
   */
  requireRedundancy?: boolean;
}

export interface LossyOutcome {
  text: string;
  dropped: DroppedUnit[];
  /** False when the target could not be reached without breaking the rails. */
  targetReached: boolean;
}

/**
 * Drops the lowest-value units until the target is met or nothing safe is left.
 * Never drops a heading, protected span, constraint sentence or opening line,
 * and never removes more than `maxDropFraction` of the droppable units.
 */
export function dropLowValueUnits(maskedText: string, options: LossyOptions): LossyOutcome {
  /**
   * Hard cap on how much may be deleted. Deleting more than this leaves a
   * prompt that no longer describes the task, which is worse than a smaller
   * saving - the earlier 0.6 default removed 17 units from a ~30-unit spec and
   * took the closing instructions with it.
   */
  const { targetTokens, countTokens, requireRedundancy = true } = options;
  // Explicit override wins. Otherwise, redundancy-only deletion is capped
  // conservatively at 0.5 (deleting restatements should feel safe), while an
  // explicit savings target may use every droppable unit - the rails in
  // isDroppable already guarantee that "droppable" excludes requirements,
  // constraints, headings, protected spans and the opening/closing ask.
  const maxDropFraction =
    options.maxDropFraction ?? (requireRedundancy ? 0.5 : 1.0);

  if (!maskedText || !maskedText.trim()) {
    return { text: maskedText, dropped: [], targetReached: true };
  }

  const lines = maskedText.split("\n");

  // Collect every candidate unit in document order, tracking which section it
  // sits under so requirement sections can be excluded wholesale.
  interface Candidate extends Unit {
    inRequirementSection: boolean;
  }
  const candidates: Candidate[] = [];
  let inRequirementSection = false;
  lines.forEach((line, lineIndex) => {
    if (HEADING.test(line)) {
      inRequirementSection = REQUIREMENT_SECTION.test(line);
      return;
    }
    if (!line.trim()) return;
    const push = (text: string) =>
      candidates.push({ line: lineIndex, text, inRequirementSection });
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      push(line.trim());
      return;
    }
    for (const s of line.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
      push(s);
    }
  });

  const eligible = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) =>
      isDroppable(c.text, i === 0, i === candidates.length - 1, c.inRequirementSection),
    );

  if (eligible.length === 0) {
    return { text: maskedText, dropped: [], targetReached: countTokens(maskedText) <= targetTokens };
  }

  // Redundancy is measured against *all* candidates, not just the eligible
  // ones - the sentence a unit duplicates may well be a protected requirement,
  // which is exactly why this unit is safe to drop.
  const allSets = candidates.map((c) => wordSet(c.text));
  const overlaps = candidates.map((_, i) =>
    maxOverlap(allSets[i], allSets.filter((_, j) => j !== i)),
  );

  // Which eligible units may actually be deleted. With `requireRedundancy` (the
  // default) only provable restatements qualify. When the caller explicitly
  // asks to reach a savings target (requireRedundancy: false) the lowest-value
  // non-required units are eligible too - every rail in isDroppable still holds.
  const selected = requireRedundancy
    ? eligible.filter(({ i }) => overlaps[i] >= RESTATEMENT_THRESHOLD)
    : eligible;

  const units = selected.map(({ c }) => c);
  const unitOverlap = selected.map(({ i }) => overlaps[i]);

  if (units.length === 0) {
    return {
      text: maskedText,
      dropped: [],
      targetReached: countTokens(maskedText) <= targetTokens,
    };
  }

  const sets = units.map((u) => new Set(words(u.text)));
  const ranked = units
    .map((unit, i) => ({
      unit,
      overlap: unitOverlap[i],
      score: score(unit.text, sets.filter((_, j) => j !== i)),
    }))
    .sort((a, b) => a.score - b.score); // lowest value first

  // The cap is measured against everything that was *eligible* to drop, not
  // against the redundancy-filtered subset. Sizing it from the filtered set made
  // the cap collapse to zero whenever the safe set was small - with one
  // qualifying unit, floor(1 * 0.5) = 0, so lossy silently did nothing.
  const maxDrops = Math.floor(eligible.length * maxDropFraction);
  const dropped: DroppedUnit[] = [];
  let working = maskedText;
  let drops = 0;

  for (const { unit, overlap } of ranked) {
    if (countTokens(working) <= targetTokens) break;
    if (drops >= maxDrops) break;

    lines[unit.line] = lines[unit.line]
      .replace(unit.text, "")
      .replace(/[ \t]{2,}/g, " ")
      .trimEnd();
    working = lines.join("\n");

    // Report the real reason: a unit either restates another point, or it was
    // the lowest-value optional line removed to reach an explicit target.
    dropped.push({
      text: unit.text,
      tokens: countTokens(unit.text),
      reason:
        overlap >= RESTATEMENT_THRESHOLD
          ? "duplicates another point"
          : "lowest-value optional content",
    });
    drops++;
  }

  // Drop lines emptied by the removals, then collapse runs of blank lines.
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

  // Removing a sentence can leave the next one starting in lower case
  // ("... came from. by usage (tokenizer, example)"). Restore the capital.
  const text = rebuilt
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(^|[.!?]\s+)(?![_\s(])[a-z]/g, (m) => m.slice(0, -1) + m.slice(-1).toUpperCase())
    .trim();

  return { text, dropped, targetReached: countTokens(text) <= targetTokens };
}
