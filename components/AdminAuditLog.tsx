"use client";

import React, { useState, useEffect } from "react";
import { fetchAdminJson } from "@/lib/admin-utils";

interface AuditEntry {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  details: string | null;
  created_at: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await fetchAdminJson<AuditResponse>(
        `/api/admin/audit-log?page=${p}&limit=${limit}${
          actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""
        }`
      );
      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page, actionFilter]);

  const next = () => setPage((p) => Math.min(p + 1, Math.ceil(total / limit)));
  const prev = () => setPage((p) => Math.max(p - 1, 1));

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const actions: Record<string, string> = {
    view_settings: "Settings",
    update_settings: "Settings",
    view_users: "Users",
    toggle_admin: "Admin Toggle",
    ban_user: "Ban User",
    unban_user: "Unban User",
    delete_user: "Delete User",
    view_content: "Content",
    update_content: "Content",
    view_audit: "Audit Log",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Server-side record of all sensitive admin actions.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/80 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        />
        <span className="text-sm text-slate-400">{total} entries</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-surface/60 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/80">
              <th className="text-left px-4 py-3 font-medium text-slate-400">Time</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Actor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Action</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Target</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-slate-800/60 hover:bg-slate-900/30 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatTime(e.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {e.admin_user_id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/20 text-slate-300">
                      {actions[e.action] || e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {e.target_user_id
                      ? e.target_user_id.slice(0, 8) + "..."
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={prev}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={next}
                disabled={page * limit >= total}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}