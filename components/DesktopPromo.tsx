"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Globe, Monitor, ChevronDown, Check } from "lucide-react";
import { WEB_APP_URL, isTauriRuntime } from "@/lib/platform";
import {
  ALL_PLATFORMS,
  DownloadTarget,
  DOWNLOAD_BASE_URL,
  getDownloadTarget,
  resolveDownloadUrl,
} from "@/lib/downloads";

/**
 * Cross-promo widget:
 *  - web build     -> "Download Desktop App" with OS auto-detection
 *  - desktop build -> subtle "also available on web" note
 *
 * The primary button links straight at the installer for the visitor's own OS,
 * the way the Claude Desktop download button does, with a dropdown covering
 * every other platform.
 *
 * Two presentations:
 *  - `compact` (default in the header) -> a single pill + dropdown, so it sits
 *    beside the account panel instead of pushing the tabs around.
 *  - full banner -> the wide panel with the "Desktop app for macOS, Windows &
 *    Linux" description. Kept for places that have room, and still rendered when
 *    no compact host is available.
 */
interface Props {
  compact?: boolean;
  /** Render the compact pill as a ghost/outline button instead of a filled one,
   *  so it stays quiet beside the main navigation. */
  ghost?: boolean;
}

export function DesktopPromo({ compact = true, ghost = false }: Props) {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [target, setTarget] = useState<DownloadTarget | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setIsDesktop(isTauriRuntime());
    const t = getDownloadTarget();
    setTarget(t);

    // Probe the manifest once, so the button can disable itself instead of
    // sending visitors to a 404 when no installer has been published yet.
    // Only the *detected* platform's exact filename counts - publishing just
    // one platform must not enable a broken download link on the others.
    fetch("/downloads/manifest.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const files: string[] = Array.isArray(data?.files) ? data.files : [];
        setStagedFiles(files);
        setAvailable(t ? files.includes(t.fileName) : files.length > 0);
      })
      .catch(() => setAvailable(false));
  }, []);

  // The promo bar uses `backdrop-blur`, which creates a containing/stacking
  // context. Any `z-index` inside it is therefore trapped behind page content
  // that paints later. The menu is portalled to <body> instead and positioned
  // with fixed coordinates taken from the trigger button.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const btn = ref.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']");
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      const inTrigger = ref.current?.contains(node);
      const inMenu = menuRef.current?.contains(node);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Avoid a hydration mismatch: render nothing until we know the platform.
  if (isDesktop === null) return null;

  // `resolveDownloadUrl` returns null when no installer is staged for this
  // platform, which is what disables the button instead of linking to a 404.
  const primaryUrl = resolveDownloadUrl(target, !!available);

  if (isDesktop) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono">
        <Globe className="w-3 h-3" />
        <span>
          Desktop app &bull; also available on web at{" "}
          <span className="text-slate-400">{WEB_APP_URL}</span>
        </span>
      </div>
    );
  }

  // Compact header pill: the same button + dropdown, but without the wide
  // banner panel, so it fits in the header's right-hand group next to the
  // account panel and the settings button.
  if (compact) {
    // Ghost by default in the header so the pill never competes with the
    // Workspace tabs; the full banner path can still request the filled look.
    const ghostClass = ghost
      ? "border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 bg-transparent"
      : "bg-surface-raised border border-slate-700 text-slate-200 hover:text-slate-50 hover:border-cyan-500/50";
    return (
      <div className="flex items-center gap-2 shrink-0" ref={ref}>
        {primaryUrl ? (
          <a
            href={primaryUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-xl text-xs font-semibold transition-colors ${ghostClass}`}
          >
            <Download className="w-3.5 h-3.5" />
            {target ? target.buttonLabel : "Download Desktop App"}
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="No installer staged yet - run: pnpm tauri:build && pnpm desktop:stage"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-xl text-xs font-semibold bg-surface-raised border border-slate-800 text-slate-500 cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            {target ? target.buttonLabel : "Download Desktop App"}
          </span>
        )}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Other platforms"
            title="Other platforms"
            className={`flex items-center px-2 py-1.5 rounded-r-xl text-xs font-semibold border border-l-0 transition-colors ${
              ghost
                ? "border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 bg-transparent"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-50 hover:border-cyan-500/50"
            }`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open &&
            mounted &&
            menuPos &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={{ top: menuPos.top, right: menuPos.right }}
                className="fixed w-64 max-h-[70vh] overflow-y-auto rounded-xl bg-surface-raised border border-slate-700 shadow-2xl z-[100]"
              >
                {ALL_PLATFORMS.map((p) => {
                  const isCurrent = target?.fileName === p.fileName;
                  // A row is only clickable when its exact file was staged.
                  // Greying out the rest stops 404s from the dropdown too.
                  const isStaged = stagedFiles.includes(p.fileName);
                  const rowClass = `flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs border-b border-slate-800/70 last:border-b-0 transition-colors ${
                    isCurrent
                      ? "bg-cyan-950/30 text-cyan-300"
                      : isStaged
                        ? "text-slate-300 hover:bg-surface-raised"
                        : "text-slate-600"
                  }`;
                  const body = (
                    <>
                      <span className="flex flex-col min-w-0">
                        <span className="font-medium">
                          {p.label}
                          <span className="text-slate-500 font-normal">
                            {" "}
                            &middot; {p.archLabel}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {p.fileName}
                        </span>
                      </span>
                      {isCurrent ? (
                        <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      )}
                    </>
                  );

                  return isStaged ? (
                    <a
                      key={p.fileName}
                      role="menuitem"
                      href={`${DOWNLOAD_BASE_URL}/${p.fileName}`}
                      className={rowClass}
                    >
                      {body}
                    </a>
                  ) : (
                    <span
                      key={p.fileName}
                      role="menuitem"
                      aria-disabled="true"
                      title="Not built yet - run: pnpm tauri:build && pnpm desktop:stage"
                      className={`${rowClass} cursor-not-allowed`}
                    >
                      {body}
                    </span>
                  );
                })}
              </div>,
              document.body
            )}
        </div>
      </div>
    );
  }

  // Full banner: the wide panel with the "Desktop app for macOS, Windows &
  // Linux" description. Kept for places that have room to breathe.
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-2xl bg-gradient-to-r from-surface via-surface-raised to-surface border border-slate-800/80 backdrop-blur-md">
      <div className="flex items-center gap-2.5 text-xs text-slate-300">
        <Monitor className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <span>
          <strong className="text-slate-50">Desktop app</strong> for macOS, Windows &amp; Linux
          &mdash; same UI, runs fully offline.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0" ref={ref}>
        {primaryUrl ? (
          <a
            href={primaryUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-l-xl text-xs font-semibold bg-surface-raised border border-slate-700 text-slate-200 hover:text-slate-50 hover:border-cyan-500/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {target ? target.buttonLabel : "Download Desktop App"}
          </a>
        ) : (
          // Nothing staged for this platform: render an inert button rather than
          // a link, so we never send the visitor to a guaranteed 404.
          <span
            aria-disabled="true"
            title="No installer staged yet - run: pnpm tauri:build && pnpm desktop:stage"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-l-xl text-xs font-semibold bg-surface-raised border border-slate-800 text-slate-500 cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            {target ? target.buttonLabel : "Download Desktop App"}
          </span>
        )}

        {/* Platform switcher */}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Other platforms"
            title="Other platforms"
            className="flex items-center px-2 py-1.5 rounded-r-xl text-xs font-semibold bg-slate-900 border border-l-0 border-slate-700 text-slate-400 hover:text-slate-50 hover:border-cyan-500/50 transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open &&
            mounted &&
            menuPos &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={{ top: menuPos.top, right: menuPos.right }}
                className="fixed w-64 max-h-[70vh] overflow-y-auto rounded-xl bg-surface-raised border border-slate-700 shadow-2xl z-[100]"
              >
                {ALL_PLATFORMS.map((p) => {
                  const isCurrent = target?.fileName === p.fileName;
                  // A row is only clickable when its exact file was staged.
                  // Greying out the rest stops 404s from the dropdown too.
                  const isStaged = stagedFiles.includes(p.fileName);
                  const rowClass = `flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs border-b border-slate-800/70 last:border-b-0 transition-colors ${
                    isCurrent
                      ? "bg-cyan-950/30 text-cyan-300"
                      : isStaged
                        ? "text-slate-300 hover:bg-surface-raised"
                        : "text-slate-600"
                  }`;
                  const body = (
                    <>
                      <span className="flex flex-col min-w-0">
                        <span className="font-medium">
                          {p.label}
                          <span className="text-slate-500 font-normal">
                            {" "}
                            &middot; {p.archLabel}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {p.fileName}
                        </span>
                      </span>
                      {isCurrent ? (
                        <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      )}
                    </>
                  );

                  return isStaged ? (
                    <a
                      key={p.fileName}
                      role="menuitem"
                      href={`${DOWNLOAD_BASE_URL}/${p.fileName}`}
                      className={rowClass}
                    >
                      {body}
                    </a>
                  ) : (
                    <span
                      key={p.fileName}
                      role="menuitem"
                      aria-disabled="true"
                      title="Not built yet - run: pnpm tauri:build && pnpm desktop:stage"
                      className={`${rowClass} cursor-not-allowed`}
                    >
                      {body}
                    </span>
                  );
                })}
              </div>,
              document.body
            )}
        </div>
      </div>

      <span className="hidden text-[10px] font-mono text-slate-500 2xl:inline shrink-0">
        {target ? target.installHint : "pnpm tauri:build"}
      </span>
    </div>
  );
}