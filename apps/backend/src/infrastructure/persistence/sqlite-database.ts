import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Child } from "../../domain/child/child";

type SqliteRunResult = { changes: number; lastInsertRowid: number | bigint };
type SqliteStatement = {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };

export const DEFAULT_SQLITE_PATH = ".storage/essay-coach.sqlite";
export const DEMO_CHILD_ID = "child-1";
export const DEMO_GUARDIAN_ID = "demo_guardian";
export const DEMO_CHILD_DISPLAY_NAME = "デモ児童";
export const DEMO_CHILD_GRADE = 6;

export function resolveSqlitePath(path = process.env.ESSAY_COACH_SQLITE_PATH || DEFAULT_SQLITE_PATH): string {
  return resolve(path);
}

export function openSqliteDatabase(path = resolveSqlitePath()): SqliteDatabase {
  const resolvedPath = resolveSqlitePath(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function initializeSqliteDatabase(path = resolveSqlitePath()): void {
  const db = openSqliteDatabase(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS guardians (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      guardian_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS essay_days (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      child_grade INTEGER NOT NULL,
      date TEXT NOT NULL,
      topic_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(child_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_essay_days_child_date ON essay_days(child_id, date);

    CREATE TABLE IF NOT EXISTS essay_submissions (
      id TEXT PRIMARY KEY,
      essay_day_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      strictness TEXT NOT NULL,
      image_object_key TEXT NOT NULL,
      ocr_text TEXT,
      review_status TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_essay_submissions_day_attempt
      ON essay_submissions(essay_day_id, attempt_number);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE,
      strictness TEXT NOT NULL,
      ocr_text TEXT NOT NULL,
      total_score INTEGER NOT NULL,
      scores_json TEXT NOT NULL,
      topic_comment TEXT NOT NULL,
      strengths_json TEXT NOT NULL,
      improvement_points_json TEXT NOT NULL,
      rewrite_advice_json TEXT NOT NULL,
      child_friendly_comment TEXT NOT NULL,
      parent_summary TEXT NOT NULL,
      raw_output_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_submission_id ON reviews(submission_id);
  `);
  migrateChildGuardianId(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_children_guardian_id ON children(guardian_id);");
}

export function upsertDemoChild(path = resolveSqlitePath()): void {
  initializeSqliteDatabase(path);
  const db = openSqliteDatabase(path);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO guardians (id, display_name, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).run(DEMO_GUARDIAN_ID, "デモ保護者", now);
  db.prepare(`
    INSERT INTO children (id, guardian_id, display_name, grade, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      guardian_id = excluded.guardian_id,
      display_name = excluded.display_name,
      grade = excluded.grade,
      updated_at = excluded.updated_at
  `).run(DEMO_CHILD_ID, DEMO_GUARDIAN_ID, DEMO_CHILD_DISPLAY_NAME, DEMO_CHILD_GRADE, now);
}

export function defaultChildIdForGuardian(guardianId: string): string {
  return `child_${createHash("sha256").update(guardianId).digest("hex").slice(0, 16)}`;
}

export function getChildById(path: string, id: string): Child | undefined {
  const db = openSqliteDatabase(path);
  const row = db.prepare("SELECT id, display_name, grade FROM children WHERE id = ?").get(id);
  if (!isChildRow(row)) return undefined;
  return {
    id: row.id,
    displayName: row.display_name,
    grade: row.grade
  };
}

function migrateChildGuardianId(db: SqliteDatabase): void {
  const columns = db.prepare("PRAGMA table_info(children)").all();
  const hasGuardianId = columns.some(
    (column) =>
      typeof column === "object" &&
      column !== null &&
      (column as { name?: unknown }).name === "guardian_id"
  );
  if (hasGuardianId) return;

  const now = new Date().toISOString();
  db.exec("ALTER TABLE children ADD COLUMN guardian_id TEXT;");
  db.prepare("INSERT OR IGNORE INTO guardians (id, display_name, updated_at) VALUES (?, ?, ?)").run(
    DEMO_GUARDIAN_ID,
    "デモ保護者",
    now
  );
  db.prepare("UPDATE children SET guardian_id = ? WHERE guardian_id IS NULL OR guardian_id = ''").run(DEMO_GUARDIAN_ID);
}

function isChildRow(row: unknown): row is { id: string; display_name: string; grade: number } {
  return (
    typeof row === "object" &&
    row !== null &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { display_name?: unknown }).display_name === "string" &&
    typeof (row as { grade?: unknown }).grade === "number"
  );
}
