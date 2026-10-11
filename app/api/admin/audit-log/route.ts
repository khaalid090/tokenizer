import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

const AUDIT_COLUMNS =
  "id,admin_user_id,action,target_user_id,details,created_at";

/**
 * GET /api/admin/audit-log
 *
 * Paginated audit log, newest first. Optional `action` filter.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("admin_audit_log")
      .select(AUDIT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (action) {
      query = query.eq("action", action);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      entries: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("Admin audit log error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load audit log" },
      { status: 500 }
    );
  }
}