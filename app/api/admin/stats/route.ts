import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAudit } from "@/lib/admin";

/**
 * GET /api/admin/stats
 *
 * Platform-wide overview numbers for the admin dashboard.
 * All aggregates are computed server-side from the source tables, so they can
 * never drift out of sync with the rows they describe.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  try {
    // Total users (auth.users is only readable by service_role / postgres).
    const { count: usersCount, error: usersError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (usersError) throw usersError;

    // Aggregate stats across ALL users (no user_id filter).
    const { data: aggRows, error: aggError } = await supabase
      .from("optimizations")
      .select(
        "tokens_saved, cost_saved_usd, original_tokens, optimized_tokens, mode"
      );

    if (aggError) throw aggError;

    const rows = aggRows ?? [];
    const totalOptimizations = rows.length;
    const totalTokensSaved = rows.reduce((s, r) => s + Number(r.tokens_saved ?? 0), 0);
    const totalCostSavedUsd = rows.reduce(
      (s, r) => s + Number(r.cost_saved_usd ?? 0),
      0
    );
    const totalTokensOriginal = rows.reduce(
      (s, r) => s + Number(r.original_tokens ?? 0),
      0
    );
    const averageCompressionPct =
      totalTokensOriginal > 0
        ? Math.round((totalTokensSaved / totalTokensOriginal) * 100)
        : 0;

    // Most-used compression mode across all users.
    const modeCounts: Record<string, number> = {};
    for (const r of rows) {
      const m = String(r.mode ?? "balanced");
      modeCounts[m] = (modeCounts[m] ?? 0) + 1;
    }
    const mostUsedMode = Object.entries(modeCounts).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? "balanced";

    // Daily series for the last 30 days.
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const { data: dailyRows, error: dailyError } = await supabase
      .from("optimizations")
      .select("created_at, tokens_saved")
      .gte("created_at", since.toISOString());

    if (dailyError) throw dailyError;

    const dayBuckets: Record<string, { count: number; tokens: number }> = {};
    for (let i = 0; i < 30; i++) {
      const key = new Date(since.getTime() + i * 86400000)
        .toISOString()
        .slice(0, 10);
      dayBuckets[key] = { count: 0, tokens: 0 };
    }

    for (const r of dailyRows ?? []) {
      const key = String(r.created_at).slice(0, 10);
      if (dayBuckets[key]) {
        dayBuckets[key].count += 1;
        dayBuckets[key].tokens += Number(r.tokens_saved ?? 0);
      }
    }

    const dailySeries = Object.entries(dayBuckets)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, v]) => ({ date, count: v.count, tokens: v.tokens }));

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "view_stats",
      details: { total_users: usersCount ?? 0 },
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: usersCount ?? 0,
        totalOptimizations,
        totalTokensSaved,
        totalCostSavedUsd: Math.round(totalCostSavedUsd * 100) / 100,
        averageCompressionPct,
        mostUsedMode,
        dailySeries,
      },
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load admin stats" },
      { status: 500 }
    );
  }
}