import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getOptimizationsFromDb,
  saveOptimizationToDb,
  getStatsFromDb,
  clearHistoryInDb,
} from "@/lib/db";
import { OptimizationResult } from "@/lib/types";

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
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);

    const history = getOptimizationsFromDb(userId, limit);
    const stats = getStatsFromDb(userId);

    return NextResponse.json({
      success: true,
      history,
      stats,
    });
  } catch (error: any) {
    console.error("Failed to read from DB:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load history from database" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    const body = (await req.json()) as OptimizationResult;
    if (!body || !body.originalPrompt) {
      return NextResponse.json(
        { error: "Invalid optimization result payload" },
        { status: 400 }
      );
    }

    const record = saveOptimizationToDb(userId, body);
    const stats = getStatsFromDb(userId);

    return NextResponse.json({
      success: true,
      record,
      stats,
    });
  } catch (error: any) {
    console.error("Failed to save to DB:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save record to database" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { userId } = auth;

  try {
    // Scoped to the caller: this can no longer wipe another user's history.
    clearHistoryInDb(userId);
    const stats = getStatsFromDb(userId);

    return NextResponse.json({
      success: true,
      message: "Database history cleared",
      stats,
    });
  } catch (error: any) {
    console.error("Failed to clear DB:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to clear database" },
      { status: 500 }
    );
  }
}