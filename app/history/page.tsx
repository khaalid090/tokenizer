import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { History, Layers } from "lucide-react";
import { HistoryList } from "@/components/HistoryList";
import type { OptimizationResult, SessionStats } from "@/lib/types";
import { emptyStats } from "@/lib/types";
import { fetchHistoryWithBearer } from "@/lib/server-history";
import {
  extractBearerFromCookie,
  verifyBearerFast,
  authCookieName,
} from "@/lib/server-auth";
import { deleteHistoryItem } from "./actions";

export const metadata: Metadata = {
  title: "History - Tokenizer",
  description: "Review, copy and delete your saved prompt optimizations.",
};

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  // Cloud history requires Supabase. Missing env used to crash with
  // `new URL(undefined)` inside authCookieName (digest-only error in prod).
  if (!supabaseUrl || !supabaseAnonKey) {
    redirect("/");
  }

  const cookieStore = await cookies();
  let bearer = "";
  try {
    bearer = extractBearerFromCookie(
      cookieStore.get(authCookieName(supabaseUrl))?.value
    );
  } catch {
    redirect("/");
  }

  if (!bearer) {
    redirect("/");
  }

  // Local-first JWT check (~1ms); falls back to /auth/v1/user when needed.
  const userId = await verifyBearerFast(
    supabaseUrl,
    supabaseAnonKey,
    bearer
  );
  if (!userId) {
    redirect("/");
  }

  // Read from Supabase with the caller's JWT (RLS). SQLite is not available
  // on Vercel serverless and was the wrong store for signed-in cloud users.
  let history: OptimizationResult[] = [];
  let stats: SessionStats = emptyStats();
  try {
    const payload = await fetchHistoryWithBearer(
      supabaseUrl,
      supabaseAnonKey,
      bearer,
      100
    );
    history = payload.history;
    stats = payload.stats;
  } catch (err) {
    console.error("Failed to load history from Supabase:", err);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Neon Mesh - identical to the workspace page so the shell matches */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-tr from-violet-600 to-cyan-500 to-pink-500 rounded-full blur-[120px] pointer-events-none"
        style={{ opacity: "var(--glow-violet)" }}
      />
      <div
        className="absolute top-1/3 right-10 w-[450px] h-[350px] bg-cyan-600 rounded-full blur-[100px] pointer-events-none"
        style={{ opacity: "var(--glow-cyan)" }}
      />

      {/* Header - mirrors the workspace header in app/page.tsx */}
      <header className="relative z-10 w-full border-b border-slate-800/80 bg-surface/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1700px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Tokenizer logo"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl flex-shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-slate-50 flex items-center gap-1.5 font-sans">
                  Tokenizer
                </h1>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Same meaning. Fewer tokens.
              </p>
            </div>
          </div>

          {/* Nav pills: same shape as the workspace tablist, History active */}
          <nav
            aria-label="Primary"
            className="hidden sm:flex items-center gap-1 p-1 bg-surface/60 rounded-xl border border-slate-800/80"
          >
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-50 hover:bg-surface-raised transition-all"
            >
              <Layers className="w-3.5 h-3.5" /> Workspace
            </Link>
            <a
              href="/history"
              aria-current="page"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
            >
              <History className="w-3.5 h-3.5" /> History
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        <HistoryList
          items={history}
          stats={stats}
          isSyncing={false}
          onDelete={deleteHistoryItem}
        />
      </main>
    </div>
  );
}
