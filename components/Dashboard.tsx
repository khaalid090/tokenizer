"use client";

import React, { useState } from "react";
import { TrendingUp, DollarSign, Database, History, Zap, CheckCircle2, Server, HardDrive, Cloud } from "lucide-react";
import { SessionStats, OptimizationResult } from "@/lib/types";
import { AnimatedCounter } from "./AnimatedCounter";

interface DashboardProps {
  stats: SessionStats;
  history: OptimizationResult[];
  onSelectHistoryItem: (item: OptimizationResult) => void;
  onClearHistory: () => void;
  isDbConnected?: boolean;
}

export function Dashboard({
  stats,
  history,
  onSelectHistoryItem,
  onClearHistory,
  isDbConnected = true,
}: DashboardProps) {
  return (
    <div className="w-full space-y-6">
      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cumulative Tokens Saved */}
        <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-cyan-500/20">
            <Zap className="w-12 h-12" />
          </div>
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">
            Total Tokens Saved
          </div>
          <div className="text-3xl font-extrabold text-cyan-400 font-mono">
            <AnimatedCounter value={stats.totalTokensSaved} />
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Across {stats.optimizationsCount} compression requests
          </div>
        </div>

        {/* Total Cost Saved */}
        <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/20">
            <DollarSign className="w-12 h-12" />
          </div>
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">
            Total Cost Saved
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">
            ${stats.totalCostSavedUSD.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Calculated against live provider rates
          </div>
        </div>

        {/* Avg Compression Ratio */}
        <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-violet-500/20">
            <TrendingUp className="w-12 h-12" />
          </div>
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">
            Avg. Compression Ratio
          </div>
          <div className="text-3xl font-extrabold text-violet-400 font-mono">
            {stats.averageCompressionRatio}%
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Tokens reduced without losing meaning
          </div>
        </div>

        {/* Total Input Tokens Processed */}
        <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-pink-500/20">
            <Database className="w-12 h-12" />
          </div>
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">
            Tokens Processed
          </div>
          <div className="text-3xl font-extrabold text-pink-400 font-mono">
            <AnimatedCounter value={stats.totalTokensOriginal} />
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Output: {stats.totalTokensOptimized.toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Optimization History ({history.length})
            </h3>
            {isDbConnected ? (
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                <Cloud className="w-3 h-3 text-emerald-400" />
                Supabase Synced
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded-full">
                <HardDrive className="w-3 h-3 text-amber-400" />
                Local Cache
              </span>
            )}
          </div>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-slate-500 hover:text-rose-400 transition-colors"
            >
              Clear History
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No past optimizations in this session yet. Try trimming a prompt!
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectHistoryItem(item)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-surface-raised/60 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-surface-raised cursor-pointer transition-all"
              >
                <div className="flex-1 pr-4 mb-2 sm:mb-0">
                  <div className="text-xs text-slate-300 font-mono line-clamp-1 group-hover:text-cyan-300 transition-colors">
                    {item.originalPrompt}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span className="capitalize text-slate-400">{item.mode}</span>
                    <span>•</span>
                    <span suppressHydrationWarning>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400">
                      {item.tokensSaved} tokens saved ({item.percentSaved}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
                    +${item.costSavedUSD.toFixed(5)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
