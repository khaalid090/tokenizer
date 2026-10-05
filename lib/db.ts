import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { OptimizationResult, SessionStats } from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "tokentrim.db");

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    dbInstance = new DatabaseSync(DB_PATH);

    // Enable WAL mode for high concurrency & performance
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    // Enforce FKs so a delete cascades instead of silently orphaning rows.
    dbInstance.exec("PRAGMA foreign_keys = ON;");

    // -----------------------------------------------------------------------
    // Schema
    //
    // Every row is owned by a Supabase user (`user_id`). The API layer verifies
    // the caller's JWT before it ever reaches this file, and every query below
    // is filtered by that id - this is the SQLite equivalent of the Row Level
    // Security policies in supabase/schema.sql.
    // -----------------------------------------------------------------------
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS optimizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT '',
        original_prompt TEXT NOT NULL,
        optimized_prompt TEXT NOT NULL,
        mode TEXT NOT NULL,
        original_tokens INTEGER NOT NULL,
        optimized_tokens INTEGER NOT NULL,
        tokens_saved INTEGER NOT NULL,
        percent_saved REAL NOT NULL,
        cost_saved_usd REAL NOT NULL,
        protected_spans_count INTEGER NOT NULL DEFAULT 0,
        validation_passed INTEGER NOT NULL DEFAULT 1,
        warning TEXT,
        stages_json TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // One aggregate row per user (was a single global row keyed by id = 1).
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        user_id TEXT PRIMARY KEY,
        total_tokens_saved INTEGER NOT NULL DEFAULT 0,
        total_cost_saved_usd REAL NOT NULL DEFAULT 0.0,
        total_tokens_original INTEGER NOT NULL DEFAULT 0,
        total_tokens_optimized INTEGER NOT NULL DEFAULT 0,
        average_compression_ratio REAL NOT NULL DEFAULT 0.0,
        optimizations_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);

    migrate(dbInstance);
  }
  return dbInstance;
}

/**
 * Brings an older database up to the per-user schema.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op once a table exists, so a database
 * created by an earlier version keeps its old columns. Safe to re-run.
 */
function migrate(db: DatabaseSync) {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(optimizations)").all() as any[]).map((c) => c.name)
  );

  if (!columns.has("user_id")) {
    // Legacy rows predate accounts and belong to nobody. They are deliberately
    // left with an empty owner rather than being attributed to whichever user
    // happens to sign in first.
    db.exec("ALTER TABLE optimizations ADD COLUMN user_id TEXT NOT NULL DEFAULT '';");
  }

  // Old stats table was keyed by a literal id = 1 and is now keyed by user_id.
  // Rebuild it so the new PRIMARY KEY applies.
  const statsColumns = new Set(
    (db.prepare("PRAGMA table_info(stats)").all() as any[]).map((c) => c.name)
  );
  if (statsColumns.has("id") && !statsColumns.has("user_id")) {
    db.exec(`
      DROP TABLE IF EXISTS stats_legacy;
      ALTER TABLE stats RENAME TO stats_legacy;
      CREATE TABLE stats (
        user_id TEXT PRIMARY KEY,
        total_tokens_saved INTEGER NOT NULL DEFAULT 0,
        total_cost_saved_usd REAL NOT NULL DEFAULT 0.0,
        total_tokens_original INTEGER NOT NULL DEFAULT 0,
        total_tokens_optimized INTEGER NOT NULL DEFAULT 0,
        average_compression_ratio REAL NOT NULL DEFAULT 0.0,
        optimizations_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      DROP TABLE stats_legacy;
    `);
  }

  db.exec(
    "CREATE INDEX IF NOT EXISTS optimizations_user_created_idx ON optimizations (user_id, id DESC);"
  );
}

export interface StoredOptimization {
  id: number;
  originalPrompt: string;
  optimizedPrompt: string;
  mode: string;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
  costSavedUSD: number;
  protectedSpansCount: number;
  validationPassed: boolean;
  warning?: string;
  stages: any[];
  timestamp: number;
}

