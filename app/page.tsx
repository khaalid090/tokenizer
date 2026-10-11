"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  History,
  SplitSquareVertical,
  Layers,
  BarChart3,
  Flame,
  Loader2,
} from "lucide-react";
import {
  AppSettings,
  CompressionMode,
  CutCandidate,
  OptimizationResult,
  SessionStats,
} from "@/lib/types";
import { countTokens, estimateCostUSD, loadTokenizer } from "@/lib/tokens";
import { applyCuts, proposeCuts } from "@/lib/optimizer/cuts";
import { optimizePrompt } from "@/lib/optimizer";
import { SAMPLE_PROMPTS } from "@/lib/sample-prompts";
import {
  DEFAULT_SETTINGS,
  applyTheme,
  loadSettings,
  saveSettings,
  sanitizeSettings,
} from "@/lib/settings";
import {
  PersistenceMode,
  clearLocalData,
  clearServerHistory,
  clearSupabaseHistory,
  computeNextStats,
  emptyStats,
  fetchServerHistory,
  fetchSupabaseHistory,
  loadLocalHistory,
  loadLocalStats,
  postServerRecord,
  postSupabaseRecord,
  saveLocalRecord,
} from "@/lib/persistence";
import {
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
} from "@/lib/supabase";
import { PromptWorkspace } from "@/components/PromptWorkspace";
import { SavingsCard } from "@/components/SavingsCard";
import { DiffViewer } from "@/components/DiffViewer";
import { PipelineVisualizer } from "@/components/PipelineVisualizer";
import { Dashboard } from "@/components/Dashboard";
import { SettingsModal } from "@/components/SettingsModal";
import { DesktopPromo } from "@/components/DesktopPromo";
import { AuthPanel } from "@/components/AuthPanel";
import { CutSelector } from "@/components/CutSelector";
import { AuthGate } from "@/components/AuthGate";
import { SampleChip } from "@/components/SampleChip";
import { isTauriRuntime } from "@/lib/platform";
import { isPro } from "@/lib/license";

