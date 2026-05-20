import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { summarizeSqliteMigrationSource } from "../src/infrastructure/migration/sqlite-migration-summary";
import { initializeSqliteDatabase, openSqliteDatabase } from "../src/infrastructure/persistence/sqlite-database";

const tempRoots: string[] = [];

describe("SQLite migration summary", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("reports table counts and image objects without exposing private essay or review content", async () => {
    const root = await mkdtemp(join(tmpdir(), "essay-coach-summary-"));
    tempRoots.push(root);
    const dbPath = join(root, "essay-coach.sqlite");
    const imageRoot = join(root, "images");
    await mkdir(join(imageRoot, "child-1"), { recursive: true });
    await writeFile(join(imageRoot, "child-1", "essay.png"), Buffer.from("private-image-bytes"));
    initializeSqliteDatabase(dbPath);
    const db = openSqliteDatabase(dbPath);
    db.exec(`
      INSERT INTO guardians (id, display_name, updated_at)
      VALUES ('guardian-1', 'Private Guardian', '2026-05-21T00:00:00.000Z');
      INSERT INTO children (id, guardian_id, display_name, grade, updated_at)
      VALUES ('child-1', 'guardian-1', 'Private Child', 6, '2026-05-21T00:00:00.000Z');
      INSERT INTO essay_days (id, child_id, child_grade, date, topic_json, created_at)
      VALUES ('day-1', 'child-1', 6, '2026-05-21', '{"private":"topic"}', '2026-05-21T00:00:00.000Z');
      INSERT INTO essay_submissions (
        id, essay_day_id, attempt_number, strictness, image_object_key, ocr_text, review_status, submitted_at
      )
      VALUES (
        'submission-1', 'day-1', 1, 'easy', 'child-1/essay.png', 'SECRET_OCR_TEXT', 'completed', '2026-05-21T00:00:00.000Z'
      );
      INSERT INTO reviews (
        id, submission_id, strictness, ocr_text, total_score, scores_json, topic_comment, strengths_json,
        improvement_points_json, rewrite_advice_json, child_friendly_comment, parent_summary, raw_output_json, created_at
      )
      VALUES (
        'review-1', 'submission-1', 'easy', 'SECRET_REVIEW_OCR', 90, '{}', 'SECRET_TOPIC_COMMENT',
        '["SECRET_STRENGTH"]', '["SECRET_IMPROVEMENT"]', '["SECRET_REWRITE"]',
        'SECRET_CHILD_COMMENT', 'SECRET_PARENT_SUMMARY', '{"secret":"raw"}', '2026-05-21T00:00:00.000Z'
      );
    `);

    const summary = await summarizeSqliteMigrationSource({ sqlitePath: dbPath, imageRoot });
    const printable = JSON.stringify(summary);

    expect(summary.tables).toEqual({
      guardians: 1,
      children: 1,
      essay_days: 1,
      essay_submissions: 1,
      reviews: 1
    });
    expect(summary.reviewStatuses).toEqual({ completed: 1 });
    expect(summary.imageObjects).toEqual({
      count: 1,
      totalBytes: Buffer.byteLength("private-image-bytes"),
      keys: ["child-1/essay.png"]
    });
    expect(printable).not.toContain("SECRET_");
    expect(printable).not.toContain("Private Guardian");
    expect(printable).not.toContain("private-image-bytes");
  });
});