export function saveOptimizationToDb(
  userId: string,
  result: OptimizationResult
): StoredOptimization {
  const db = getDb();
  const now = Date.now();

  // The insert and the stats bump share one transaction so a crash between them
  // can never leave the aggregate disagreeing with the rows.
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(`
      INSERT INTO optimizations (
        user_id,
        original_prompt,
        optimized_prompt,
        mode,
        original_tokens,
        optimized_tokens,
        tokens_saved,
        percent_saved,
        cost_saved_usd,
        protected_spans_count,
        validation_passed,
        warning,
        stages_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      userId,
      result.originalPrompt,
      result.optimizedPrompt,
      result.mode,
      result.originalTokens,
      result.optimizedTokens,
      result.tokensSaved,
      result.percentSaved,
      result.costSavedUSD,
      result.protectedSpansCount,
      result.validationPassed ? 1 : 0,
      result.warning ?? null,
      JSON.stringify(result.stages || []),
      now
    );

    const insertId = Number(info.lastInsertRowid);

    // A single atomic UPSERT. The previous read-modify-write could interleave
    // between two concurrent POSTs and silently drop savings; adding the
    // incoming values inside the statement removes that window entirely.
    db.prepare(`
      INSERT INTO stats (
        user_id,
        total_tokens_saved,
        total_cost_saved_usd,
        total_tokens_original,
        total_tokens_optimized,
        average_compression_ratio,
        optimizations_count,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_tokens_saved   = stats.total_tokens_saved + excluded.total_tokens_saved,
        total_cost_saved_usd = stats.total_cost_saved_usd + excluded.total_cost_saved_usd,
        total_tokens_original = stats.total_tokens_original + excluded.total_tokens_original,
        total_tokens_optimized = stats.total_tokens_optimized + excluded.total_tokens_optimized,
        optimizations_count  = stats.optimizations_count + 1,
        updated_at           = excluded.updated_at
    `).run(
      userId,
      result.tokensSaved,
      result.costSavedUSD,
      result.originalTokens,
      result.optimizedTokens,
      now
    );

    // Ratio is derived, not accumulated, so it can never drift out of sync.
    db.prepare(`
      UPDATE stats SET
        average_compression_ratio = CASE
          WHEN total_tokens_original > 0
            THEN ROUND(CAST(total_tokens_saved AS REAL) * 100 / total_tokens_original, 1)
          ELSE 0
        END
      WHERE user_id = ?
    `).run(userId);

    db.exec("COMMIT");

    return {
      id: insertId,
      originalPrompt: result.originalPrompt,
      optimizedPrompt: result.optimizedPrompt,
      mode: result.mode,
      originalTokens: result.originalTokens,
      optimizedTokens: result.optimizedTokens,
      tokensSaved: result.tokensSaved,
      percentSaved: result.percentSaved,
      costSavedUSD: result.costSavedUSD,
      protectedSpansCount: result.protectedSpansCount,
      validationPassed: result.validationPassed,
      warning: result.warning,
      stages: result.stages,
      timestamp: now,
    };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already be gone; the original error is what matters.
    }
    throw err;
  }
}

/** Clamps the caller-supplied limit so a huge or malformed value can't hurt. */
function safeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

export function getOptimizationsFromDb(
  userId: string,
  limit: number = 50
): StoredOptimization[] {
  const db = getDb();
  // Scoped by user_id - a caller can only ever read their own rows.
  const rows = db
    .prepare(
      `SELECT * FROM optimizations WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, safeLimit(limit)) as any[];

  return rows.map((r) => ({
    id: r.id,
    originalPrompt: r.original_prompt,
    optimizedPrompt: r.optimized_prompt,
    mode: r.mode,
    originalTokens: r.original_tokens,
    optimizedTokens: r.optimized_tokens,
    tokensSaved: r.tokens_saved,
    percentSaved: r.percent_saved,
    costSavedUSD: r.cost_saved_usd,
    protectedSpansCount: r.protected_spans_count,
    validationPassed: r.validation_passed === 1,
    warning: r.warning || undefined,
    stages: r.stages_json ? JSON.parse(r.stages_json) : [],
    timestamp: r.created_at,
  }));
}

export function getStatsFromDb(userId: string): SessionStats {
  const db = getDb();
  const row = db.prepare("SELECT * FROM stats WHERE user_id = ?").get(userId) as any;
  if (!row) {
    return {
      totalTokensSaved: 0,
      totalCostSavedUSD: 0,
      totalTokensOriginal: 0,
      totalTokensOptimized: 0,
      averageCompressionRatio: 0,
      optimizationsCount: 0,
    };
  }
  return {
    totalTokensSaved: row.total_tokens_saved,
    totalCostSavedUSD: row.total_cost_saved_usd,
    totalTokensOriginal: row.total_tokens_original,
    totalTokensOptimized: row.total_tokens_optimized,
    averageCompressionRatio: row.average_compression_ratio,
    optimizationsCount: row.optimizations_count,
  };
}

/** Deletes only the caller's own rows and zeroes only their own totals. */
export function clearHistoryInDb(userId: string): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM optimizations WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM stats WHERE user_id = ?").run(userId);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Already rolled back; surface the original failure.
    }
    throw err;
  }
}