"use client";

import React, { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Sparkles, DollarSign, Layers, ShieldCheck, Zap } from "lucide-react";
import { SavingsGauge } from "./SavingsGauge";
import { AnimatedCounter } from "./AnimatedCounter";
import { CompressionMode } from "@/lib/types";

interface SavingsCardProps {
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
  costSavedUSD: number;
  protectedSpansCount: number;
  mode: CompressionMode;
  optimizeMs?: number;
  /** False until the first optimization completes: render placeholders, not zeros. */
  hasResult: boolean;
}

export function SavingsCard({
  originalTokens,
  optimizedTokens,
  tokensSaved,
  percentSaved,
  costSavedUSD,
  protectedSpansCount,
  mode,
  optimizeMs,
  hasResult,
}: SavingsCardProps) {
  const firedConfettiRef = useRef(false);

  useEffect(() => {
    // Confetti / sparkle burst when savings exceed 30%
    if (hasResult && percentSaved >= 30 && !firedConfettiRef.current) {
      firedConfettiRef.current = true;
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#8b5cf6", "#06b6d4", "#ec4899", "#10b981"],
        });
      } catch {
        // ignore in SSR / unsupported environments
      }
    } else if (percentSaved < 30) {
      firedConfettiRef.current = false;
    }
  }, [percentSaved, hasResult]);

  // Before the first run there is nothing to report. A confident "0%",
  // "$0.00000" and "100% of original size" reads like a measurement that came
  // back empty, so every figure becomes an em dash and the row explains why.
  const dash = <span className="text-slate-500">&mdash;</span>;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 p-4">
      {/* Background glow spots */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-6 relative z-10">
        {/* Left: compact gauge and headline */}
        <div className="flex items-center gap-4 min-w-0">
          <SavingsGauge percentage={percentSaved} isEmpty={!hasResult} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Token Efficiency
              </span>
              {hasResult && percentSaved >= 30 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40">
                  High Savings
                </span>
              )}
            </div>

            {hasResult ? (
              <div className="text-2xl font-extrabold text-slate-50 tracking-tight">
                <AnimatedCounter value={tokensSaved} />{" "}
                <span className="text-xs font-normal text-slate-400">tokens trimmed</span>
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-400 leading-snug max-w-[30ch]">
                Paste a prompt and click Optimize to see your savings.
              </div>
            )}

            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-violet-400" />
                Compression Mode:
                <span className="text-slate-200 font-mono font-medium capitalize">{mode}</span>
              </span>
              {hasResult && typeof optimizeMs === "number" && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    &bull;
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Time to optimize:
                    <span className="text-slate-200 font-mono font-medium">{optimizeMs} ms</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Right: metric mini cards */}
        <div className="grid grid-cols-3 gap-2 w-full lg:w-auto lg:flex-1 lg:max-w-[520px]">
          {/* Estimated cost saved */}
          <div className="p-2.5 rounded-xl bg-surface-raised/50 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider">Est. Saved</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-emerald-400 font-mono">
              {hasResult ? `$${costSavedUSD.toFixed(5)}` : dash}
            </div>
            <div className="text-[10px] text-slate-400">at your configured rate</div>
          </div>

          {/* Protected spans survived */}
          <div className="p-2.5 rounded-xl bg-surface-raised/50 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider">Protected</span>
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-base font-bold text-cyan-300 font-mono">
              {hasResult ? <AnimatedCounter value={protectedSpansCount} /> : dash}
            </div>
            <div className="text-[10px] text-slate-400">100% verified intact</div>
          </div>

          {/* Original vs optimized */}
          <div className="p-2.5 rounded-xl bg-surface-raised/50 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider">Ratio</span>
              <Zap className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-base font-bold text-violet-300 font-mono">
              {hasResult
                ? `${Math.round((optimizedTokens / originalTokens) * 100)}%`
                : dash}
            </div>
            <div className="text-[10px] text-slate-400">of original size</div>
          </div>
        </div>
      </div>
    </div>
  );
}

