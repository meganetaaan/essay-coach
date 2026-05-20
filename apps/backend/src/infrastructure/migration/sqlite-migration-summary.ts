import { access, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { openSqliteDatabase } from "../persistence/sqlite-database";

const TABLES = ["guardians", "children", "essay_days", "essay_submissions", "reviews"] as const;

export interface SqliteMigrationSummary {
  sqlitePath: string;
  imageRoot: string;
  tables: Record<(typeof TABLES)[number], number>;
  reviewStatuses: Record<string, number>;
  imageObjects: {
    count: number;
    totalBytes: number;
    keys: string[];
  };
}

export async function summarizeSqliteMigrationSource(input: { sqlitePath: string; imageRoot: string }): Promise<SqliteMigrationSummary> {
  await assertReadableSqlitePath(input.sqlitePath);
  const db = openSqliteDatabase(input.sqlitePath);
  const tables = Object.fromEntries(
    TABLES.map((table) => [table, countRows(db, table)])
  ) as SqliteMigrationSummary["tables"];
  const reviewStatuses = Object.fromEntries(
    db
      .prepare("SELECT review_status, COUNT(*) AS count FROM essay_submissions GROUP BY review_status ORDER BY review_status")
      .all()
      .map((row) => {
        const statusRow = row as { review_status: string; count: number };
        return [statusRow.review_status, statusRow.count];
      })
  );
  const imageObjects = await summarizeImages(input.imageRoot);

  return {
    sqlitePath: input.sqlitePath,
    imageRoot: input.imageRoot,
    tables,
    reviewStatuses,
    imageObjects
  };
}

async function assertReadableSqlitePath(sqlitePath: string): Promise<void> {
  try {
    await access(sqlitePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`SQLite database not found: ${sqlitePath}`);
    }
    throw error;
  }
}

function countRows(db: ReturnType<typeof openSqliteDatabase>, table: (typeof TABLES)[number]): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

async function summarizeImages(imageRoot: string): Promise<SqliteMigrationSummary["imageObjects"]> {
  const files = await listFiles(imageRoot).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  });
  const entries = await Promise.all(
    files.map(async (path) => ({
      key: relative(imageRoot, path).split(sep).join("/"),
      bytes: (await stat(path)).size
    }))
  );
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return {
    count: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    keys: entries.map((entry) => entry.key)
  };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      if (entry.isFile()) return [path];
      return [];
    })
  );
  return nested.flat();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
