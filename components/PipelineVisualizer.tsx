"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Filter,
  Layers,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { PipelineStageResult } from "@/lib/types";

interface PipelineVisualizerProps {
  stages: PipelineStageResult[];
  activeStageIndex?: number;
  isProcessing?: boolean;
  /** Collapsible strip. When `onToggleExpanded` is absent the strip is always open. */
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

const STAGE_CONFIG = [
  { key: "original", label: "Input", icon: Layers, desc: "Raw prompt ingest" },
  { key: "normalize", label: "Normalize", icon: Sparkles, desc: "Filler cleanup" },
  { key: "dedupe", label: "Dedupe", icon: Filter, desc: "Repetition removal" },
  { key: "restructure", label: "Restructure", icon: ArrowRight, desc: "Imperative formatting" },
  { key: "validate", label: "Validate", icon: ShieldCheck, desc: "Span preservation gate" },
];

/** Accent colour per stage, used for the glow while that stage is running. */
const STAGE_GLOW: Record<string, string> = {
  original: "rgba(148, 163, 184, 0.45)",
  normalize: "rgba(139, 92, 246, 0.5)",
  dedupe: "rgba(236, 72, 153, 0.45)",
  restructure: "rgba(6, 182, 212, 0.5)",
  validate: "rgba(16, 185, 129, 0.45)",
};

export function PipelineVisualizer({
  stages,
  isProcessing = false,
  isExpanded,
  onToggleExpanded,
}: PipelineVisualizerProps) {
  const stageMap = new Map(stages.map((s) => [s.stage, s]));

  // The pipeline runs synchronously, so there is nothing to observe between
  // frames. Instead a virtual clock runs for the length of the call, lighting the
  // cards in sequence and ticking them off as it goes.
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (!isProcessing) {
      setCursor(-1);
      return;
    }
    setCursor(0);
    const timer = window.setInterval(() => {
      setCursor((c) => (c >= STAGE_CONFIG.length - 1 ? c : c + 1));
    }, 190);
    return () => window.clearInterval(timer);
  }, [isProcessing]);

  const completedCount = STAGE_CONFIG.filter(
    (c) => c.key === "original" || stageMap.has(c.key as any)
  ).length;

  const collapsible = typeof onToggleExpanded === "function";
  const expanded = isExpanded ?? true;

  return (
    <div className="w-full rounded-2xl bg-surface/60 backdrop-blur-md border border-slate-800/80 overflow-hidden">
      {/* Slim header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isProcessing ? "bg-cyan-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Optimization Pipeline
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            {isProcessing
              ? `running · stage ${cursor + 1}/${STAGE_CONFIG.length}`
              : stages.length > 0
                ? `${completedCount}/${STAGE_CONFIG.length} complete`
                : "5 stages"}
          </span>
        </div>

        {collapsible && (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors px-1.5 py-0.5 rounded"
          >
            {expanded ? "Hide" : "Show"}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {STAGE_CONFIG.map((conf, idx) => {
              const stageData = stageMap.get(conf.key as any);
              const hasRun = Boolean(stageData);
              const isActive = isProcessing && cursor === idx;
              const isDone = hasRun || (isProcessing && cursor > idx);
              const Icon = conf.icon;

              // Idle cards deliberately carry no border, no shadow and no hover
              // affordance: they report state, they are not clickable.
              const cardState = isActive
                ? "bg-surface-raised border-cyan-500/40 stage-glow is-active"
                : isDone
                  ? "bg-surface-raised/60 border-emerald-500/25"
                  : "bg-surface/40 border-transparent";

              return (
                <div
                  key={conf.key}
                  style={
                    {
                      "--stage-glow": STAGE_GLOW[conf.key] ?? "rgba(6,182,212,0.35)",
                    } as React.CSSProperties
                  }
                  className={`relative overflow-hidden rounded-xl border px-2.5 py-2 transition-colors duration-300 ${cardState}`}
                >
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] stage-sweep bg-gradient-to-r from-violet-500 via-cyan-400 to-pink-500" />
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">
                      0{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-100 leading-tight">
                      {conf.label}
                    </span>
                    <span className="ml-auto flex-shrink-0">
                      {isActive ? (
                        <span className="block w-3 h-3 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
                      ) : isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stage-check" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight mt-1">
                    {conf.desc}
                  </p>

                  {stageData && (
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
                      <span className="text-slate-300">{stageData.tokens} tok</span>
                      {stageData.tokensSaved > 0 && (
                        <span className="text-emerald-400 font-semibold">
                          &minus;{stageData.tokensSaved}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
