/**
 * `lossy` is the only mode that deletes content. Everything else rewrites
 * wording while preserving meaning; this mode drops the lowest-value units
 * outright, so it must always be opt-in and must always report what it removed.
 */
export type CompressionMode = "lossless" | "balanced" | "aggressive" | "lossy";

/** True for the two rewrite-hard modes, which share their rule set and thresholds. */
export function isAggressiveMode(mode: CompressionMode): boolean {
  return mode === "aggressive" || mode === "lossy";
}

export type ThemeName = "dark" | "light";

/**
 * App settings. Tokenizer never talks to an AI provider, so there is deliberately
 * no API key, provider or model field here - only local compression preferences.
 */
export interface AppSettings {
  /** Default compression mode selected on load. */
  mode: CompressionMode;
  /** Your own price per 1M input tokens (USD); used only for the local cost estimate. */
  pricePer1M: number;
  /** Appearance theme. */
  theme: ThemeName;
}

export interface PipelineStageResult {
  stage:
    | "original"
    | "protect"
    | "normalize"
    | "dedupe"
    | "restructure"
    | "output_trim"
    | "lossy_trim"
    | "validate";
  name: string;
  tokens: number;
  tokensSaved: number;
  outputPreview?: string;
  notes?: string;
}

export interface ProtectedSpan {
  id: string;
  placeholder: string;
  type:
    | "code_block"
    | "inline_code"
    | "number"
    | "date"
    | "url"
    | "file_path"
    | "quoted_text"
    | "variable_name"
    | "constraint_sentence";
  original: string;
}

/**
 * A unit the user *may* remove. Offered by the interactive cut selector; nothing
 * is deleted until the user explicitly ticks it.
 */
export interface CutCandidate {
  /** Stable id, used to map a checkbox back to its line. */
  id: string;
  text: string;
  tokens: number;
  reason: string;
  /** Higher = weaker content. Used only for ordering the list. */
  weakness?: number;
}

export interface DroppedUnit {
  /** The exact text that was removed. */
  text: string;
  tokens: number;
  /** Why it was considered low-value. */
  reason: string;
}

export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  mode: CompressionMode;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
  costSavedUSD: number;
  historySavingsTokens?: number;
  outputTrimSavingsTokens?: number;
  stages: PipelineStageResult[];
  protectedSpansCount: number;
  validationPassed: boolean;
  warning?: string;
  /** Units deleted by `lossy` mode. Always empty for every other mode. */
  droppedUnits?: DroppedUnit[];
  timestamp: number;
}

/**
 * Conversation turns. Kept for the local conversation-history compressor
 * (lib/optimizer/history.ts) - nothing here is ever sent to a provider.
 */
export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: number;
  tokens?: number;
  tokensOriginal?: number;
  tokensOptimized?: number;
  tokensSaved?: number;
  percentSaved?: number;
}

export interface SessionStats {
  totalTokensSaved: number;
  totalCostSavedUSD: number;
  totalTokensOriginal: number;
  totalTokensOptimized: number;
  averageCompressionRatio: number;
  optimizationsCount: number;
}
