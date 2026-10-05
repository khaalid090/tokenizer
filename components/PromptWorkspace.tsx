"use client";

import React, { useState } from "react";
import { Copy, Check, Sparkles, Edit3, ShieldAlert, AlertTriangle } from "lucide-react";
import { CompressionMode, DroppedUnit } from "@/lib/types";
import { AnimatedCounter } from "./AnimatedCounter";

interface PromptWorkspaceProps {
  originalPrompt: string;
  setOriginalPrompt: (text: string) => void;
  optimizedPrompt: string;
  setOptimizedPrompt: (text: string) => void;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
  mode: CompressionMode;
  setMode: (mode: CompressionMode) => void;
  onOptimize: () => void;
  isOptimizing: boolean;
  validationPassed: boolean;
  warning?: string;
  /** False until the exact BPE table has loaded; counts are estimates until then. */
  tokenizerReady?: boolean;
  /** Units deleted by lossy mode, surfaced so nothing is removed silently. */
  droppedUnits?: DroppedUnit[];
}

export function PromptWorkspace({
  originalPrompt,
  setOriginalPrompt,
  optimizedPrompt,
  setOptimizedPrompt,
  originalTokens,
  optimizedTokens,
  tokensSaved,
  percentSaved,
  mode,
  setMode,
  onOptimize,
  isOptimizing,
  validationPassed,
  warning,
  tokenizerReady = true,
  droppedUnits = [],
}: PromptWorkspaceProps) {
  const [showDropped, setShowDropped] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedOptimized, setCopiedOptimized] = useState(false);

  const handleCopy = (text: string, type: "orig" | "opt") => {
    navigator.clipboard.writeText(text);
    if (type === "orig") {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    } else {
      setCopiedOptimized(true);
      setTimeout(() => setCopiedOptimized(false), 2000);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface/80 backdrop-blur-md rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Compression Mode:
          </span>
          <div className="inline-flex p-1 bg-surface-raised/70 rounded-xl border border-slate-800">
            {(["lossless", "balanced", "aggressive", "lossy"] as CompressionMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                title={
                  m === "lossy"
                    ? "Deletes the lowest-value sentences to hit a savings target. Content is removed."
                    : undefined
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-all duration-200 ${
                  mode === m
                    ? m === "lossy"
                      ? "bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md shadow-rose-500/25"
                      : "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-violet-500/20"
                    : m === "lossy"
                      ? "text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                      : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {m}
                {m === "lossy" && <span className="ml-1 text-rose-300/80">⚠</span>}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onOptimize}
          // Wait for the exact tokenizer: running the pipeline against estimated
          // counts would report savings that contradict the numbers on screen.
          disabled={isOptimizing || !originalPrompt.trim() || !tokenizerReady}
          // Hidden below `lg`: the sticky bottom bar carries the action there,
          // so showing both would duplicate the same button on screen.
          className="hidden lg:flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <Sparkles className="w-4 h-4 animate-spin-slow" />
          <span>
            {isOptimizing
              ? "Optimizing..."
              : tokenizerReady
                ? "Optimize Prompt"
                : "Loading tokenizer..."}
          </span>
        </button>
      </div>

      {/* Lossy mode deleted content. Say so loudly, and list exactly what went. */}
      {(mode === "lossy" || droppedUnits.length > 0) && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 text-xs">
          <button
            type="button"
            onClick={() => setShowDropped((v) => !v)}
            className="w-full flex items-start gap-3 p-3.5 text-left"
            aria-expanded={showDropped}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <div className="font-semibold mb-0.5">
                Lossy mode is on &mdash; content can be deleted
              </div>
              <div className="text-rose-300/80">
                {droppedUnits.length > 0 ? (
                  <>
                    This run removed {droppedUnits.length} low-value{" "}
                    {droppedUnits.length === 1 ? "unit" : "units"} (
                    {droppedUnits.reduce((n, d) => n + d.tokens, 0)} tokens) to hit the savings
                    target. Anything removed is listed below &mdash; review it before using the
                    result.
                  </>
                ) : (
                  <>
                    Sentences may be dropped to reach the savings target. Switch to a
                    non-destructive mode if you need every sentence preserved.
                  </>
                )}
              </div>
            </div>
            {droppedUnits.length > 0 && (
              <span className="text-[11px] font-mono flex-shrink-0 mt-0.5">
                {showDropped ? "Hide" : "Show"}
              </span>
            )}
          </button>

          {showDropped && droppedUnits.length > 0 && (
            <ul className="border-t border-rose-500/25 px-3.5 py-2.5 space-y-1.5">
              {droppedUnits.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-rose-400/70 font-mono flex-shrink-0">
                    &minus;{d.tokens}t
                  </span>
                  <span className="min-w-0">
                    <span className="line-through opacity-70 break-words">{d.text}</span>
                    <span className="ml-1.5 text-[10px] font-mono text-rose-400/60">
                      {d.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Safety warning banner if validation failed and safe fallback was triggered */}
      {!validationPassed && warning && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div>
            <div className="font-semibold mb-0.5">Safety Fallback Triggered</div>
            <div>{warning}</div>
          </div>
        </div>
      )}

      {/* Side-by-Side Editor Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Original Prompt */}
        <div className="flex flex-col rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800/80 overflow-hidden shadow-xl h-full">
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-raised/60 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Original Prompt
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300"
                title={
                  tokenizerReady
                    ? "Exact cl100k_base token count"
                    : "Estimated until the exact tokenizer finishes loading"
                }
              >
                <AnimatedCounter value={originalTokens} /> tokens
                {!tokenizerReady && <span className="ml-1 text-amber-400">~</span>}
              </span>
              <button
                onClick={() => handleCopy(originalPrompt, "orig")}
                className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-slate-50 hover:bg-surface-raised transition-colors"
                title="Copy original prompt"
                aria-label="Copy original prompt"
              >
                {copiedOriginal ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <textarea
            value={originalPrompt}
            onChange={(e) => setOriginalPrompt(e.target.value)}
            placeholder="Type or paste your prompt here with constraints, code, instructions, or queries..."
            spellCheck={false}
            className="w-full flex-1 min-h-[260px] h-[320px] lg:h-[360px] pt-5 px-4 pb-4 font-mono text-sm leading-relaxed bg-transparent text-slate-200 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-violet-500/40 scroll-prompt"
          />
        </div>

        {/* Right: Optimized Prompt */}
        <div className="flex flex-col rounded-2xl bg-surface/70 backdrop-blur-md border border-cyan-500/20 overflow-hidden shadow-xl relative h-full">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-cyan-400 to-pink-500" />
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-raised/60 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Optimized Prompt
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">
                <AnimatedCounter value={optimizedTokens} /> tokens
                {tokensSaved > 0 && ` (-${percentSaved}%)`}
              </span>
              <button
                onClick={() => handleCopy(optimizedPrompt, "opt")}
                disabled={!optimizedPrompt.trim()}
                className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-slate-50 hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Copy optimized prompt"
                aria-label="Copy optimized prompt"
              >
                {copiedOptimized ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <textarea
            value={optimizedPrompt}
            onChange={(e) => setOptimizedPrompt(e.target.value)}
            placeholder={
              isOptimizing
                ? "Optimizing prompt..."
                : "Your compressed prompt will appear here - fully editable, ready to copy."
            }
            spellCheck={false}
            className="w-full flex-1 min-h-[260px] h-[320px] lg:h-[360px] pt-5 px-4 pb-4 font-mono text-sm leading-relaxed bg-transparent text-slate-200 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/40 scroll-prompt"
          />

          {/* Primary action: copy the result and use it anywhere */}
          <div className="p-3 bg-surface-raised/60 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Editable - tweak it before you copy</span>
            </div>

            <button
              onClick={() => handleCopy(optimizedPrompt, "opt")}
              disabled={!optimizedPrompt.trim()}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                !optimizedPrompt.trim()
                  ? /* Disabled: flat, dim, no glow, clearly inert. */
                    "bg-surface-raised text-slate-500 border border-slate-700/60 cursor-not-allowed"
                  : copiedOptimized
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                    : "bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-500 hover:to-cyan-500"
              }`}
            >
              {copiedOptimized ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{copiedOptimized ? "Copied ✓" : "Copy Optimized Prompt"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile-only sticky action bar. On narrow screens the two panels stack and
          the control bar scrolls out of reach long before the user has finished
          reading their own prompt, so the primary action follows them down. */}
      <div className="lg:hidden sticky bottom-3 z-30">
        <button
          onClick={onOptimize}
          disabled={isOptimizing || !originalPrompt.trim() || !tokenizerReady}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 text-white shadow-lg shadow-violet-500/30 active:from-violet-500 active:to-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <Sparkles className="w-4 h-4" />
          {isOptimizing
            ? "Optimizing..."
            : tokenizerReady
              ? "Optimize Prompt"
              : "Loading tokenizer..."}
        </button>
      </div>
    </div>
  );
}

