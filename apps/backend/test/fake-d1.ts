import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1Result
} from "../src/infrastructure/persistence/cloudflare-d1-types";

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

export class FakeD1Database implements D1DatabaseLike {
  private readonly db: SqliteDatabase;

  constructor() {
    this.db = new DatabaseSync(":memory:");
    for (const migration of readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
      this.db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
    }
  }

  prepare(query: string): D1PreparedStatementLike {
    return new FakeD1PreparedStatement(this.db, query);
  }
}

class FakeD1PreparedStatement implements D1PreparedStatementLike {
  private params: unknown[] = [];

  constructor(
    private readonly db: SqliteDatabase,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    const statement = new FakeD1PreparedStatement(this.db, this.query);
    statement.params = values;
    return statement;
  }

  async first<T = unknown>(): Promise<T | null> {
    return (this.db.prepare(this.query).get(...this.params) as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { results: this.db.prepare(this.query).all(...this.params) as T[] };
  }

  async run(): Promise<D1Result> {
    const result = this.db.prepare(this.query).run(...this.params);
    return {
      success: true,
      meta: {
        changes: result.changes
      }
    };
  }
}
