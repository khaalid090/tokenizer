"use client";

import React, { useState } from "react";
import { Scissors, Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { CutCandidate } from "@/lib/types";

interface CutSelectorProps {
  candidates: CutCandidate[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: () => void;
  /** Tokens saved by the current selection. */
  pendingTokens: number;
  appliedIds: string[];
}

/**
 * Interactive cut selection.
 *
 * The automatic optimiser could not be trusted to decide what is expendable -
 * it repeatedly deleted requirements. So nothing is removed here without an
 * explicit tick, and the user always sees the exact text that will go.
 */
export function CutSelector({
  candidates,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onApply,
  pendingTokens,
  appliedIds,
}: CutSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showApplied, setShowApplied] = useState(false);

  if (candidates.length === 0) return null;

  const selectedSet = new Set(selected);
  const appliedSet = new Set(appliedIds);

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-xs">
      <div className="flex flex-wrap items-center gap-3 p-3.5">
        <Scissors className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold text-cyan-200">
            Need more savings? Choose what to remove.
          </div>
          <div className="text-cyan-300/70 mt-0.5">
            {candidates.length} optional {candidates.length === 1 ? "item" : "items"} found.
            Nothing is deleted until you tick it and apply.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 transition-colors"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {open ? "Hide" : "Review"}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={selected.length === 0}
            className="px-3 py-1 rounded-lg font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Apply{selected.length > 0 ? ` (${pendingTokens}t)` : ""}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-cyan-500/25">
          <div className="flex items-center gap-3 px-3.5 py-2 text-[11px] font-mono text-cyan-300/70">
            <button type="button" onClick={onSelectAll} className="hover:text-cyan-200 underline">
              select all
            </button>
            <button type="button" onClick={onClear} className="hover:text-cyan-200 underline">
              clear
            </button>
            <span className="ml-auto">
              {selected.length} selected &middot; saves ~{pendingTokens} tokens
            </span>
          </div>

          <ul className="max-h-72 overflow-y-auto divide-y divide-cyan-500/10">
            {candidates.map((c) => {
              const isSelected = selectedSet.has(c.id);
              const isApplied = appliedSet.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex items-start gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-cyan-500/5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(c.id)}
                      className="mt-0.5 accent-cyan-500 flex-shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className={`break-words ${isSelected ? "line-through opacity-50" : ""}`}
                      >
                        {c.text}
                      </span>
                      <span className="ml-2 text-[10px] font-mono text-cyan-400/60">
                        &minus;{c.tokens}t &middot; {c.reason}
                      </span>
                    </span>
                    {isApplied && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 flex-shrink-0">
                        <Check className="w-3 h-3" /> removed
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex items-start gap-2 px-3.5 py-2 border-t border-cyan-500/20 text-[11px] text-cyan-300/60">
            <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              Headings, code, numbers, file paths, constraint keywords, the opening line and
              everything under Deliverables / Constraints / Requirements are never offered
              &mdash; they cannot be removed here.
            </span>
          </div>

          {appliedIds.length > 0 && (
            <div className="border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowApplied((v) => !v)}
                className="w-full text-left px-3.5 py-2 text-[11px] font-mono text-emerald-300/80 hover:bg-cyan-500/5"
              >
                {showApplied ? "Hide" : "Show"} {appliedIds.length} already removed
              </button>
              {showApplied && (
                <ul className="px-3.5 pb-2 space-y-1">
                  {candidates
                    .filter((c) => appliedSet.has(c.id))
                    .map((c) => (
                      <li
                        key={c.id}
                        className="line-through opacity-60 break-words text-emerald-200/70"
                      >
                        {c.text}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
