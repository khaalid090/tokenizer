"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { SamplePrompt } from "@/lib/sample-prompts";

/**
 * One clickable sample prompt.
 *
 * The chip states its own expected savings range rather than relying on a
 * headline figure, which is what previously made the row read as
 * "40-60%" next to three ranges that never exceeded 35%.
 */
export function SampleChip({
  sample,
  onSelect,
}: {
  sample: SamplePrompt;
  onSelect: (sample: SamplePrompt) => void;
}) {
  // Titles carry their range in brackets for historical reasons; the chip shows
  // the structured `expectedSavings` field instead of parsing the string.
  const label = sample.title.split("(")[0].trim();

  return (
    <button
      type="button"
      onClick={() => onSelect(sample)}
      title={`Load "${label}" into the Original Prompt box`}
      className="group px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-slate-700/70 text-slate-200 hover:border-cyan-500/60 hover:bg-cyan-950/30 hover:text-cyan-100 cursor-pointer transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
    >
      <Sparkles className="w-3 h-3 text-slate-400 group-hover:text-cyan-300 transition-colors" />
      <span>{label}</span>
      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1 rounded">
        {sample.expectedSavings}
      </span>
    </button>
  );
}