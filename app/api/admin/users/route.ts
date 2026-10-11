import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAudit } from "@/lib/admin";

/**
 * GET /api/admin/users
 *
 * Paginated, searchable user list. `q` filters by email substring.
 * `page` is 1-based, `limit` is clamped to [1, 100].
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("profiles")
      .select(
        "id,email,is_admin,banned,store_previews,total_optimizations,total_tokens_saved,total_cost_saved_usd,last_active_at,created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      query = query.ilike("email", `%${q}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      email: r.email ?? null,
      is_admin: r.is_admin === true,
      banned: r.banned === true,
      store_previews: r.store_previews === true,
      total_optimizations: Number(r.total_optimizations ?? 0),
      total_tokens_saved: Number(r.total_tokens_saved ?? 0),
      total_cost_saved_usd: Number(r.total_cost_saved_usd ?? 0),
      last_active_at: r.last_active_at ?? null,
      created_at: r.created_at ?? null,
    }));

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "view_users",
      details: { q, page, limit, total: count ?? 0 },
    });

    return NextResponse.json({
      success: true,
      users: rows,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("Admin users list error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load users" },
      { status: 500 }
    );
  }
}