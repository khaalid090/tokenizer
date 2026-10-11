"use client";

import React, { useState, useEffect } from "react";
import { fetchAdminJson } from "@/lib/admin-utils";

export interface BenchmarkPrompt {
  id: string;
  name: string;
  prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PromptsResponse {
  prompts: BenchmarkPrompt[];
  total: number;
  page: number;
  limit: number;
}

export function AdminContent() {
  const [prompts, setPrompts] = useState<BenchmarkPrompt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await fetchAdminJson<PromptsResponse>(
        `/api/admin/benchmark-prompts?page=${p}&limit=${limit}${
          search ? `&search=${encodeURIComponent(search)}` : ""
        }`
      );
      setPrompts(data.prompts);
      setTotal(data.total);
    } catch {
      setPrompts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page, search]);

  const next = () => setPage((p) => Math.min(p + 1, Math.ceil(total / limit)));
  const prev = () => setPage((p) => Math.max(p - 1, 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Benchmark Prompts</h1>
          <p className="text-sm text-slate-400 mt-1">
            CRUD for benchmark prompts used to validate model behavior.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search prompts..."
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
              <th className="text-left px-4 py-3 font-medium text-slate-400">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Active</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : prompts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No prompts found.
                </td>
              </tr>
            ) : (
              prompts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-800/60 hover:bg-slate-900/30 transition-colors"
                >
                  <td className="px-4 py-3 max-w-md truncate">
                    <div className="font-medium text-slate-100">{p.name}</div>
                    <div
                      className="text-xs text-slate-500 line-clamp-2 max-w-md"
                      title={p.prompt}
                    >
                      {p.prompt.substring(0, 80)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.is_active
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(p.updated_at).toLocaleDateString()}
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