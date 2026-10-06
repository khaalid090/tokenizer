"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  LogIn,
  LogOut,
  User as UserIcon,
  Loader2,
  Cloud,
  HardDrive,
  ChevronDown,
  Settings,
} from "lucide-react";
import {
  AuthResult,
  isSupabaseConfigured,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
} from "@/lib/supabase";

/**
 * Account panel for the Supabase-backed Dashboard.
 *
 * Tokenizer still works fully without an account - compression always runs
 * locally. Signing in only enables cloud sync of history and dashboard stats.
 *
 * The signed-in state renders as a single account pill followed by a `children`
 * slot and a Sign out button, so the caller can keep the header ordered as
 * account · download · sign out without AuthPanel reaching into the header.
 */
export function AuthPanel({
  userEmail,
  isSyncing,
  isSupabase,
  onSignedIn,
  onSignedOut,
  onOpenSettings,
  children,
}: {
  userEmail: string | null;
  isSyncing: boolean;
  isSupabase: boolean;
  onSignedIn: () => void;
  onSignedOut: () => void;
  onOpenSettings: () => void;
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finish = async (result: AuthResult) => {
    if (!result.success) {
      setError(result.error || "Something went wrong.");
      return;
    }
    if (result.needsEmailConfirmation) {
      setNotice("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
    } else {
      setIsOpen(false);
      setPassword("");
      onSignedIn();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await finish(
        mode === "signup" ? await signUp(email, password) : await signIn(email, password)
      );
    } catch (err) {
      // The lib helpers already convert transport failures into AuthResult,
      // so reaching here means something unexpected. Surface it instead of
      // letting the rejection escape as an unhandled promise rejection.
      console.error("Auth submit failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Not configured: the app runs in local-only mode, so show a quiet note.
  if (!isSupabase) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
        <HardDrive className="w-3 h-3" />
        <span>Local-only mode &mdash; add Supabase keys to enable cloud sync</span>
      </div>
    );
  }

  // Signed in
  if (userEmail) {
    const initials = userEmail
      .slice(0, 2)
      .toUpperCase();
    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1 rounded-full bg-surface-raised border border-slate-800 hover:border-slate-700 transition-colors"
            aria-label="Account menu"
            aria-expanded={isOpen}
          >
            <span
              title={userEmail}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 max-w-[180px]"
            >
              {isSyncing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Cloud className="w-3 h-3" />
              )}
              <span className="truncate">{userEmail}</span>
            </span>
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 text-white text-[11px] font-bold flex items-center justify-center">
              {initials}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-surface border border-slate-800 shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                  Signed in
                </p>
                <p className="text-xs text-slate-300 font-mono truncate" title={userEmail}>
                  {userEmail}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-surface-raised transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Settings
              </button>
            </div>
          )}
        </div>

        {/* Slot for sibling widgets (e.g. the download pill) that should sit
            between the account and the Sign out button. */}
        {children}

        <button
          onClick={async () => {
            await signOut();
            onSignedOut();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono bg-surface-raised border border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-500/50 transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    );
  }

  // Signed out
  return (
    <>
      <button
        onClick={() => {
          setIsOpen((v) => !v);
          setError(null);
          setNotice(null);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono bg-surface-raised border border-slate-700 text-slate-300 hover:text-slate-50 hover:border-cyan-500/50 transition-colors"
      >
        <LogIn className="w-3 h-3" />
        Sign in to sync
      </button>

      {isOpen &&
        // Rendered in a portal on <body>: the header is a `backdrop-blur`
        // element, which creates its own stacking context and would otherwise
        // trap this z-50 overlay beneath the page content.
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl bg-surface border border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <UserIcon className="w-5 h-5 text-cyan-400" />
    <h3 className="text-base font-semibold text-slate-50">
                {mode === "signin" ? "Sign in" : "Create account"}
              </h3>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Optional. Compression always runs on your device &mdash; an account only
              syncs your history and dashboard across devices.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 text-sm"
              />

              {error && (
                <p className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/40 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {notice && (
                <p className="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-md disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="flex items-center gap-3 text-[10px] text-slate-600">
              <span className="h-px flex-1 bg-slate-800" />
              OR
              <span className="h-px flex-1 bg-slate-800" />
            </div>

            <button
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await signInWithGoogle();
                  if (!result.success) setError(result.error || "Google sign-in failed.");
                } catch (err) {
                  console.error("Google sign-in failed:", err);
                  setError("Google sign-in failed. Please try again.");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 110-12.4c1.76 0 2.94.75 3.62 1.4l2.53-2.43A9.4 9.4 0 0012 2a10 10 0 100 20c5.77 0 9.6-4.05 9.6-9.76 0-.66-.07-1.16-.16-1.66H12z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center justify-between pt-1 text-[11px]">
              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
