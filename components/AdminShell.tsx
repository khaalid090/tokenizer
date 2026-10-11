"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Shield,
  LogOut,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "@/lib/supabase";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/content", label: "Content", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-log", label: "Audit Log", icon: Shield },
] as const;

export function AdminShell({
  user,
  children,
}: {
  user: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    // Use the shared client (lib/supabase.ts): it persists to localStorage AND
    // mirrors the auth cookie, so signing out here clears both. A private
    // client with persistSession:false would miss the stored session entirely.
    try {
      await signOut();
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-0 w-[500px] h-[400px] bg-gradient-to-tr from-violet-600/40 to-cyan-500/30 rounded-full blur-[120px]"
          style={{ opacity: "var(--glow-violet)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[450px] h-[350px] bg-cyan-600/30 rounded-full blur-[100px]"
          style={{ opacity: "var(--glow-cyan)" }}
        />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-surface/90 backdrop-blur-xl
          border-r border-slate-800/80 flex flex-col
          transform transition-transform duration-300 ease-out
          lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-50">Admin Panel</div>
              <div className="text-[10px] font-mono text-slate-500">
                Platform control
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-50"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:text-slate-50 hover:bg-surface-raised"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <div className="px-3 py-2 rounded-lg bg-surface-raised/50">
            <div className="text-[10px] font-mono text-slate-500">
              Signed in as
            </div>
            <div
              className="text-xs font-mono text-slate-300 truncate"
              title={user}
            >
              {user.slice(0, 8)}...
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-rose-300 hover:bg-rose-950/40 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-30 flex items-center h-14 px-4 bg-surface/80 backdrop-blur-xl border-b border-slate-800/80 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-slate-300 hover:text-slate-50"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 ml-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-50">
              Tokenizer Admin
            </span>
          </div>
        </header>

        <main className="p-4 sm:p-6 space-y-6 relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
}