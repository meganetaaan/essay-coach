import { createRequire } from "node:module";
import { access, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const TABLES = ["guardians", "children", "essay_days", "essay_submissions", "reviews"];

const args = parseArgs(process.argv.slice(2));
const sqlitePath = resolve(args.sqlite ?? ".storage/essay-coach.sqlite");
const imageRoot = resolve(args.images ?? ".storage/essay-images");
await assertReadableSqlitePath(sqlitePath);
const db = openSqliteDatabase(sqlitePath);
const tables = Object.fromEntries(TABLES.map((table) => [table, countRows(db, table)]));
const reviewStatuses = Object.fromEntries(
  db
    .prepare("SELECT review_status, COUNT(*) AS count FROM essay_submissions GROUP BY review_status ORDER BY review_status")
    .all()
    .map((row) => [row.review_status, row.count])
);
const imageObjects = await summarizeImages(imageRoot);

console.log(
  JSON.stringify(
    {
      sqlitePath,
      imageRoot,
      tables,
      reviewStatuses,
      imageObjects
    },
    null,
    2
  )
);

function openSqliteDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

async function assertReadableSqlitePath(path) {
  try {
    await access(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`SQLite database not found: ${path}`);
    }
    throw error;
  }
}

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

async function summarizeImages(root) {
  const files = await listFiles(root).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const entries = await Promise.all(
    files.map(async (path) => ({
      key: relative(root, path).split(sep).join("/"),
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

async function listFiles(root) {
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

function parseArgs(argv) {
  const parsed = {};
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    const value = normalized[index + 1];
    if (arg === "--sqlite" && value) {
      parsed.sqlite = value;
      index += 1;
    } else if (arg === "--images" && value) {
      parsed.images = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return parsed;
}
