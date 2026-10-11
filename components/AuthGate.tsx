"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { AuthResult, sendPasswordReset, signIn, signInWithGoogle, signUp } from "@/lib/supabase";

/** Google "G" mark, inlined so the gate needs no extra asset request. */
function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}

/**
 * Full-screen sign-in wall shown before the web app is usable.
 *
 * This is the "like Claude Web" entry point: one centred card, Google first,
 * email/password underneath, and no way into the workspace until a session
 * exists. The desktop build never renders this (see isDesktop in app/page.tsx)
 * because it must keep working offline with no account at all.
 */
export function AuthGate({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"form" | "google" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };
  // __TAIL__
const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Choose a password with at least 6 characters.");
      return;
    }
    if (mode === "signin" && !password) {
      setError("Enter your password.");
      return;
    }

    setBusy("form");
    resetMessages();

    try {
      const result: AuthResult =
        mode === "signup"
          ? await signUp(email, password)
          : await signIn(email, password);

      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }

      // Accounts are auto-confirmed at sign-up, so sign-in returns a session
      // immediately - no confirmation email, no extra round-trip.
      onSignedIn();
    } catch (err) {
      // The lib helpers already turn transport failures into an AuthResult, so
      // reaching here means something unexpected. Surface it rather than
      // letting the rejection escape as an unhandled promise rejection.
      console.error("Auth gate submit failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy("google");
    resetMessages();
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error || "Google sign-in failed.");
        setBusy(null);
      }
      // On success the browser navigates to Google, so `busy` deliberately stays
      // set to keep the button disabled during the round-trip.
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setError("Google sign-in failed. Please try again.");
      setBusy(null);
    }
  };

  const handleForgot = async () => {
    if (busy) return;
    if (!email.trim()) {
      setError('Enter your email address first, then tap "Forgot?".');
      return;
    }
    setBusy("reset");
    resetMessages();
    try {
      const result = await sendPasswordReset(email);
      if (!result.success) {
        setError(result.error || "Could not send the reset email.");
      } else {
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch {
      setError("Could not send the reset email. Please try again.");
    } finally {
setBusy(null);
    }
  };

  const isSignup = mode === "signup";
return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background neon mesh, matching the app shell. */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-tr from-violet-600 to-cyan-500 to-pink-500 rounded-full blur-[120px] pointer-events-none"
        style={{ opacity: 0.18 }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-[450px] h-[350px] bg-cyan-600 rounded-full blur-[100px] pointer-events-none"
        style={{ opacity: 0.12 }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-7">
          <img
            src="/logo.svg"
            alt="Tokenizer"
            width={52}
            height={52}
            className="w-[52px] h-[52px] rounded-2xl mb-4"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-50 font-sans">
            Welcome to Tokenizer
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            {isSignup
              ? "Create an account to compress prompts and sync your history."
              : "Sign in to continue to your workspace."}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-surface/90 backdrop-blur-xl border border-slate-800/80 shadow-glass p-6">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "google" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GoogleMark />
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
              or
            </span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <label className="block mb-1.5 text-xs font-medium text-slate-300">
              Email
            </label>
            <div className="relative mb-3">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  resetMessages();
                }}
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
              />
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
              {!isSignup && (
                <button
                  type="button"
                  onClick={handleForgot}
                  disabled={busy !== null}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors"
                >
                  Forgot?
                </button>
              )}
            </div>
            <div className="relative mb-4">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  resetMessages();
                }}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 6 characters" : "Your password"}
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300"
              >
                {error}
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="mb-3 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300"
              >
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy === "form" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            {isSignup ? "Already have an account?" : "New to Tokenizer?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "signin" : "signup");
                resetMessages();
              }}
              className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>

        {/* Reassurance */}
        <ul className="mt-6 space-y-2 text-[11px] text-slate-500 font-mono">
          <li className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5 text-cyan-500/70 flex-shrink-0" />
            Compression still runs 100% on your machine
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70 flex-shrink-0" />
            Row Level Security keeps your history private to you
          </li>
        </ul>
      </div>
    </div>
  );
}