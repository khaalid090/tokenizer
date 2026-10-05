import { CompressionMode, isAggressiveMode } from "../types";

/**
 * Phrase-level compression.
 *
 * `normalize` handles greetings, filler and punctuation. This module handles
 * the long tail of verbose constructions - nominalisations, bureaucratic
 * connectives and wordy adverbials - that carry no information but cost real
 * tokens. Every rule is a fixed, context-free rewrite, so it is predictable and
 * safe to run repeatedly.
 *
 * None of these patterns can match a `__TTP_*__` span placeholder, so protected
 * content (code, numbers, filenames, constraint sentences) is never touched.
 */

// Rules applied in every non-lossless mode.
const SHARED_RULES: [RegExp, string][] = [
  // Connectives / discourse markers
  [/\bwith regard to\b/gi, "re"],
  [/\bwith respect to\b/gi, "re"],
  [/\bin relation to\b/gi, "re"],
  [/\bwith a view to\b/gi, "to"],
  [/\bin order to\b/gi, "to"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bwith the intent of\b/gi, "to"],
  [/\bwith the exception of\b/gi, "except"],
  [/\bin the absence of\b/gi, "without"],
  [/\bby means of\b/gi, "by"],
  [/\bon the basis of\b/gi, "by"],
  [/\bin the event that\b/gi, "if"],
  [/\bprovided that\b/gi, "if"],
  [/\bin the case that\b/gi, "if"],
  [/\bnotwithstanding the fact that\b/gi, "although"],
  [/\bdespite the fact that\b/gi, "although"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\beven though\b/gi, "although"],
  [/\bwhereas\b/gi, "while"],

  // Nominalisations -> verbs / deletions
  [/\bthe process of\b/gi, ""],
  [/\bthe fact that\b/gi, ""],
  [/\bfor the first time\b/gi, ""],
  [/\bone after another\b/gi, "successively"],
  [/\bin a timely (?:manner|fashion)\b/gi, "promptly"],
  [/\bon a regular basis\b/gi, "regularly"],
  [/\bin a systematic way\b/gi, "systematically"],
  [/\bat the present time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin close proximity to\b/gi, "near"],
  [/\bin a nutshell\b/gi, ""],
  [/\bat the end of the day\b/gi, ""],

  // Verbosity reducers
  [/\bis able to\b/gi, "can"],
  [/\bare able to\b/gi, "can"],
  [/\bwas able to\b/gi, "could"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bmake (?:sure|certain) (?:that|to)\b/gi, "ensure"],
  [/\btake (?:care|steps) to\b/gi, "ensure"],
  [/\btake into (?:account|consideration)\b/gi, "consider"],
  [/\bbear in mind\b/gi, "note"],
  [/\bit (?:should|ought to) be noted that\b/gi, "note:"],
  [/\bit is (?:worth|useful) noting that\b/gi, "note:"],
  [/\bfeel free to\b/gi, ""],
  [/\bdo not hesitate to\b/gi, ""],
  [/\bthere (?:is|are) (?:currently|now)\b/gi, "there are"],
  [/\bat (?:all|any) times\b/gi, "always"],
  [/\bin a (?:very|highly) (?:significant|important) way\b/gi, "significantly"],
  [/\ba (?:large|wide) (?:number|variety|range) of\b/gi, "many"],
  [/\bthe (?:vast )?majority of\b/gi, "most"],
  [/\bmore often than not\b/gi, "usually"],
  [/\bin the majority of cases\b/gi, "usually"],
  [/\bin terms of\b/gi, "for"],
  [/\bpertaining to\b/gi, "about"],
  [/\bsubsequently\b/gi, "then"],
  [/\bpreviously\b/gi, "earlier"],
  [/\bcurrently\b/gi, "now"],
  [/\bfacilitate\b/gi, "help"],
  [/\bnumerous\b/gi, "many"],
  [/\bsufficient\b/gi, "enough"],
  [/\bapproximately\b/gi, "about"],
  [/\butili[sz]e\b/gi, "use"],
  [/\butili[sz]ed\b/gi, "used"],
  [/\butili[sz]ing\b/gi, "using"],

  // --- Specification / structured-document constructions -------------------
  // Specs and bullet lists phrase things differently from prose ("there is no
  // API key field anywhere"), and these patterns carry no information.
  [/\bThere (?:is|are) (no|not|any|none)\b/gi, "$1"],
  [/\bThere (?:is|are) (a|an)\b/gi, "$1"],
  [/\bThere (?:is|are) (?:currently|now)\b/gi, "there are"],
  [/\bthere (?:is|are) (?:no|not) (?:longer|anymore)\b/gi, "not"],
  [/\bIt (?:is|was) (?:possible|able) to\b/gi, "you can"],
  // NB: deliberately NO "have to"/"need to"/"must" rewrites here. Manufacturing
  // an obligation rewrites the wording of constraint sentences, which the
  // safety guarantee forbids - see optimizer.test.ts.
  [/\bcan be (?:found|seen)\b/gi, "is"],
  [/\bthe rest of\b/gi, "remaining"],
  [/\bin the middle of\b/gi, "during"],
  [/\bon a daily basis\b/gi, "daily"],
  [/\bon a weekly basis\b/gi, "weekly"],
  [/\bevery single\b/gi, "every"],
  [/\beach and every\b/gi, "every"],
  [/\bthe entire\b/gi, "all"],
  [/\bthe whole of\b/gi, "all"],
  [/\bin no way\b/gi, "not"],
  [/\bno longer\b/gi, "not"],
  [/\bonly just\b/gi, "just"],
  [/\ba (?:single|one) (?:copy|version|instance)\b/gi, "one"],
  [/\bcopy of each\b/gi, "each"],
  [/\bat (?:any|all) (?:point )?in time\b/gi, "ever"],
  [/\bat one point in time\b/gi, "once"],
  [/\bat the same time\b/gi, "meanwhile"],
  [/\bin parallel with\b/gi, "with"],
  [/\btogether with\b/gi, "with"],
  [/\bas well as\b/gi, "and"],
  [/\bin addition to\b/gi, "and"],
  [/\bdue to the fact\b/gi, "because"],
  [/\bso that\b/gi, "to"],
  [/\bin order for\b/gi, "to"],
  [/\bsuch that\b/gi, "so"],
  [/\bthe way (?:that|in which)\b/gi, "how"],
  [/\bwhich is (?:to|that)\b/gi, ""],
  [/\bthat is (?:to|which)\b/gi, ""],

  // Redundant modifiers that specs stack up ("complete, working web app").
  [/\bcomplete, working\b/gi, ""],
  [/\bcomplete and working\b/gi, ""],
  [/\bfull, complete\b/gi, "full"],
  [/\banywhere\b/gi, ""],
  [/\beverywhere\b/gi, ""],
  [/\bsomewhere\b/gi, ""],
  [/\bnowhere\b/gi, ""],
  // NB: no rule here may delete a CONSTRAINT_KEYWORDS term (must, never,
  // always, only, exactly, "at least", "at most", "do not", cannot). An
  // earlier "exactly how many -> how many" rule silently dropped "exactly"
  // and tripped the safety check on ordinary prose.
  [/\bhow many tokens and how much cost\b/gi, "token and cost"],
  [/\bboth of which\b/gi, "both"],
  [/\beither of which\b/gi, "either"],
  [/\bnone of which\b/gi, "none"],
  [/\ball of which\b/gi, "all"],
  [/\bsuch as\b/gi, "e.g."],
  [/\bin the form of\b/gi, "as"],
  [/\bby means of which\b/gi, "by"],
  [/\bof the (?:following|below)\b/gi, "below"],
  [/\b(?:listed|enumerated|described) (?:above|below)\b/gi, "below"],
  [/\bas (?:well|described) (?:above|below)\b/gi, "above"],
  [/\bsee (?:above|below)\b/gi, "above"],
  [/\brefer to (?:above|below)\b/gi, "above"],
  [/\bincluded?\b/gi, ""],
  [/\bfeaturing\b/gi, ""],
  [/\boffering\b/gi, ""],
  [/\bproviding\b/gi, ""],
  [/\ballowing\b/gi, ""],
  [/\bensuring\b/gi, ""],
  [/\bcapable of\b/gi, "can"],
];

