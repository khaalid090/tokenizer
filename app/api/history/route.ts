import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getOptimizationsFromDb,
  saveOptimizationToDb,
  getStatsFromDb,
  clearHistoryInDb,
  deleteOptimizationFromDb,
} from "@/lib/db";
import { OptimizationResult } from "@/lib/types";

/**
 * Memoized service-role client. Returns null if the key is not configured.
 * Used only to write the tamper-proof system audit log - never to read
 * user data.
 */
let cachedServiceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (cachedServiceClient) return cachedServiceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedServiceClient;
}

/**
 * Logs an operation on the system-side history API to the tamper-proof
 * system_audit_log table. Safe to call fire-and-forget: failures are logged
 * but never thrown, so a transient DB hiccup can never take down a history
 * operation that already succeeded.
 */
async function logSystemAudit(
  supabase: SupabaseClient | null,
  userId: string | undefined,
  action: "history_read" | "history_save" | "history_delete",
  status: "ok" | "error",
  details: Record<string, unknown>
): Promise<void> {
  if (!supabase) {
    console.warn(
      "[system_audit_log] skipped - service role key not configured"
    );
    return;
  }
  try {
    await supabase.from("system_audit_log").insert({
      user_id: userId ?? null,
      action,
      status,
      details,
    });
  } catch (err) {
    console.error("[system_audit_log] write failed:", err);
  }
}

/**
 * Resolves the caller from their Supabase access token.
 *
 * The token is verified by asking Supabase who owns it (`GET /auth/v1/user`),
 * which is the authoritative check - decoding the JWT locally would mean
 * trusting an unverified payload, and the anon key is enough for this call, so
 * no service_role key is ever needed on the server.
 *
 * Returns the user id, or a 401 NextResponse when the caller is not signed in.
 */
async function requireUser(
  req: NextRequest
): Promise<{ userId: string } | { response: NextResponse }> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return {
      response: NextResponse.json(
        { error: "Sign in to access your history." },
        { status: 401 }
      ),
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Refusing closed is the only safe answer: without Supabase there is no
    // way to tell one caller from another.
    return {
      response: NextResponse.json(
        { error: "Server auth is not configured." },
        { status: 503 }
      ),
    };
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return {
        response: NextResponse.json(
          { error: "Your session has expired. Please sign in again." },
          { status: 401 }
        ),
      };
    }
    return { userId: data.user.id };
  } catch {
    return {
      response: NextResponse.json(
        { error: "Could not verify your session." },
        { status: 503 }
      ),
    };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) {
    await logSystemAudit(
      getServiceClient(),
      undefined,
      "history_read",
      "error",
      { error: "unauthorized" }
    );
    return auth.response;
  }
  const { userId } = auth;
  const { searchParams } = new URL(req.url);
  const limit = Number.parseInt(searchParams.get("limit") || "50", 10);

  try {
    const history = getOptimizationsFromDb(userId, limit);
    const stats = getStatsFromDb(userId);

    await logSystemAudit(getServiceClient(), userId, "history_read", "ok", {
      limit,
      count: history.length,
    });

    return NextResponse.json({
      success: true,
      history,
      stats,
    });
  } catch (error: any) {
    console.error("Failed to read from DB:", error);
    await logSystemAudit(getServiceClient(), userId, "history_read", "error", {
      limit,
      count: history.length,
      error: error?.message || "Failed to load history from database",
    });
    return NextResponse.json(
      { error: error?.message || "Failed to load history from database" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) {
    await logSystemAudit(getServiceClient(), undefined, "history_save", "error", {
      error: "unauthorized",
    });
    return auth.response;
  }
  const { userId } = auth;

  try {
    const body = (await req.json()) as OptimizationResult;
    if (!body || !body.originalPrompt) {
      await logSystemAudit(getServiceClient(), userId, "history_save", "error", {
        error: "invalid payload",
      });
      return NextResponse.json(
        { error: "Invalid optimization result payload" },
        { status: 400 }
      );
    }

    const record = saveOptimizationToDb(userId, body);
    const stats = getStatsFromDb(userId);

    await logSystemAudit(getServiceClient(), userId, "history_save", "ok", {
      id: record.id,
      tokensSaved: record.tokensSaved,
      costSavedUSD: record.costSavedUSD,
    });

    return NextResponse.json({
      success: true,
      record,
      stats,
    });
  } catch (error: any) {
    console.error("Failed to save to DB:", error);
    await logSystemAudit(getServiceClient(), userId, "history_save", "error", {
      error: error?.message || "Failed to save record to database",
    });
    return NextResponse.json(
      { error: error?.message || "Failed to save record to database" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) {
    await logSystemAudit(getServiceClient(), undefined, "history_delete", "error", {
      error: "unauthorized",
    });
    return auth.response;
  }
  const { userId } = auth;

  // Optional single-item delete: DELETE /api/history?id=<id>
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("id");

  if (itemId) {
    // Delete only the caller's own row.
    try {
      deleteOptimizationFromDb(itemId, userId);
      const stats = getStatsFromDb(userId);

      await logSystemAudit(getServiceClient(), userId, "history_delete", "ok", {
        id: Number(itemId),
        stats: {
          totalTokensSaved: stats.totalTokensSaved,
          totalCostSavedUSD: stats.totalCostSavedUSD,
          optimizationsCount: stats.optimizationsCount,
        },
      });

      return NextResponse.json({
        success: true,
        message: "History item deleted",
        stats,
      });
    } catch (error: any) {
      console.error("Failed to delete history item:", error);
      await logSystemAudit(getServiceClient(), userId, "history_delete", "error", {
        id: Number(itemId),
        error: error?.message || "Failed to delete history item",
      });
      return NextResponse.json(
        { error: error?.message || "Failed to delete history item" },
        { status: 500 }
      );
    }
  }

  // Clear all history for the caller (original behavior): DELETE /api/history
  try {
    clearHistoryInDb(userId);
    const stats = getStatsFromDb(userId);

    await logSystemAudit(getServiceClient(), userId, "history_delete", "ok", {
      stats: {
        totalTokensSaved: stats.totalTokensSaved,
        totalCostSavedUSD: stats.totalCostSavedUSD,
        optimizationsCount: stats.optimizationsCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Database history cleared",
      stats,
    });
  } catch (error: any) {
    console.error("Failed to clear DB:", error);
    await logSystemAudit(getServiceClient(), userId, "history_delete", "error", {
      error: error?.message || "Failed to clear database",
    });
    return NextResponse.json(
      { error: error?.message || "Failed to clear database" },
      { status: 500 }
    );
  }
}
