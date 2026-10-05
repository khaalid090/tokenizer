import { CompressionMode } from "../types";
import { countTokens } from "../tokens";

/**
 * Splits prose into sentences without breaking tokens that merely *contain* a
 * period - filenames (`package.json`, `favicon.ico`), hostnames, versions
 * (`3.14`) and initials. A naive character-class split would tear "package.json"
 * into "package." + "json", and re-joining those with a space silently
 * corrupts the prompt.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (ch !== "." && ch !== "!" && ch !== "?") continue;

    const prev = text[i - 1] ?? "";
    const next = text[i + 1];
    const endsHere = next === undefined || /\s/.test(next);
    if (!endsHere) continue;
    // "pkg.json" / "3.14" / "e.g" - period is intra-word, not a boundary.
    if (ch === "." && /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next ?? "")) {
      continue;
    }
    out.push(current);
    current = "";
  }
  if (current.trim()) out.push(current);
  return out;
}


/**
 * Restructures verbose prose into concise structured sections:
 * [Task] / [Context] / [Constraints] / [Output format]
 * Using short imperative phrases.
 *
 * In "lossless" mode: conservative structuring, cleans bullet formats and removes preamble.
 * In "balanced" mode: groups sentences into Task, Context, Output format if prose is lengthy.
 * In "aggressive" mode: converts paragraphs into strict bulleted key-value points.
 */
export function restructure(text: string, mode: CompressionMode = "balanced"): string {
  if (!text) return "";

  if (mode === "lossless") {
    // Only remove wordy introductory preambles like "I am writing to request that you..."
    let cleaned = text.replace(/^(?:I am writing to request that you|The purpose of this prompt is to)\s*/i, "");
    return cleaned;
  }

  // Identify lines and semantic segments
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // If text is already very brief (< 2 sentences) or structured with markdown headers / lists, preserve style
  if (paragraphs.length === 1 && paragraphs[0].split(/[.!?]/).length <= 2) {
    return text;
  }

  // Detect explicit or implicit components
  const taskParts: string[] = [];
  const contextParts: string[] = [];
  const constraintParts: string[] = [];
  const outputParts: string[] = [];
  const generalParts: string[] = [];

  for (const para of paragraphs) {
    // Check if line is already structured
    if (para.startsWith("#") || para.startsWith("- ") || para.startsWith("* ") || /^[A-Z][a-zA-Z\s]+:/.test(para)) {
      generalParts.push(para);
      continue;
    }

    const sentences = splitSentences(para);
    for (const rawSent of sentences) {
      const s = rawSent.trim();
      if (!s) continue;

      const lower = s.toLowerCase();

      // A masked span is opaque content, not prose. Its placeholder text happens
      // to contain the word "constraint", which would otherwise drag the whole span
      // into a section it never belonged to. Keep it verbatim.
      if (/^__ttp_[a-z_]+_\d+__$/.test(lower)) {
        generalParts.push(s);
        continue;
      }

      if (lower.startsWith("task:") || lower.includes("objective is") || lower.startsWith("write a") || lower.startsWith("build a") || lower.startsWith("create a") || lower.startsWith("generate a") || lower.startsWith("implement a")) {
        taskParts.push(s.replace(/^(?:task:|the objective is to|your task is to)\s*/i, ""));
      } else if (lower.includes("format:") || lower.includes("output as") || lower.includes("respond with") || lower.includes("return json") || lower.includes("return markdown") || lower.includes("in bullet points")) {
        outputParts.push(s.replace(/^(?:output format:|format:|please respond in|respond with)\s*/i, ""));
      } else if (lower.includes("constraint") || lower.includes("make sure") || lower.includes("requirement") || lower.includes("__tt_prot_constraint_sentence")) {
        constraintParts.push(s);
      } else if (lower.includes("background:") || lower.includes("context:") || lower.includes("we have") || lower.includes("given that")) {
        contextParts.push(s.replace(/^(?:background:|context:|we have)\s*/i, ""));
      } else {
        generalParts.push(s);
      }
    }
  }

  // If not enough structured pieces detected to warrant re-architecting sections, do imperative shortening
  if (taskParts.length === 0 && outputParts.length === 0 && constraintParts.length === 0) {
    // Shorten wordy verb phrases into imperative form
    let shortened = text;
    shortened = shortened.replace(/\b(?:can you please help me to|help me to|assist me with|assist me in)\b\s*/gi, "");
    shortened = shortened.replace(/\b(?:i need a solution that will|we want a solution that will)\b\s*/gi, "Solution requirements: ");
    return shortened;
  }

  const sections: string[] = [];

  if (taskParts.length > 0) {
    sections.push(`Task: ${taskParts.join("; ")}`);
  }
  if (contextParts.length > 0) {
    sections.push(`Context: ${contextParts.join("; ")}`);
  }
  if (generalParts.length > 0) {
    sections.push(generalParts.join(" "));
  }
  if (constraintParts.length > 0) {
    sections.push(`Constraints:\n${constraintParts.map((c) => `- ${c}`).join("\n")}`);
  }
  if (outputParts.length > 0) {
    sections.push(`Output format: ${outputParts.join("; ")}`);
  }

  const result = sections.join("\n\n");

  // Restructuring adds section headers, so it can easily come out *longer* than
  // the prose it replaced. When that happens the stage is pure cost - hand the
  // input back untouched and let the next stage try.
  //
  // The guard also rejects a result that saved tokens by *flattening* the
  // document: merging every paragraph into a single block destroys markdown
  // layout (headings stop rendering as headings), which is a loss, not a saving.
  const blocks = (s: string) =>
    s.split(/\n\s*\n/).filter((b) => b.trim()).length;
  if (countTokens(result) >= countTokens(text) || blocks(result) < blocks(text)) {
    return text;
  }

  return result;
}