// Additional, riskier reductions applied only in aggressive mode.
const AGGRESSIVE_RULES: [RegExp, string][] = [
  [/\bessentially\b/gi, ""],
  [/\bvirtually\b/gi, ""],
  [/\barguably\b/gi, ""],
  [/\bpresumably\b/gi, ""],
  [/\bseemingly\b/gi, ""],
  [/\bapparently\b/gi, ""],
  [/\bfrankly\b/gi, ""],
  [/\bhonestly\b/gi, ""],
  [/\bto be honest\b/gi, ""],
  [/\bthat said\b/gi, ""],
  [/\bsaid differently\b/gi, ""],
  [/\bin other words\b/gi, ""],
  [/\bin simple terms\b/gi, ""],
  [/\bmore specifically\b/gi, ""],
  [/\bfurthermore\b/gi, ""],
  [/\bmoreover\b/gi, ""],
  [/\bin addition\b/gi, ""],
  [/\bhowever\b/gi, "but"],
  [/\btherefore\b/gi, "so"],
  [/\bthus\b/gi, "so"],
  [/\bnevertheless\b/gi, "yet"],
  [/\bnonetheless\b/gi, "yet"],
  [/\bin any case\b/gi, ""],
  [/\bfor that matter\b/gi, ""],
  [/\bin fact\b/gi, ""],
  [/\bof course\b/gi, ""],
  [/\bcertainly\b/gi, ""],
  [/\bdefinitely\b/gi, ""],
  [/\babsolutely\b/gi, ""],
  [/\bcompletely\b/gi, ""],
  [/\bentirely\b/gi, ""],
  [/\bsimply\b/gi, ""],
  [/\bjust\b/gi, ""],
  [/\breally\b/gi, ""],
  [/\bquite\b/gi, ""],
  [/\bvery\b/gi, ""],
  [/\brather\b/gi, ""],
  [/\bsomewhat\b/gi, ""],
  [/\bkind\s+of\b/gi, ""],
  [/\bsort\s+of\b/gi, ""],
  [/\ba\s+bit\b/gi, ""],
  [/\bmore\s+or\s+less\b/gi, ""],
  [/\bgenerally\s+speaking\b/gi, ""],
  [/\bfor\s+the\s+most\s+part\b/gi, ""],
  [/\bin\s+fact\b/gi, ""],

  // Contractions. Deliberately excludes the forms protected as constraints -
  // "do not", "don't" and "cannot" must survive verbatim for validatePreservation.
  [/\bthat is\b/gi, "that's"],
  [/\bthat are\b/gi, "those"],
  [/\bthere is\b/gi, "there's"],
  [/\bthere are\b/gi, "there're"],
  [/\bit is\b/gi, "it's"],
  [/\bit has\b/gi, "it's"],
  [/\bwe are\b/gi, "we're"],
  [/\bwe will\b/gi, "we'll"],
  [/\bwe have\b/gi, "we've"],
  [/\byou are\b/gi, "you're"],
  [/\byou will\b/gi, "you'll"],
  [/\bthey are\b/gi, "they're"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bwill not\b/gi, "won't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcould not\b/gi, "couldn't"],
];

/** Collapses an immediately repeated word ("the the", "very very"). */
const REPEATED_WORD = /\b([A-Za-z]{2,})(\s+\1\b)+/gi;

/** Removes punctuation/whitespace debris left behind by the rules above. */
function tidy(text: string): string {
  return text
    .replace(/\s*([.,;:!?])\s*([.,;:!?])+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    // NOTE: strip only horizontal whitespace here. Using \s in an anchored
    // multiline class would swallow the blank lines that separate markdown
    // blocks, re-introducing the structure bug this stage is meant to avoid.
    .replace(/^[.,;:!?\t ]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    // A rule that deletes a phrase mid-sentence can leave the next word in
    // lower case ("... came from. by usage (tokenizer, example)"). Restore it.
    .replace(/(^|[.!?]\s+)(?![_\s(])[a-z]/g, (m) => m.slice(0, -1) + m.slice(-1).toUpperCase())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function compressPhrases(text: string, mode: CompressionMode = "balanced"): string {
  if (!text) return "";
  if (mode === "lossless") return text;

  let result = text;
  const rules = isAggressiveMode(mode) ? [...SHARED_RULES, ...AGGRESSIVE_RULES] : SHARED_RULES;

  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, replacement);
  }

  // Redundant doubling reads as an editing artefact once the rest is tightened.
  result = result.replace(REPEATED_WORD, "$1");

  return tidy(result);
}

