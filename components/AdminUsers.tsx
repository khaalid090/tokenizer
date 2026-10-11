"use client";

import React, { useState, useEffect } from "react";
import { fetchAdminJson } from "@/lib/admin-utils";

export interface Profile {
  id: string;
  is_admin: boolean;
  banned: boolean;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface UsersResponse {
  users: Profile[];
  total: number;
  page: number;
  limit: number;
}

export function AdminUsers() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await fetchAdminJson<UsersResponse>(
        `/api/admin/users?page=${p}&limit=25${search ? `&search=${encodeURIComponent(search)}` : ""}`
      );
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page, search]);

  const next = () => setPage((p) => Math.min(p + 1, Math.ceil(total / 25)));
  const prev = () => setPage((p) => Math.max(p - 1, 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Users</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage users, roles, and bans. Server-side RBAC is enforced on every
            action.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/80 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        />
        <span className="text-sm text-slate-400">{total} total</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-surface/60 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/80">
              <th className="text-left px-4 py-3 font-medium text-slate-400">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-800/60 hover:bg-slate-900/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">
                      {u.full_name || u.email}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {u.id.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.is_admin
                          ? "bg-violet-500/20 text-violet-300"
                          : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.banned
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {u.banned ? "Banned" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">
              Page {page} of {Math.ceil(total / 25)}
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
                disabled={page * 25 >= total}
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