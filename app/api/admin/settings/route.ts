import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAudit } from "@/lib/admin";

const SETTINGS_COLUMNS =
  "id,default_mode,price_per_million,maintenance_mode,maintenance_message,updated_at,updated_by";

/**
 * GET /api/admin/settings
 *
 * Returns the platform_settings singleton.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "view_settings",
    });

    return NextResponse.json({
      success: true,
      settings: data ?? {
        id: 1,
        default_mode: "balanced",
        price_per_million: 2.5,
        maintenance_mode: false,
        maintenance_message: null,
        updated_at: null,
        updated_by: null,
      },
    });
  } catch (error: any) {
    console.error("Admin settings GET error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/settings
 * Body: { default_mode?, price_per_million?, maintenance_mode?, maintenance_message? }
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_by: user.id };
  if (body?.default_mode !== undefined) {
    const mode = String(body.default_mode);
    if (!["lossless", "balanced", "aggressive", "lossy"].includes(mode)) {
      return NextResponse.json({ error: "Invalid default_mode." }, { status: 400 });
    }
    update.default_mode = mode;
  }
  if (body?.price_per_million !== undefined) {
    const price = Number(body.price_per_million);
    update.price_per_million = Number.isFinite(price) && price >= 0 ? price : 2.5;
  }
  if (body?.maintenance_mode !== undefined) {
    update.maintenance_mode = body.maintenance_mode === true;
  }
  if (body?.maintenance_message !== undefined) {
    const msg = String(body.maintenance_message ?? "").trim();
    update.maintenance_message = msg || null;
  }

  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .update(update)
      .eq("id", 1)
      .select(SETTINGS_COLUMNS)
      .single();

    if (error) throw error;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "update_settings",
      details: { changes: update },
    });

    return NextResponse.json({ success: true, settings: data });
  } catch (error: any) {
    console.error("Admin settings PUT error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}