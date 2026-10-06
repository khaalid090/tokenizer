import { CompressionMode, DroppedUnit, OptimizationResult, PipelineStageResult } from "../types";
import { countTokens, estimateCostUSD, DEFAULT_PRICE_PER_1M } from "../tokens";
import { canUseMode } from "../license";
import { extractProtectedSpans, restoreProtectedSpans } from "./protect";
import { normalize } from "./normalize";
import { compressPhrases } from "./compress";
import { deduplicate } from "./dedupe";
import { restructure } from "./restructure";
import { trimOutputRequirements } from "./output-trim";
import { validatePreservation } from "./validate";
import { getFullyResolvedSpans } from "./span-resolver";
import { dropLowValueUnits } from "./lossy";

export interface OptimizeOptions {
  mode?: CompressionMode;
  pricePer1M?: number;
  /**
   * Savings goal for `lossy` mode, as a percentage (30 = aim for 30% off).
   * Ignored by every other mode. Defaults to 30.
   */
  targetPercent?: number;
  /**
   * `lossy` only. When true (the default) deletions are limited to units that
   * provably restate another unit. Set false to let lossy drop the lowest-value
   * non-required lines so an explicit savings target is actually reached. The
   * structural rails (requirements, constraints, headings, opening/closing) are
   * honoured in both cases.
   */
  requireRedundancy?: boolean;
}

/** Percentage of tokens `lossy` mode aims to remove. */
export const DEFAULT_LOSSY_TARGET_PERCENT = 30;

/**
 * Full prompt compression pipeline:
 * Step 1: Protected spans extraction (Never alter code, numbers, dates, paths, quotes, variables, constraints)
 * Step 2: Normalize (whitespace, filler words, pleasantries, repeated punct)
 * Step 3: Deduplicate (repeated sentences, near duplicate context)
 * Step 4: Restructure (verbose prose to structured Task / Context / Constraints / Output)
 * Step 5: Output requirement trimming (wordy generic demands)
 * Step 6: Restore protected spans
 * Step 7: Safety validation -> fallback if any protected span or constraint was altered
 */
