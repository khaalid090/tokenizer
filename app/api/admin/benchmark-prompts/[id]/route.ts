import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAudit } from "@/lib/admin";

const BENCHMARK_COLUMNS =
  "id,label,sample_prompt,savings_range_label,sort_order,is_active";

/**
 * PATCH /api/admin/benchmark-prompts/:id
 * Body: partial fields { label, sample_prompt, savings_range_label, sort_order, is_active }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing prompt id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body?.label !== undefined) update.label = String(body.label).trim();
  if (body?.sample_prompt !== undefined)
    update.sample_prompt = String(body.sample_prompt).trim();
  if (body?.savings_range_label !== undefined)
    update.savings_range_label = String(body.savings_range_label).trim();
  if (body?.sort_order !== undefined) {
    const n = Number(body.sort_order);
    update.sort_order = Number.isFinite(n) ? n : 0;
  }
  if (body?.is_active !== undefined) update.is_active = body.is_active === true;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("benchmark_prompts")
      .update(update)
      .eq("id", id)
      .select(BENCHMARK_COLUMNS)
      .single();

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "update_benchmark_prompt",
      target_user_id: null,
      details: { id, changes: update },
    });

    return NextResponse.json({ success: true, prompt: data });
  } catch (error: any) {
    console.error("Admin benchmark prompt update error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update benchmark prompt" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/benchmark-prompts/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing prompt id" }, { status: 400 });
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("benchmark_prompts")
      .select("id,label")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Benchmark prompt not found." },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("benchmark_prompts")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "delete_benchmark_prompt",
      details: { id, label: existing.label },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Admin benchmark prompt delete error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete benchmark prompt" },
      { status: 500 }
    );
  }
}