import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAudit } from "@/lib/admin";

const BENCHMARK_COLUMNS =
  "id,title,prompt,mode,sort_order,active";

/**
 * GET /api/admin/benchmark-prompts
 *
 * Returns ALL benchmark prompts (including inactive ones) for the admin UI.
 * The public homepage reads only is_active = true rows.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("benchmark_prompts")
      .select(BENCHMARK_COLUMNS)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "view_benchmark_prompts",
    });

    return NextResponse.json({
      success: true,
      prompts: data ?? [],
    });
  } catch (error: any) {
    console.error("Admin benchmark prompts list error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load benchmark prompts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/benchmark-prompts
 * Body: { title, prompt, mode, sort_order?, active? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body?.title ?? "").trim();
  const prompt = String(body?.prompt ?? "").trim();
  const mode = String(body?.mode ?? "").trim();

  if (!title || !prompt || !mode) {
    return NextResponse.json(
      { error: "title, prompt and mode are required." },
      { status: 400 }
    );
  }

  try {
    const sortOrder = Number.isFinite(Number(body?.sort_order))
      ? Number(body?.sort_order)
      : 0;
    const isActive = body?.active !== false;

    const { data, error } = await supabase
      .from("benchmark_prompts")
      .insert({
        title,
        prompt,
        mode,
        sort_order: sortOrder,
        active: isActive,
      })
      .select(BENCHMARK_COLUMNS)
      .single();

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "create_benchmark_prompt",
      details: { id: data.id, title },
    });

    return NextResponse.json({ success: true, prompt: data });
  } catch (error: any) {
    console.error("Admin benchmark prompt create error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create benchmark prompt" },
      { status: 500 }
    );
  }
}