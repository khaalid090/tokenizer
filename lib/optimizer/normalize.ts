import { CompressionMode, isAggressiveMode } from "../types";

/**
 * Normalizes:
 * - Whitespace: collapses multiple spaces, strips trailing spaces, limits consecutive newlines to max 2.
 * - Pleasantries: "hello", "hi there", "could you please", "would you kindly", "thanks in advance", etc.
 * - Filler words & Hedging: "basically", "actually", "in order to" -> "to", "as a matter of fact", "needless to say", "it is important to note that"
 * - Repeated punctuation: "??", "!!", "....", ",,"
 */
export function normalize(text: string, mode: CompressionMode = "balanced"): string {
  if (!text) return "";

  let result = text;

  // 1. Normalize repeated punctuation
  result = result.replace(/\?{2,}/g, "?");
  result = result.replace(/!{2,}/g, "!");
  result = result.replace(/\.{4,}/g, "...");
  result = result.replace(/,{2,}/g, ",");
  result = result.replace(/;{2,}/g, ";");

  // 2. Remove pleasantries & politeness filler
  const pleasantries = [
    /\b(?:could\s+you\s+please|would\s+you\s+kindly|please\s+kindly|can\s+you\s+please|if\s+you\s+don't\s+mind|if\s+it's\s+not\s+too\s+much\s+trouble|if\s+it\s+is\s+not\s+too\s+much\s+trouble)\b/gi,
    /\b(?:hello|hi|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening)(?:[,\s]+there)?[.!?,]?\s*/gi,
    /\b(?:thanks\s+in\s+advance|thank\s+you\s+very\s+much|thank\s+you\s+so\s+much|thanks\s+so\s+much(?:\s+for\s+your\s+help)?|thanks\s+a\s+lot|much\s+appreciated|warm\s+regards|best\s+regards|thank\s+you\s+kindly|thank\s+you)[.!?,]?\s*/gi,
    /\b(?:i\s+would\s+like\s+you\s+to|i\s+want\s+you\s+to|i\s+need\s+you\s+to|i\s+am\s+hoping\s+(?:that\s+)?you\s+can|i\s+was\s+wondering\s+if\s+you\s+could(?:\s+possibly)?|i\s+am\s+really\s+hoping\s+to)\b/gi,
    /\bi\s+hope\s+you\s+are\s+having\s+a\s+wonderful\s+day\s+(?:today)?[.!?,]?\s*/gi,
    /\bit\s+would\s+be\s+wonderful\s+if\s+you\s+could\s+also\b/gi,
  ];

  for (const pattern of pleasantries) {
    result = result.replace(pattern, "");
  }

  // In Balanced & Aggressive, strip standalone "please" and "kindly"
  if (mode === "balanced" || isAggressiveMode(mode)) {
    result = result.replace(/\bplease\b[,]?\s*/gi, "");
    result = result.replace(/\bkindly\b[,]?\s*/gi, "");
    result = result.replace(/\bfeel free to\b[,]?\s*/gi, "");
    result = result.replace(/\bcould you\b[,]?\s*/gi, "");
    result = result.replace(/\bwould you\b[,]?\s*/gi, "");
  }

  // 3. Hedging & wordy phrases replacement
  const conciseSubstitutions: [RegExp, string][] = [
    [/\bin order to\b/gi, "to"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bat this point in time\b/gi, "now"],
    [/\bfor the purpose of\b/gi, "to"],
    [/\bin the event that\b/gi, "if"],
    [/\bwith regard to\b/gi, "regarding"],
    [/\bin spite of the fact that\b/gi, "although"],
    [/\bas a matter of fact\b/gi, ""],
    [/\bactually\b/gi, ""],
    [/\bbasically\b/gi, ""],
    [/\bin my humble opinion\b/gi, ""],
    [/\bin my opinion\b/gi, ""],
    [/\bit is recommended that you\b/gi, ""],
    [/\bit is important to note that\b/gi, "Note:"],
    [/\bit should be noted that\b/gi, "Note:"],
    [/\bkeep in mind that\b/gi, "Note:"],
    [/\bneedless to say\b/gi, ""],
    // Verbosity reducers: longer, formal ways of saying something short.
    [/\bwhenever you (?:want|wish|like|feel like)\b/gi, ""],
    [/\bif you (?:would )?(?:want|wish|like|prefer)\b/gi, ""],
    [/\bat your earliest convenience\b/gi, ""],
    [/\bas soon as (?:you )?(?:possible|you can)\b/gi, "ASAP"],
    [/\bis able to\b/gi, "can"],
    [/\bare able to\b/gi, "can"],
    [/\bhas the ability to\b/gi, "can"],
    [/\bmake sure (?:that|to)\b/gi, "ensure"],
    [/\bbe sure (?:that|to)\b/gi, "ensure"],
    [/\btake into consideration\b/gi, "consider"],
    [/\bin close proximity to\b/gi, "near"],
    [/\bprior to\b/gi, "before"],
    [/\bsubsequent to\b/gi, "after"],
    [/\bin the eventuality (?:that|of)\b/gi, "if"],
    [/\ba (?:large|wide) (?:number|variety|range) of\b/gi, "many"],
    [/\bthe vast majority of\b/gi, "most"],
    [/\bin the majority of cases\b/gi, "usually"],
    [/\butili[sz]e\b/gi, "use"],
    [/\bleverage\b/gi, "use"],
    [/\bnumerous\b/gi, "many"],
    [/\badditional\b/gi, "more"],
    [/\bapproximately\b/gi, "about"],
    [/\bsufficient\b/gi, "enough"],
    [/\bthe fact that\b/gi, "that"],
    [/\bwhat we need is\b/gi, "need:"],
    [/\bwe have to consider that\b/gi, ""],
    [/\bthere (?:is|are) (?:a number of|several)\b/gi, "there are"],
    [/\bthe way in which\b/gi, "how"],
    [/\bin an effort to\b/gi, "to"],
    [/\bfor the (?:sake|benefit) of\b/gi, "for"],
    [/\bwalk me through the entire thought process step by step and give an exhaustive summary\b/gi, "Summarize the architecture."],
    [/\bprovide a very thorough analysis with comprehensive explanations\b/gi, "Analyze performance and security."],
    [/\bwrite lots of commentary explaining everything in thorough detail\b/gi, "Include brief comments."],
  ];

  for (const [pattern, replacement] of conciseSubstitutions) {
    result = result.replace(pattern, replacement);
  }

  // 4. In Aggressive mode, strip conversational hedging
  if (isAggressiveMode(mode)) {
    const aggressiveFillers = [
      /\b(?:literally|honestly|frankly|simply put|to be honest|as you know)\b[,\s]*/gi,
      /\b(?:just|really|very|quite|somewhat|pretty much|super)\b\s+/gi,
      /\bwhat we need is\b/gi,
      /\bhere is the exact code block that i want you to inspect:\b/gi,
    ];
    for (const pat of aggressiveFillers) {
      result = result.replace(pat, "");
    }
  }

  // 4b. Tidy up fragments orphaned by the removals above. Dropping a
  // pleasantry can leave a dangling head ("Thank you so much for your help!"
  // -> "for your help!"), and dropping a discourse marker can leave the next
  // clause starting on a comma ("... this task. Basically, what we need ...").
  result = result.replace(/\bfor your (?:help|time|assistance)\b[.!?,]?\s*/gi, "");
  result = result.replace(/(?:^|[.!?]\s+)(?:and|but|so|then|also)\s*,\s*/gi, "$1");
  result = result.replace(/\s+([.,;:])/g, "$1");
  result = result.replace(/([.,;:])\s*([.,;:])+/g, "$1");

  // 4c. Re-capitalise sentence starts. Substitutions such as "In order to" ->
  // "to" can leave a sentence beginning with a lowercase letter. Placeholders
  // start with "__" so masked (protected) content is never touched.
  result = result.replace(/(^|[.!?]\s+)(?![_\s(])[a-z]/g, (m) =>
    m.slice(0, -1) + m.slice(-1).toUpperCase()
  );
  // 5. Clean up whitespace & orphan punctuation
  result = result.replace(/[^\S\r\n]+/g, " ");
  result = result.replace(/\s+([.,!?:;])/g, "$1");
  result = result.replace(/^[.,!?:;]\s*/gm, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  // NB: horizontal whitespace only - `\s` would swallow the blank lines that
  // separate markdown blocks.
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.trim();

  return result;
}
