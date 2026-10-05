import { ChatMessage } from "../types";

/**
 * Calculates a simple term-frequency vector for similarity.
 */
function getTfVector(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const w of words) {
    map.set(w, (map.get(w) || 0) + 1);
  }
  return map;
}

function cosineSimilarityTf(mapA: Map<string, number>, mapB: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const val of mapA.values()) normA += val * val;
  for (const val of mapB.values()) normB += val * val;

  if (normA === 0 || normB === 0) return 0;

  for (const [key, valA] of mapA.entries()) {
    const valB = mapB.get(key);
    if (valB) dot += valA * valB;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Checks if a turn is just a greeting or small talk.
 */
function isGreetingOrFiller(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  const greetings = [
    "hello",
    "hi",
    "hey",
    "thanks",
    "thank you",
    "ok",
    "okay",
    "understood",
    "got it",
    "great thanks",
    "good morning",
    "bye",
  ];
  return greetings.includes(trimmed) || /^(thanks|thank you|ok|okay|hi|hello)[.!]?$/.test(trimmed);
}

/**
 * Conversation history optimizer:
 * 1. Keeps system prompt intact.
 * 2. Keeps the latest N turns (e.g. last 4 messages).
 * 3. Drops trivial pleasantries and greetings from past turns.
 * 4. Filters older turns by relevance (TF-IDF cosine similarity to the current request).
 * 5. Summarizes remaining older turns into a concise [Memory / Prior Context] block.
 */
export function optimizeHistory(
  messages: ChatMessage[],
  currentPrompt: string,
  keepLatestTurns: number = 4
): {
  optimizedMessages: ChatMessage[];
  tokensSavedEstimate: number;
  summarizedTurnCount: number;
} {
  if (messages.length <= keepLatestTurns + 1) {
    return {
      optimizedMessages: messages,
      tokensSavedEstimate: 0,
      summarizedTurnCount: 0,
    };
  }

  const queryTf = getTfVector(currentPrompt);
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length <= keepLatestTurns) {
    return {
      optimizedMessages: messages,
      tokensSavedEstimate: 0,
      summarizedTurnCount: 0,
    };
  }

  const olderTurns = nonSystemMessages.slice(0, nonSystemMessages.length - keepLatestTurns);
  const recentTurns = nonSystemMessages.slice(nonSystemMessages.length - keepLatestTurns);

  const relevantOlderTurns: ChatMessage[] = [];
  const turnsToSummarize: ChatMessage[] = [];

  for (const turn of olderTurns) {
    // Drop trivial greetings
    if (isGreetingOrFiller(turn.content)) {
      continue;
    }

    const sim = cosineSimilarityTf(queryTf, getTfVector(turn.content));
    // If turn has high topical similarity (> 0.25), preserve it
    if (sim > 0.25) {
      relevantOlderTurns.push(turn);
    } else {
      turnsToSummarize.push(turn);
    }
  }

  const finalMessages: ChatMessage[] = [...systemMessages];

  // Synthesize memory summary from turnsToSummarize if any
  if (turnsToSummarize.length > 0) {
    const summaryPoints: string[] = [];
    for (const t of turnsToSummarize) {
      // Extract brief essence
      const firstLine = t.content.split("\n")[0].slice(0, 100);
      summaryPoints.push(`${t.role === "user" ? "User asked about" : "Provided"}: ${firstLine}...`);
    }

    const memoryBlock: ChatMessage = {
      id: "summary_memory_node",
      role: "system",
      content: `[Conversation Summary / Earlier Context]:\n${summaryPoints.slice(-5).join("\n")}`,
    };
    finalMessages.push(memoryBlock);
  }

  finalMessages.push(...relevantOlderTurns);
  finalMessages.push(...recentTurns);

  // Estimate tokens saved
  const origTokens = messages.reduce((acc, m) => acc + m.content.length / 4, 0);
  const optTokens = finalMessages.reduce((acc, m) => acc + m.content.length / 4, 0);
  const tokensSaved = Math.max(0, Math.round(origTokens - optTokens));

  return {
    optimizedMessages: finalMessages,
    tokensSavedEstimate: tokensSaved,
    summarizedTurnCount: turnsToSummarize.length,
  };
}