export function optimizePrompt(
  prompt: string,
  options: OptimizeOptions = {}
): OptimizationResult {
  const mode = options.mode || "balanced";
  const pricePer1M = options.pricePer1M ?? DEFAULT_PRICE_PER_1M;

  // License gate. `lossy` is the only mode that deletes content, so it is
  // reserved for paid users. Free users fall back to `aggressive` (the most
  // compression the free tier allows) and get a warning saying so, rather than
  // silently running a destructive pass or throwing mid-pipeline.
  let gatedNotice: string | undefined;
  let effectiveMode = mode;
  if (mode === "lossy" && !canUseMode(mode)) {
    effectiveMode = "aggressive";
    gatedNotice =
      "Lossy is a Pro feature — you ran the most aggressive free mode instead. Upgrade in Settings to delete low-value content.";
  }

  if (!prompt || !prompt.trim()) {
    return {
      originalPrompt: prompt,
      optimizedPrompt: prompt,
      mode,
      originalTokens: 0,
      optimizedTokens: 0,
      tokensSaved: 0,
      percentSaved: 0,
      costSavedUSD: 0,
      stages: [],
      protectedSpansCount: 0,
      validationPassed: true,
      timestamp: Date.now(),
    };
  }

  const stages: PipelineStageResult[] = [];
  const originalTokens = countTokens(prompt);

  stages.push({
    stage: "original",
    name: "Original Input",
    tokens: originalTokens,
    tokensSaved: 0,
    outputPreview: prompt.slice(0, 80) + (prompt.length > 80 ? "..." : ""),
  });

  // 1. Protect spans
  const { maskedText, spans } = extractProtectedSpans(prompt, effectiveMode);
  const resolvedSpans = getFullyResolvedSpans(spans);

  // 2. Normalize
  const normalized = normalize(maskedText, effectiveMode);
  const normalizedTokens = countTokens(restoreProtectedSpans(normalized, spans));
  stages.push({
    stage: "normalize",
    name: "Normalize & Clean",
    tokens: normalizedTokens,
    tokensSaved: Math.max(0, originalTokens - normalizedTokens),
    outputPreview: "Removed filler words, pleasantries, hedging, and redundant whitespace.",
  });

  // 3. Phrase compression + dedupe.
  //
  // These two stages feed each other: removing a verbose phrase can leave two
  // sentences looking alike (and vice versa), so a single pass leaves real
  // savings on the table. Run them to a fixed point, stopping as soon as a pass
  // fails to shrink the text - which also guarantees termination.
  let compressed = compressPhrases(normalized, effectiveMode);
  for (let pass = 0; pass < 3; pass++) {
    const before = countTokens(compressed);
    const next = deduplicate(
      compressPhrases(compressed, effectiveMode),
      effectiveMode
    );
    if (countTokens(next) >= before) break;
    compressed = next;
  }
  const deduped = compressed;
  const dedupedTokens = countTokens(restoreProtectedSpans(deduped, spans));
  stages.push({
    stage: "dedupe",
    name: "Compress & Deduplicate",
    tokens: dedupedTokens,
    tokensSaved: Math.max(0, normalizedTokens - dedupedTokens),
    outputPreview: "Rewrote verbose phrases and removed repeated content.",
  });

  // 4. Restructure
  const restructured = restructure(deduped, effectiveMode);
  const restructuredTokens = countTokens(restoreProtectedSpans(restructured, spans));
  stages.push({
    stage: "restructure",
    name: "Restructure",
    tokens: restructuredTokens,
    tokensSaved: Math.max(0, dedupedTokens - restructuredTokens),
    outputPreview: "Converted verbose prose to structured imperative phrasing.",
  });

  // 5. Output requirement trimming
  const outputTrimmed = trimOutputRequirements(restructured, effectiveMode);
  const outputTrimTokens = countTokens(restoreProtectedSpans(outputTrimmed, spans));
  const outputTrimSavings = Math.max(0, restructuredTokens - outputTrimTokens);
  stages.push({
    stage: "output_trim",
    name: "Output Demand Trim",
    tokens: outputTrimTokens,
    tokensSaved: outputTrimSavings,
    outputPreview: "Shortened non-essential output specifications.",
  });

  // 5b. LOSSY: delete the lowest-value units until the savings target is met.
  //      Runs on the still-masked text so protected spans cannot be removed.
  //      This is the only stage that discards meaning, which is why it only
  //      runs when explicitly requested and always reports what it removed.
  let lossyText = outputTrimmed;
  const droppedUnits: DroppedUnit[] = [];
  // Only run the deletion stage when the *effective* mode is lossy — a free
  // user who asked for lossy has already been downgraded to aggressive above,
  // so this block stays skipped and nothing is deleted.
  if (effectiveMode === "lossy") {
    const targetPercent = options.targetPercent ?? DEFAULT_LOSSY_TARGET_PERCENT;
    const goal = Math.max(0, Math.min(90, targetPercent));
    const targetTokens = Math.ceil(originalTokens * (1 - goal / 100));

    const outcome = dropLowValueUnits(outputTrimmed, {
      targetTokens,
      countTokens,
      requireRedundancy: options.requireRedundancy,
    });
    lossyText = outcome.text;
    droppedUnits.push(...outcome.dropped);

    const lossyTokens = countTokens(restoreProtectedSpans(lossyText, spans));
    stages.push({
      stage: "lossy_trim",
      name: "Lossy Trim",
      tokens: lossyTokens,
      tokensSaved: Math.max(0, outputTrimTokens - lossyTokens),
      outputPreview: outcome.dropped.length
        ? `Removed ${outcome.dropped.length} low-value unit(s).`
        : "Nothing safe left to remove.",
      notes: outcome.targetReached
        ? undefined
        : "Target not reached: everything remaining was protected, a heading, or a constraint.",
    });
  }

  // 6. Restore protected spans
  let candidatePrompt = restoreProtectedSpans(lossyText, spans);

  // Clean any remaining weird multiple newlines or artifacts
  candidatePrompt = candidatePrompt
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 7. Safety validation using fully resolved spans
  const validation = validatePreservation(prompt, candidatePrompt, resolvedSpans);

  let finalPrompt = candidatePrompt;
  let warning: string | undefined;

  if (!validation.isValid) {
    // Automatic fallback to safe normalized version
    finalPrompt = restoreProtectedSpans(normalize(maskedText, "lossless"), spans);
    warning = validation.warning;
  }

  // 8. Final floor: the optimiser must never hand back something *worse* than
  //    the input. Restructuring and span restoration can both add tokens, and a
  //    "compression" tool that grows the prompt is worse than no tool at all.
  //    Pick the shortest candidate; the original is always in the running, so
  //    the result can never exceed the input token count.
  let best = candidatePrompt;
  let bestTokens = countTokens(best);
  for (const cand of [finalPrompt, prompt]) {
    const t = countTokens(cand);
    if (t < bestTokens) {
      best = cand;
      bestTokens = t;
    }
  }
  finalPrompt = best;
  if (best === prompt) {
    warning =
      warning ??
      "Nothing safe to compress - the original is already the shortest form.";
  }

  // Surface the license gate notice above any other warning so it is impossible
  // to miss: a free user asked for lossy and got aggressive instead.
  if (gatedNotice) {
    warning = warning ? `${gatedNotice} (${warning})` : gatedNotice;
  }

  const finalTokens = countTokens(finalPrompt);
  const totalTokensSaved = Math.max(0, originalTokens - finalTokens);
  const percentSaved = originalTokens > 0 ? Math.round((totalTokensSaved / originalTokens) * 100) : 0;
  const costSavedUSD = estimateCostUSD(totalTokensSaved, pricePer1M);

  stages.push({
    stage: "validate",
    name: "Safety Validation",
    tokens: finalTokens,
    tokensSaved: totalTokensSaved,
    notes: validation.isValid ? "All protected spans & constraints verified." : warning,
  });

  return {
    originalPrompt: prompt,
    optimizedPrompt: finalPrompt,
    mode,
    originalTokens,
    optimizedTokens: finalTokens,
    tokensSaved: totalTokensSaved,
    percentSaved,
    costSavedUSD,
    outputTrimSavingsTokens: outputTrimSavings,
    stages,
    protectedSpansCount: spans.length,
    validationPassed: validation.isValid,
    warning,
    droppedUnits,
    timestamp: Date.now(),
  };
}
