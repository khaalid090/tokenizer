"use client";

import React from "react";

export function SavingsGauge({
  percentage,
  isEmpty = false,
}: {
  percentage: number;
  /** No run yet: show a muted, undrawn dial instead of a confident "0%". */
  isEmpty?: boolean;
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const validPercent = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (validPercent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-[104px] h-[104px] flex-shrink-0">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Background Track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-slate-800"
        />
        {/* Animated Gradient Stroke */}
        {!isEmpty && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="url(#neonGradient)"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="gauge-arc"
            // The CSS keyframe interpolates from an empty arc to this value, so the
            // target has to reach the stylesheet as a custom property.
            style={{ "--gauge-target": String(strokeDashoffset) } as React.CSSProperties}
            strokeLinecap="round"
          />
        )}
        <defs>
          <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        {isEmpty ? (
          <>
            <span className="text-2xl font-extrabold tracking-tight text-slate-500 font-mono">
              &mdash;
            </span>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Saved
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-extrabold tracking-tight text-slate-50 font-mono">
              {percentage}%
            </span>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Saved
            </span>
          </>
        )}
      </div>
    </div>
  );
}
