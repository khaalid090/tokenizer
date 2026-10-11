import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, countAdmins, writeAudit } from "@/lib/admin";

/**
 * POST /api/admin/users/:id/admin
 * Body: { is_admin: boolean }
 *
 * Toggles the target user's admin status. Refuses to remove the last admin
 * and refuses to let an admin revoke their own flag. Writes an audit log row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { id: targetId } = await params;
  if (!targetId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isAdmin = body?.is_admin === true;

  try {
    // Self-targeting guard: an admin cannot revoke their own flag.
    if (targetId === user.id && !isAdmin) {
      return NextResponse.json(
        { error: "You cannot remove your own admin status." },
        { status: 400 }
      );
    }

    // Last-admin guard: refuse to drop below one admin.
    if (!isAdmin) {
      const current = await countAdmins(supabase);
      if (current <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin. Promote another user first." },
          { status: 400 }
        );
      }
    }

    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("is_admin, banned")
      .eq("id", targetId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Target user not found." },
        { status: 404 }
      );
    }

    if (existing.banned) {
      return NextResponse.json(
        { error: "Cannot change admin status for a suspended user." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_admin: isAdmin })
      .eq("id", targetId);

    if (updateError) throw updateError;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "toggle_admin",
      target_user_id: targetId,
      details: { is_admin: isAdmin, previous: existing.is_admin },
    });

    return NextResponse.json({ success: true, is_admin: isAdmin });
  } catch (error: any) {
    console.error("Admin toggle error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update admin status" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/:id/ban
 * Body: { banned: boolean }
 *
 * Toggles the banned flag. Banned users' sessions are rejected server-side on
 * the next request (requireAdmin checks the flag before anything else).
 * Writes an audit log row.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { id: targetId } = await params;
  if (!targetId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const banned = body?.banned === true;

  try {
    // An admin cannot ban themselves.
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "You cannot ban your own account." },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("is_admin, banned")
      .eq("id", targetId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Target user not found." },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ banned })
      .eq("id", targetId);

    if (updateError) throw updateError;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: banned ? "ban_user" : "unban_user",
      target_user_id: targetId,
      details: { banned, previous: existing.banned, target_is_admin: existing.is_admin },
    });

    return NextResponse.json({ success: true, banned });
  } catch (error: any) {
    console.error("Admin ban error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update ban status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/:id
 *
 * Deletes a user and cascades their data (optimizations, stats, profile).
 * Refuses to delete the last remaining admin.
 * Writes an audit log row.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { id: targetId } = await params;
  if (!targetId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  try {
    // An admin cannot delete themselves.
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", targetId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Target user not found." },
        { status: 404 }
      );
    }

    // If the target is an admin, refuse to drop below one admin.
    if (existing.is_admin) {
      const current = await countAdmins(supabase);
      if (current <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin. Promote another user first." },
          { status: 400 }
        );
      }
    }

    // Cascade: the optimizations.user_id FK is `on delete cascade`, so
    // deleting the auth user removes their rows automatically. We delete the
    // profile explicitly too (the FK also cascades, but being explicit keeps
    // the audit trail honest). auth.users deletion requires service_role.
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", targetId);
    if (profileError) throw profileError;

    const { error: authError } = await supabase.auth.admin.deleteUser(targetId);
    if (authError) throw authError;

    await writeAudit(supabase, {
      admin_user_id: user.id,
      action: "delete_user",
      target_user_id: targetId,
      details: { target_was_admin: existing.is_admin },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Admin delete error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}