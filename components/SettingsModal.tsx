"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Layers, DollarSign, Palette, ShieldCheck, Sliders, Lock, Crown, CreditCard, Clock } from "lucide-react";
import { AppSettings, CompressionMode, ThemeName } from "@/lib/types";
import { isPro, downgradeToFree, getLicenseHistory } from "@/lib/license";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

const MODES: { id: CompressionMode; label: string; hint: string; pro?: boolean }[] = [
  { id: "lossless", label: "Lossless", hint: "Whitespace + filler only" },
  { id: "balanced", label: "Balanced", hint: "Dedupe, restructure, trim" },
  { id: "aggressive", label: "Aggressive", hint: "Maximum compression" },
  {
    id: "lossy",
    label: "Lossy",
    hint: "Deletes low-value sentences to hit a target",
    pro: true,
  },
];

const THEMES: { id: ThemeName; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

const PRICE_PRESETS: { label: string; value: number }[] = [
  { label: "$0.15", value: 0.15 },
  { label: "$2.50", value: 2.5 },
  { label: "$3.00", value: 3 },
  { label: "$15.00", value: 15 },
];

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: SettingsModalProps) {
  const [priceText, setPriceText] = useState(String(settings.pricePer1M));
  const [pro, setPro] = useState<boolean>(isPro());
  const [history, setHistory] = useState(() => getLicenseHistory());

  // Re-sync the price field, license state, and history whenever the modal opens.
  useEffect(() => {
    if (isOpen) {
      setPriceText(String(settings.pricePer1M));
      setPro(isPro());
      setHistory(getLicenseHistory());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    onSaveSettings({ ...settings, [key]: value });

  const commitPrice = (raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) update("pricePer1M", parsed);
    else setPriceText(String(settings.pricePer1M));
  };

  const doDowngrade = () => {
    downgradeToFree();
    setPro(false);
  };

  if (typeof document === "undefined") return null;

  // Portal onto <body>: the app header uses `backdrop-blur`, which creates its
  // own stacking context and would otherwise trap this overlay behind the page.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-slate-800 p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
      <h3 className="text-base font-semibold text-slate-50">Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-surface-raised transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tier card: shows the current license and a downgrade control.
            The upgrade button is gone — the dev build defaults to unlocked
            and a real checkout is wired in later. */}
        <div
          className={`rounded-2xl border p-4 ${
            pro
              ? "bg-gradient-to-br from-cyan-950/60 to-violet-950/40 border-cyan-700/60"
              : "bg-surface-raised/60 border-slate-800"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                pro ? "bg-gradient-to-br from-cyan-500 to-violet-600" : "bg-slate-800"
              }`}
            >
              {pro ? (
                <Crown className="w-5 h-5 text-white" />
              ) : (
                <Lock className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-50">
                  {pro ? "Tokenizer Pro" : "Free plan"}
                </h4>
                <span
                  className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded font-mono tracking-wider ${
                    pro
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {pro ? "active" : "free"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {pro
                  ? "Lossy mode and every future pro feature are unlocked."
                  : "Lossless, balanced and aggressive are yours forever. Lossy deletes content, so it is gated behind Pro."}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Layers className="w-3.5 h-3.5 text-cyan-400" /> 3 free compression modes
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              {pro ? (
                <Crown className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              )}{" "}
              Lossy deletion mode
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={doDowngrade}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-raised border border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-500/50 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" /> Downgrade to free
            </button>
            <span className="ml-2 text-[10px] text-slate-500">
              You lose access to Lossy until you re-subscribe.
            </span>
          </div>
        </div>

        {/* License history: every upgrade/downgrade with a timestamp. */}
        <div className="rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <h4 className="text-sm font-semibold text-slate-200">License history</h4>
          </div>
          {history.length === 0 ? (
            <p className="text-[11px] text-slate-500">No changes recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((event, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <span className="flex items-center gap-1.5 text-slate-300">
                    {event.tier === "pro" ? (
                      <Crown className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    {event.label}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(event.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-5 text-xs">
          {/* Privacy note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-violet-950/40 border border-violet-800/40 text-violet-200">
            <ShieldCheck className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Local-only by design:</strong> prompts are compressed on your device.
              Tokenizer has no API key field, no account and never sends your prompt to an AI
              provider. You copy the optimized prompt and use it wherever you like.
            </span>
          </div>

          {/* Default compression mode */}
          <div>
            <label className="flex items-center gap-1.5 font-medium text-slate-300 mb-2 uppercase tracking-wider text-[11px]">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Default compression mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => {
                const locked = m.pro && !pro;
                return (
                  <button
                    key={m.id}
                    disabled={locked}
                    onClick={() => update("mode", m.id)}
                    title={
                      locked
                        ? "Upgrade to Pro to enable Lossy"
                        : undefined
                    }
                    className={`rounded-xl border p-3 text-left transition-all ${
                      settings.mode === m.id
                        ? "border-cyan-500/60 bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                        : locked
                        ? "border-slate-800 bg-slate-900/40 cursor-not-allowed opacity-60"
                        : "border-slate-800 bg-surface-raised hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div
                        className={`text-xs font-semibold ${
                          settings.mode === m.id ? "text-cyan-300" : "text-slate-300"
                        }`}
                      >
                        {m.label}
                      </div>
                      {m.pro ? (
                        locked ? (
                          <Lock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        ) : (
                          <Crown className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                        )
                      ) : null}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{m.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing estimate */}
          <div>
            <label className="flex items-center gap-1.5 font-medium text-slate-300 mb-2 uppercase tracking-wider text-[11px]">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Price per 1M tokens (USD)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                onBlur={(e) => commitPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPrice((e.target as HTMLInputElement).value);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                input tokens
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {PRICE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setPriceText(String(preset.value));
                    update("pricePer1M", preset.value);
                  }}
                  className="px-2 py-0.5 rounded-lg border border-slate-800 bg-surface-raised text-[10px] font-mono text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              <span className="text-[10px] text-slate-500">
                Quick presets - set whatever your provider charges.
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Used only to estimate the cost of the tokens Tokenizer removed.
            </p>
          </div>

          {/* Appearance */}
          <div>
            <label className="flex items-center gap-1.5 font-medium text-slate-300 mb-2 uppercase tracking-wider text-[11px]">
              <Palette className="w-3.5 h-3.5 text-slate-400" /> Appearance
            </label>
            <div className="inline-flex p-1 bg-surface-raised/70 rounded-xl border border-slate-800">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update("theme", t.id)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    settings.theme === t.id
                      ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-violet-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-600/20"
          >
            Done & Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