type TabId = "workspace" | "diff" | "dashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("workspace");
  // The pipeline is supporting detail, so it starts collapsed to keep the
  // editor and the stats close to the top of the page.
  const [isPipelineExpanded, setIsPipelineExpanded] = useState(false);

  // Prompt state. Starts empty so the first thing a visitor sees is their own
  // text, not a demo prompt. The sample chips below still load one on click.
  const [originalPrompt, setOriginalPrompt] = useState<string>("");
  const [optimizedPrompt, setOptimizedPrompt] = useState<string>("");
  const [mode, setMode] = useState<CompressionMode>("balanced");
  const [lastOptimizeMs, setLastOptimizeMs] = useState<number | undefined>(undefined);

  // Optimization metrics
  const [latestResult, setLatestResult] = useState<OptimizationResult | null>(null);
  // Interactive cut selection: candidates the user *may* remove, which of them
  // are currently ticked, and which have already been applied.
  const [cutCandidates, setCutCandidates] = useState<CutCandidate[]>([]);
  const [selectedCutIds, setSelectedCutIds] = useState<string[]>([]);
  const [appliedCutIds, setAppliedCutIds] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // Settings (compression default, cost-estimate price, appearance)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // License. `lossy` is the only mode that deletes content, so it is gated
  // behind the paid tier. State lives in lib/license.ts; here we mirror it so
  // the workspace reacts to upgrades/downgrades without a reload, and we also
  // listen for the cross-tab `storage` event.
  const [pro, setPro] = useState<boolean>(isPro());

  // History & session stats - SQLite API in the web build, local storage in the desktop build
  const [history, setHistory] = useState<OptimizationResult[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats>(emptyStats());
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("local");
  const statsRef = useRef<SessionStats>(emptyStats());

  // Supabase auth (optional - compression never requires an account)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Must start as false: `isSupabaseConfigured()` reads `window`, so it is
  // false during SSR but true on the client. Seeding it from the initializer
  // would make the server and client render different auth UI (hydration
  // error). The real value is applied in the mount effect below.
  const [supabaseReady, setSupabaseReady] = useState(false);

  // ---------------------------------------------------------------------------
  // Sign-in wall
  //
  // The desktop build must keep working offline with no account at all, so the
  // gate is web-only. It is also skipped when Supabase is not configured,
  // otherwise a fresh checkout with no keys would be permanently locked out.
  // Both flags start false so the server render and the first client render
  // agree (no hydration mismatch); the mount effect resolves them.
  // ---------------------------------------------------------------------------
  const [authResolved, setAuthResolved] = useState(false);
  const [isDesktopApp, setIsDesktopApp] = useState(false);

  const updateStats = (next: SessionStats) => {
    statsRef.current = next;
    setSessionStats(next);
  };

  /**
   * Loads history + stats from the best available source:
   *   1. Supabase   - signed in and online (works in web *and* desktop builds)
   *   2. SQLite API - web build only, legacy/local server store
   *   3. localStorage - desktop build / offline (always works)
   */
  const loadHistory = async () => {
    if (supabaseReady) {
      setIsSyncing(true);
      const remote = await fetchSupabaseHistory(50);
      setIsSyncing(false);
      if (remote) {
        setPersistenceMode("supabase");
        setHistory(remote.history);
        updateStats(remote.stats);
        return;
      }
    }

    const serverPayload = await fetchServerHistory(50);
    if (serverPayload) {
      setPersistenceMode("server");
      setHistory(serverPayload.history);
      updateStats(serverPayload.stats);
      return;
    }

    // Desktop build / offline: the statically exported bundle has no server.
    setPersistenceMode("local");
    setHistory(loadLocalHistory());
    updateStats(loadLocalStats() ?? emptyStats());
  };

  // Load settings, auth session and persisted history/stats on mount
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setMode(loadedSettings.mode);
    applyTheme(loadedSettings.theme);

    let cancelled = false;

    // Runs only in the browser, after hydration has matched.
    const hasSupabase = isSupabaseConfigured();
    setSupabaseReady(hasSupabase);
    setIsDesktopApp(isTauriRuntime());

    // Bootstrap: the gate must resolve as soon as we know whether a session
    // exists - it must NOT wait on loadHistory(), which makes network calls to
    // Supabase. Tying the two together meant a slow or unreachable Supabase left
    // the splash spinning forever instead of showing the sign-in wall.
    (async () => {
      try {
        if (hasSupabase) {
          const session = await getSession();
          if (cancelled) return;
          setUserEmail(session?.user?.email ?? null);
        }
      } catch (err) {
        console.error("Session lookup failed:", err);
      } finally {
        // The gate's verdict is now known: Supabase configured (or not), signed
        // in (or not), and whether this is the desktop shell.
        if (!cancelled) setAuthResolved(true);
      }

      // History is loaded afterwards and purely in the background; a failure
      // here must never block the user from reaching the app.
      try {
        if (!cancelled) await loadHistory();
      } catch (err) {
        console.error("Initial history load failed:", err);
      }
    })();

    // React to sign-in / sign-out / token refresh in another tab.
    const unsubscribe = onAuthStateChange((session) => {
      setUserEmail(session?.user?.email ?? null);
      void loadHistory();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the license flag so the workspace can disable Lossy and react to
  // upgrades/downgrades without a reload. The flag itself lives in
  // lib/license.ts and is also broadcast across tabs via a `storage` event.
  useEffect(() => {
    setPro(isPro());
    const onLicense = () => setPro(isPro());
    window.addEventListener("tokentrim:license", onLicense);
    return () => window.removeEventListener("tokentrim:license", onLicense);
  }, []);

  // Persist one optimization. Everything happens locally first; when signed in
  // the record is additionally mirrored into the user's Supabase account.
  const recordOptimization = async (result: OptimizationResult) => {
    setLatestResult(result);
    setHistory((prev) => [result, ...prev].slice(0, 50));

    const nextStats = computeNextStats(statsRef.current, result);
    updateStats(nextStats);
    // Always keep a local copy so the dashboard survives going offline.
    saveLocalRecord(result, nextStats);

    if (persistenceMode === "supabase") {
      setIsSyncing(true);
      const remoteStats = await postSupabaseRecord(result);
      setIsSyncing(false);
      if (remoteStats) updateStats(remoteStats);
    } else if (persistenceMode === "server") {
      const serverStats = await postServerRecord(result);
      if (serverStats) updateStats(serverStats);
    }
  };

  const handleOptimize = () => {
    if (!originalPrompt.trim()) return;
    setIsOptimizing(true);

    // Yield a frame so the "Optimizing..." state paints before the synchronous
    // local pipeline runs.
    window.setTimeout(() => {
      try {
        const startedAt = performance.now();
        const result = optimizePrompt(originalPrompt, {
          mode,
          pricePer1M: settings.pricePer1M,
          // Lossy is the one mode the user picks for a *deletion-based* savings
          // target rather than a rewording pass. Give it the product's headline
          // target and let it drop the lowest-value OPTIONAL lines to get there.
          // It still never touches requirements, constraints, headings or the
          // opening/closing instructions (see lib/optimizer/lossy.ts).
          ...(mode === "lossy" ? { targetPercent: 30, requireRedundancy: false } : {}),
        });
        setLastOptimizeMs(Math.max(1, Math.round(performance.now() - startedAt)));
        setOptimizedPrompt(result.optimizedPrompt);
        // Offer optional cuts on top of the automatic result. Nothing is removed
        // here - the user ticks what they agree to lose.
        setCutCandidates(proposeCuts(result.optimizedPrompt, { countTokens }));
        setSelectedCutIds([]);
        setAppliedCutIds([]);
        void recordOptimization(result);
      } catch (err) {
        console.error("Optimization failed:", err);
      } finally {
        setIsOptimizing(false);
      }
    }, 10);
  };

  const toggleCut = (id: string) =>
    setSelectedCutIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const applySelectedCuts = () => {
    if (selectedCutIds.length === 0) return;
    const outcome = applyCuts(
      optimizedPrompt,
      selectedCutIds,
      countTokens,
      cutCandidates,
    );
    setOptimizedPrompt(outcome.text);
    setAppliedCutIds((prev) => [...new Set([...prev, ...selectedCutIds])]);
    setSelectedCutIds([]);
  };

  const pendingCutTokens = cutCandidates
    .filter((c) => selectedCutIds.includes(c.id))
    .reduce((n, c) => n + c.tokens, 0);

  const handleSelectSample = (sample: (typeof SAMPLE_PROMPTS)[0]) => {
    setOriginalPrompt(sample.prompt);
    setOptimizedPrompt("");
    setLatestResult(null);
    setLastOptimizeMs(undefined);
  };

  const handleSaveSettings = (nextSettings: AppSettings) => {
    const clean = sanitizeSettings(nextSettings);
    setSettings(clean);
    saveSettings(clean);
    applyTheme(clean.theme);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    clearLocalData();

    if (persistenceMode === "supabase") {
      setIsSyncing(true);
      const remoteStats = await clearSupabaseHistory();
      setIsSyncing(false);
      updateStats(remoteStats ?? emptyStats());
    } else if (persistenceMode === "server") {
      const serverStats = await clearServerHistory();
      updateStats(serverStats ?? emptyStats());
    } else {
      updateStats(emptyStats());
    }
  };

  // The exact BPE table is ~500 KB gzipped, so it is loaded in the background
  // rather than blocking the first paint. Until it lands, counts come from a
  // word-count estimate; this flag re-renders once real numbers are available.
  const [tokenizerReady, setTokenizerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTokenizer().finally(() => {
      if (!cancelled) setTokenizerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived metrics
  const originalTokens = countTokens(originalPrompt);
  const optimizedTokens = optimizedPrompt ? countTokens(optimizedPrompt) : originalTokens;
  const tokensSaved = latestResult?.tokensSaved ?? Math.max(0, originalTokens - optimizedTokens);
  const percentSaved =
    latestResult?.percentSaved ??
    (originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0);
  const costSavedUSD =
    latestResult?.costSavedUSD ?? estimateCostUSD(tokensSaved, settings.pricePer1M);

  // ---------------------------------------------------------------------------
  // Entry gate
  //
  // Nothing of the workspace renders until we know whether this visitor is
  // allowed in, so nobody can interact with the app behind the sign-in wall.
  // ---------------------------------------------------------------------------

  // Still deciding: show a quiet splash rather than flashing the workspace and
  // then yanking it away when the session check comes back empty.
  if (!authResolved) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        <p className="text-xs font-mono text-slate-500">Loading Tokenizer...</p>
      </div>
    );
  }

  // Sign-in wall. Web builds only (the desktop shell stays offline-first), and
  // only when Supabase is actually configured - otherwise a deployment without
  // keys would be permanently unusable.
  const requiresSignIn = !isDesktopApp && supabaseReady && !userEmail;
  if (requiresSignIn) {
    return <AuthGate onSignedIn={() => void loadHistory()} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Neon Mesh */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-tr from-violet-600 to-cyan-500 to-pink-500 rounded-full blur-[120px] pointer-events-none"
        style={{ opacity: "var(--glow-violet)" }}
      />
      <div
        className="absolute top-1/3 right-10 w-[450px] h-[350px] bg-cyan-600 rounded-full blur-[100px] pointer-events-none"
        style={{ opacity: "var(--glow-cyan)" }}
      />

      {/* Header */}
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

          {/* Navigation / Mode Tabs */}
          <div className="flex items-center gap-2">
            {/* Underline tabs read as navigation rather than a second row of
                buttons, and the active pill carries the accent on its own. */}
            <div
              role="tablist"
              className="hidden sm:flex items-center gap-1 p-1 bg-surface/60 rounded-xl border border-slate-800/80"
            >
              {(
                [
                  { id: "workspace" as TabId, label: "Workspace", Icon: Layers },
                  { id: "diff" as TabId, label: "Word Diff", Icon: SplitSquareVertical },
                  { id: "dashboard" as TabId, label: "Dashboard", Icon: BarChart3 },
                ]
              ).map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                        : "text-slate-300 hover:text-slate-50 hover:bg-surface-raised"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                );
              })}
            </div>

            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/history"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-surface-raised transition-all"
              >
                <History className="w-3.5 h-3.5" />
                History
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <AuthPanel
                userEmail={userEmail}
                isSyncing={isSyncing}
                isSupabase={supabaseReady}
                onSignedIn={() => void loadHistory()}
                onSignedOut={() => void loadHistory()}
                onOpenSettings={() => setIsSettingsOpen(true)}
              >
                {/* Desktop installer: top of the page, not buried below the sample
                    prompts, so it is visible before any scrolling. Kept quiet as a
                    ghost button so it never competes with the main navigation.
                    Rendered as AuthPanel's children so the header reads
                    account · download · sign out. */}
                <DesktopPromo compact ghost />
              </AuthPanel>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        {/* Workspace first. The input, the mode selector and the Optimize button
            sit directly under the header so the core task never needs a scroll,
            and the supporting panels stack underneath in decreasing priority. */}

        {/* View Selection */}
        {activeTab === "workspace" && (
          <>
            <PromptWorkspace
              originalPrompt={originalPrompt}
              setOriginalPrompt={setOriginalPrompt}
              optimizedPrompt={optimizedPrompt}
              setOptimizedPrompt={setOptimizedPrompt}
              originalTokens={originalTokens}
              optimizedTokens={optimizedTokens}
              tokensSaved={tokensSaved}
              percentSaved={percentSaved}
              mode={mode}
              setMode={setMode}
              onOptimize={handleOptimize}
              isOptimizing={isOptimizing}
              tokenizerReady={tokenizerReady}
              pro={pro}
              onOpenUpgrade={() => setIsSettingsOpen(true)}
              validationPassed={latestResult?.validationPassed ?? true}
              warning={latestResult?.warning}
              droppedUnits={latestResult?.droppedUnits ?? []}
            />

            {/* Interactive cut selection. Appears after an optimization run,
                offering optional removals. Nothing is deleted without a tick. */}
            {cutCandidates.length > 0 && (
              <CutSelector
                candidates={cutCandidates}
                selected={selectedCutIds}
                appliedIds={appliedCutIds}
                pendingTokens={pendingCutTokens}
                onToggle={toggleCut}
                onSelectAll={() => setSelectedCutIds(cutCandidates.map((c) => c.id))}
                onClear={() => setSelectedCutIds([])}
                onApply={applySelectedCuts}
              />
            )}

            {/* Slim, collapsible pipeline strip between the editor and the stats */}
            <PipelineVisualizer
              stages={latestResult?.stages ?? []}
              isProcessing={isOptimizing}
              isExpanded={isPipelineExpanded}
              onToggleExpanded={() => setIsPipelineExpanded((v) => !v)}
            />

            {/* Token efficiency summary, below the workspace it describes */}
            <SavingsCard
              hasResult={Boolean(latestResult)}
              originalTokens={originalTokens}
              optimizedTokens={optimizedTokens}
              tokensSaved={tokensSaved}
              percentSaved={percentSaved}
              costSavedUSD={costSavedUSD}
              protectedSpansCount={latestResult?.protectedSpansCount ?? 0}
              mode={latestResult?.mode ?? mode}
              optimizeMs={lastOptimizeMs}
            />
          </>
        )}

        {activeTab === "diff" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Word-Level Diff Analysis
              </h2>
              <span className="text-xs text-slate-400">
                Red: Removed filler/redundancies | Green: Synthesized output
              </span>
            </div>
            <DiffViewer original={originalPrompt} optimized={optimizedPrompt} />
          </div>
        )}

        {activeTab === "dashboard" && (
          <Dashboard
            stats={sessionStats}
            history={history}
            onSelectHistoryItem={(item) => {
              setOriginalPrompt(item.originalPrompt);
              setOptimizedPrompt(item.optimizedPrompt);
              setLatestResult(item);
              setActiveTab("workspace");
            }}
            onClearHistory={handleClearHistory}
            isDbConnected={persistenceMode === "server"}
          />
        )}

        {/* Sample prompts. Moved below the workspace: it is a convenience, not the
            main task, and the title now matches what the chips actually claim. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface/70 border border-slate-800/80 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Flame className="w-4 h-4 text-pink-500" />
            <span>Try a sample prompt</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((sp) => (
              <SampleChip key={sp.id} sample={sp} onSelect={handleSelectSample} />
            ))}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-600 font-mono">
        Tokenizer &bull; Protected spans preservation engine &bull; 100% local compression &bull; No API key, no provider calls &bull; js-tiktoken cl100k_base
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}

