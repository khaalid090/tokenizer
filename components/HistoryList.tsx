"use client";

import React, { useState } from "react";
import { ArchiveRestore, Check, Copy, Database, Delete, DollarSign, Zap } from "lucide-react";
import { OptimizationResult, SessionStats } from "@/lib/types";

interface HistoryListItemProps {
  item: OptimizationResult;
  isDeleting: boolean;
  onDelete: (id: number) => void;
  onRestore: (item: OptimizationResult) => void;
  onCopy: (text: string) => void;
  isCopied: boolean;
  isCopiedOriginal: boolean;
}

function HistoryListItem({
  item,
  isDeleting,
  onDelete,
  onRestore,
  onCopy,
  isCopied,
  isCopiedOriginal,
}: HistoryListItemProps) {
  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    setExpanded(false);
    if (item.id != null) await onDelete(item.id);
  };

  const handleRestore = async () => {
    setExpanded(false);
    await onRestore(item);
  };

  const handleCopy = async () => {
    setExpanded(false);
    await onCopy(item.optimizedPrompt);
  };

  return (
    <div
      className="group flex flex-col gap-3 p-4 rounded-xl bg-surface-raised/60 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-surface-raised transition-all"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        setExpanded((v) => !v);
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              {item.mode}
            </span>
            <span className="text-[10px] text-slate-600">�</span>
            <span className="text-[10px] text-slate-500 font-mono">
              {new Date(item.timestamp).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-600">�</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                item.tokensSaved > 0
                  ? "text-emerald-600 bg-emerald-100/40 dark:bg-emerald-900/30"
                  : "text-slate-500"
              }`}
            >
              {item.tokensSaved} tokens saved
            </span>
          </div>
          <div className="text-sm text-slate-300 font-mono line-clamp-2 group-hover:text-cyan-300 transition-colors">
            Original: {item.originalPrompt}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-mono px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 whitespace-nowrap">
            +${item.costSavedUSD.toFixed(4)}
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {item.percentSaved}% off
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800/80 pt-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
              Optimized
            </div>
            <div className="text-sm text-slate-300 font-mono bg-slate-900/50 border border-slate-800 rounded p-3 max-h-40 overflow-y-auto">
              {item.optimizedPrompt}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRestore}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/50 hover:border-cyan-700 transition-colors disabled:opacity-50"
            >
              {isCopiedOriginal ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <ArchiveRestore className="w-3.5 h-3.5" />
              )}
              Copy original
            </button>
            <button
              onClick={handleCopy}
              disabled={isCopied}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
            >
              {isCopied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              Copy optimized
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-400 hover:bg-rose-900/50 hover:border-rose-700 transition-colors disabled:opacity-50"
            >
              <Delete className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface HistoryListProps {
  items: OptimizationResult[];
  stats: SessionStats;
  onDelete: (id: number) => Promise<void>;
  isSyncing: boolean;
}

export function HistoryList({
  items,
  stats,
  onDelete,
  isSyncing,
}: HistoryListProps) {
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedOriginalId, setCopiedOriginalId] = useState<number | null>(null);

  const handleRestore = async (item: OptimizationResult) => {
    try {
      await navigator.clipboard.writeText(item.originalPrompt);
      setCopiedOriginalId(item.id ?? null);
      setTimeout(() => setCopiedOriginalId(null), 2000);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await onDelete(id);
    } catch (err) {
      console.error("Failed to delete history item:", err);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCopy = async (optimizedPrompt: string) => {
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      setCopiedId(Date.now());
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-200">
            Optimization History
          </h2>
          <span className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
            {items.length} saved
          </span>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-slate-400">
              <Zap className="w-3.5 h-3.5 text-cyan-500" />
              {stats.optimizationsCount} total optimizations
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Database className="w-3.5 h-3.5" />
              {stats.totalTokensSaved.toLocaleString()} tokens saved
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <DollarSign className="w-3.5 h-3.5" />
              ${stats.totalCostSavedUSD.toFixed(2)} saved
            </span>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center bg-surface-raised/30 border border-slate-800/60 rounded-xl">
          <ArchiveRestore className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            No optimizations saved yet. Run your first compression to see it here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <HistoryListItem
              key={item.id}
              item={item}
              isDeleting={deletingIds.has(item.id ?? -1)}
              onRestore={handleRestore}
              onDelete={handleDelete}
              onCopy={handleCopy}
              isCopied={copiedId === item.id}
              isCopiedOriginal={copiedOriginalId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
