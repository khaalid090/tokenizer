"use client";

import React, { useState, useEffect } from "react";
import { fetchAdminJson } from "@/lib/admin-utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DailyPoint {
  date: string;
  count: number;
  tokens?: number;
  compressions?: number;
}

interface StatsData {
  total_users: number;
  active_users_30d: number;
  admin_users: number;
  banned_users: number;
  benchmark_prompts: number;
  total_requests_30d: number;
  daily_requests: DailyPoint[];
  monthly_requests: { label: string; count: number }[];
  daily_tokens: { date: string; count: number }[];
}

const COLORS = ["#818cf8", "#22d3ee", "#34d399", "#fbbf24"];

const STAT_CARDS: { label: string; key: keyof StatsData }[] = [
  { label: "Total Users", key: "total_users" },
  { label: "Active (30d)", key: "active_users_30d" },
  { label: "Admin Users", key: "admin_users" },
  { label: "Banned Users", key: "banned_users" },
  { label: "Benchmark Prompts", key: "benchmark_prompts" },
  { label: "Requests (30d)", key: "total_requests_30d" },
];

// ---------------------------------------------------------------------------
// Charts - the parent (AdminOverview) fetches /api/admin/stats once and passes
// the slices down, so the page issues a single request instead of one per card.
// ---------------------------------------------------------------------------

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-slate-800/50"
      style={{ height }}
    />
  );
}

function EmptyState({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-slate-500"
      style={{ height }}
    >
      No data available
    </div>
  );
}

function ActivityChart({ data }: { data: DailyPoint[] | null | undefined }) {
  if (data == null) return <ChartSkeleton height={220} />;
  if (data.length === 0) return <EmptyState height={220} />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload ? (
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100">
                <div className="font-medium text-slate-400">{label}</div>
                <div className="mt-1 flex gap-3">
                  {payload.map((v: any) => (
                    <div key={v.name}>
                      <div
                        className="flex items-center gap-1.5"
                        style={{ color: v.color }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: v.color }}
                        />
                        {v.name === "Requests"
                          ? "Requests"
                          : v.name === "Tokens"
                            ? "Tokens"
                            : "Compressions"}
                        <span className="font-mono">: {v.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="count"
          name="Requests"
          stroke="#818cf8"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="tokens"
          name="Tokens"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="compressions"
          name="Compressions"
          stroke="#34d399"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}


function MonthlyChart({
  data,
}: {
  data: StatsData["monthly_requests"] | null | undefined;
}) {
  if (data == null) return <ChartSkeleton height={220} />;
  if (data.length === 0) return <EmptyState height={220} />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
          content={({ active, payload, label }) =>
            active && payload && payload.length > 0 ? (
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100">
                <div className="font-medium text-slate-400">{label}</div>
                <div className="font-mono">{payload[0].value}</div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionChart({
  data,
}: {
  data: StatsData["daily_tokens"] | null | undefined;
}) {
  if (data == null) return <ChartSkeleton height={120} />;
  if (data.length === 0) return <EmptyState height={120} />;

  return (
    <ResponsiveContainer width="100%" height={120}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="date"
          cx="50%"
          cy="50%"
          outerRadius={50}
          fill="#818cf8"
          label
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-surface/60 p-4 backdrop-blur-sm">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-50">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview page - one fetch feeds the stat cards and all three charts.
// ---------------------------------------------------------------------------

export function AdminOverview() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminJson<StatsData>("/api/admin/stats")
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cardValue = (key: keyof StatsData): string => {
    if (failed) return "-";
    if (!stats) return "--";
    const v = stats[key];
    return typeof v === "number" ? v.toLocaleString() : "--";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Platform health, usage, and activity at a glance.
          </p>
        </div>
      </div>

      {failed && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          Could not load platform stats. Check that
          <code className="mx-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code> is
          set in <code className="mx-1 font-mono">.env.local</code> and restart
          the dev server.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CARDS.map((c) => (
          <StatCard key={c.label} label={c.label} value={cardValue(c.key)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800/80 bg-surface/60 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Activity - Last 30 Days
          </h3>
          <ActivityChart data={stats?.daily_requests} />
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-surface/60 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Monthly Requests
          </h3>
          <MonthlyChart data={stats?.monthly_requests} />

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">
              Distribution
            </h3>
            <DistributionChart data={stats?.daily_tokens} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Alias kept for any older imports that referenced the page-style name. */
export const AdminOverviewPage = AdminOverview;

