import { NextRequest, NextResponse } from "next/server";
import { optimizePrompt } from "@/lib/optimizer";
import { optimizeHistory } from "@/lib/optimizer/history";
import { CompressionMode, ChatMessage } from "@/lib/types";
import { DEFAULT_PRICE_PER_1M } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      mode = "balanced",
      pricePer1M = DEFAULT_PRICE_PER_1M,
      messages = [],
      optimizeConversationHistory = false,
    } = body as {
      prompt: string;
      mode?: CompressionMode;
      pricePer1M?: number;
      messages?: ChatMessage[];
      optimizeConversationHistory?: boolean;
    };

    if (typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt must be a string" }, { status: 400 });
    }

    // Optimize conversation history if provided
    let historySavingsTokens = 0;
    let optimizedMessages: ChatMessage[] = messages;
    if (optimizeConversationHistory && messages.length > 0) {
      const histResult = optimizeHistory(messages, prompt);
      optimizedMessages = histResult.optimizedMessages;
      historySavingsTokens = histResult.tokensSavedEstimate;
    }

    // Optimize the prompt
    const optimizationResult = optimizePrompt(prompt, {
      mode,
      pricePer1M,
    });

    return NextResponse.json({
      ...optimizationResult,
      historySavingsTokens,
      optimizedMessages,
    });
  } catch (error: any) {
    console.error("Optimize API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error optimizing prompt" },
      { status: 500 }
    );
  }
}
