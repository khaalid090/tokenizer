"use client";

import React, { useMemo } from "react";
import { diffWords, Change } from "diff";

interface DiffViewerProps {
  original: string;
  optimized: string;
}

export function DiffViewer({ original, optimized }: DiffViewerProps) {
  const diffParts = useMemo<Change[]>(() => {
    if (!original && !optimized) return [];
    return diffWords(original, optimized);
  }, [original, optimized]);

  if (!original && !optimized) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Input a prompt above and optimize to see word-level diff analysis.
      </div>
    );
  }

  return (
    <div className="p-4 font-mono text-sm leading-relaxed overflow-y-auto max-h-[420px] rounded-xl bg-surface-raised/70 border border-slate-800 text-slate-200">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80 text-xs font-sans text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/40 border border-rose-500 inline-block" />
            <span className="text-rose-400">Removed</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500 inline-block" />
            <span className="text-emerald-400">Kept / Added</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 inline-block" />
            <span className="text-slate-400">Unchanged</span>
          </span>
        </div>
        <span className="text-slate-500">Live Word-Level Diff</span>
      </div>

      <div className="whitespace-pre-wrap break-words">
        {diffParts.map((part: Change, index: number) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="bg-emerald-950/80 text-emerald-300 px-1 py-0.5 rounded border border-emerald-700/50 shadow-sm"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="bg-rose-950/80 text-rose-300 line-through px-1 py-0.5 rounded border border-rose-800/40 opacity-75"
              >
                {part.value}
              </span>
            );
          }
          return <span key={index} className="text-slate-300">{part.value}</span>;
        })}
      </div>
    </div>
  );
}
