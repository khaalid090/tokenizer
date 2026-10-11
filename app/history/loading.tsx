export default function HistoryLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {/* Background Neon Mesh - matches the page shell so nothing flashes */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-tr from-violet-600 to-cyan-500 to-pink-500 rounded-full blur-[120px] pointer-events-none"
        style={{ opacity: "var(--glow-violet)" }}
      />
      <div
        className="absolute top-1/3 right-10 w-[450px] h-[350px] bg-cyan-600 rounded-full blur-[100px] pointer-events-none"
        style={{ opacity: "var(--glow-cyan)" }}
      />

      {/* Header skeleton - same layout as the real header */}
      <header className="relative z-10 w-full border-b border-slate-800/80 bg-surface/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1700px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-surface-raised" />
            <div>
              <div className="h-5 w-24 rounded bg-surface-raised" />
              <div className="h-3 w-40 rounded bg-surface-raised mt-1.5" />
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 p-1 bg-surface/60 rounded-xl border border-slate-800/80 animate-pulse">
            <div className="px-3 py-1.5 rounded-lg bg-surface-raised h-6 w-20" />
            <div className="px-3 py-1.5 rounded-lg bg-cyan-500/20 h-6 w-20" />
          </div>
        </div>
      </header>

      {/* List skeleton - three card rows like a populated history */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-6 w-48 rounded bg-surface-raised" />
          <div className="h-5 w-16 rounded-full bg-surface-raised" />
        </div>
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-surface-raised/60 border border-slate-800/80 animate-pulse space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-3 w-16 rounded bg-surface-raised" />
                <div className="h-3 w-28 rounded bg-surface-raised" />
                <div className="h-3 w-24 rounded bg-surface-raised" />
              </div>
              <div className="h-4 w-3/4 rounded bg-surface-raised" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
