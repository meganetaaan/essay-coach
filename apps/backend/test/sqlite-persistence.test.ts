import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createCompositionRoot } from "../src/app/composition-root";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import type { Review } from "../src/domain/review/review";
import { MVP_ESSAY_TOPICS } from "../src/domain/essay/topics";
import { initializeSqliteDatabase, getChildById, upsertDemoChild, openSqliteDatabase } from "../src/infrastructure/persistence/sqlite-database";
import { SqliteEssayRepository } from "../src/infrastructure/persistence/sqlite-essay-repository";
import { SqliteReviewRepository } from "../src/infrastructure/persistence/sqlite-review-repository";

const tempRoots: string[] = [];

const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("SQLite persistence", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("persists essay days and submissions across repository instances", async () => {
    const dbPath = await makeDbPath();
    initializeSqliteDatabase(dbPath);
    const firstRepo = new SqliteEssayRepository(dbPath);
    const essayDay = {
      id: "essay_day_sqlite_1",
      childId: "child-1",
      childGrade: 4,
      date: "2026-05-17",
      topic: MVP_ESSAY_TOPICS[0],
      createdAt: new Date("2026-05-17T01:02:03.000Z")
    };

    await firstRepo.saveEssayDay(essayDay);
    await firstRepo.saveSubmission({
      id: "submission_sqlite_2",
      essayDayId: essayDay.id,
      attemptNumber: 2,
      strictness: "hard",
      imageObjectKey: "child-1/2026-05-17/attempt-2.png",
      reviewStatus: "queued",
      submittedAt: new Date("2026-05-17T01:04:00.000Z")
    });
    await firstRepo.saveSubmission({
      id: "submission_sqlite_1",
      essayDayId: essayDay.id,
      attemptNumber: 1,
      strictness: "easy",
      imageObjectKey: "child-1/2026-05-17/attempt-1.png",
      ocrText: "本文",
      reviewStatus: "completed",
      submittedAt: new Date("2026-05-17T01:03:00.000Z")
    });

    const secondRepo = new SqliteEssayRepository(dbPath);

    await expect(secondRepo.findEssayDayByChildAndDate("child-1", "2026-05-17")).resolves.toEqual(essayDay);
    await expect(secondRepo.listEssayDaysForMonth({ childId: "child-1", year: 2026, month: 5 })).resolves.toEqual([essayDay]);
    await expect(secondRepo.listSubmissionsByEssayDay(essayDay.id)).resolves.toMatchObject([
      { id: "submission_sqlite_1", attemptNumber: 1, ocrText: "本文" },
      { id: "submission_sqlite_2", attemptNumber: 2, ocrText: undefined }
    ]);
  });

  it("migrates an existing children table before creating guardian indexes", async () => {
    const dbPath = await makeDbPath();
    const legacyDb = openSqliteDatabase(dbPath);
    legacyDb.exec(`
      CREATE TABLE children (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        grade INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO children (id, display_name, grade, updated_at)
      VALUES ('child-1', 'デモ児童', 6, '2026-05-17T00:00:00.000Z');
    `);

    expect(() => initializeSqliteDatabase(dbPath)).not.toThrow();
    const db = openSqliteDatabase(dbPath);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all();

    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "idx_children_guardian_id" })]));
    expect(getChildById(dbPath, "child-1")).toEqual({ id: "child-1", displayName: "デモ児童", grade: 6 });
  });

  it("initializes guardian tables and child ownership columns", async () => {
    const dbPath = await makeDbPath();
    initializeSqliteDatabase(dbPath);
    const db = openSqliteDatabase(dbPath);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    const childColumns = db.prepare("PRAGMA table_info(children)").all();

    expect(tables).toEqual(expect.arrayContaining([expect.objectContaining({ name: "guardians" })]));
    expect(childColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "guardian_id",
          notnull: 1
        })
      ])
    );
  });

  it("ensures different default children for different guardians", async () => {
    const dbPath = await makeDbPath();
    const repo = new SqliteEssayRepository(dbPath);

    const childA = await repo.ensureDefaultChildForGuardian({ guardianId: "user_a" });
    const childAAgain = await repo.ensureDefaultChildForGuardian({ guardianId: "user_a" });
    const childB = await repo.ensureDefaultChildForGuardian({ guardianId: "user_b" });

    expect(childAAgain).toEqual(childA);
    expect(childA.id).not.toBe(childB.id);
    expect(await repo.findGuardianIdByChildId(childA.id)).toBe("user_a");
    expect(await repo.findGuardianIdByChildId(childB.id)).toBe("user_b");
  });

  it("persists reviews with JSON fields and restores Date values", async () => {
    const dbPath = await makeDbPath();
    initializeSqliteDatabase(dbPath);
    const review: Review = {
      id: "review_sqlite_1",
      submissionId: "submission_sqlite_1",
      strictness: "easy",
      ocrText: "作文本文",
      totalScore: 100,
      scores: {
        topicRelation: 10,
        taskUnderstanding: 20,
        structure: 15,
        specificity: 20,
        expression: 15,
        grammarAndNotation: 10,
        readerAwareness: 10
      },
      topicComment: "題名に合っています。",
      strengths: ["具体的です"],
      improvementPoints: ["段落を増やす"],
      rewriteAdvice: ["さいごに気持ちを書く"],
      childFriendlyComment: "よく書けています。",
      parentSummary: "保護者向け要約",
      rawOutput: { nested: { ok: true }, values: [1, "two"] },
      createdAt: new Date("2026-05-17T02:00:00.000Z")
    };

    await new SqliteReviewRepository(dbPath).save(review);
    const persisted = await new SqliteReviewRepository(dbPath).findBySubmissionId(review.submissionId);

    expect(persisted).toEqual(review);
    expect(persisted?.createdAt).toBeInstanceOf(Date);
  });

  it("composition roots using the same SQLite path share persisted submission and review state", async () => {
    const dbPath = await makeDbPath();
    const firstRoot = createCompositionRoot({ reviewer: "fake", sqlitePath: dbPath, storage });
    const createResponse = await firstRoot.app.createEssayDay({
      childId: "child-1",
      childGrade: 4,
      date: "2026-05-17",
      topicId: "free-assignment"
    });
    const submission = await firstRoot.app.uploadEssaySubmission({
      essayDayId: createResponse.id,
      strictness: "easy",
      contentType: "image/png",
      body: Buffer.from("image")
    });
    await firstRoot.processReviewJob();

    const secondRoot = createCompositionRoot({ reviewer: "fake", sqlitePath: dbPath, storage });

    await expect(secondRoot.deps.essays.findEssayDayById(createResponse.id)).resolves.toEqual(createResponse);
    await expect(secondRoot.deps.essays.findSubmissionById(submission.id)).resolves.toMatchObject({
      id: submission.id,
      reviewStatus: "completed",
      ocrText: expect.stringContaining("自由課題")
    });
    await expect(secondRoot.deps.reviews.findBySubmissionId(submission.id)).resolves.toMatchObject({
      submissionId: submission.id,
      ocrText: expect.stringContaining("自由課題")
    });
  });

  it("upserts the demo child idempotently", async () => {
    const dbPath = await makeDbPath();
    initializeSqliteDatabase(dbPath);

    upsertDemoChild(dbPath);
    upsertDemoChild(dbPath);

    expect(getChildById(dbPath, "child-1")).toEqual({
      id: "child-1",
      displayName: "デモ児童",
      grade: 6
    });
  });
});

async function makeDbPath() {
  const root = await mkdtemp(join(tmpdir(), "essay-coach-sqlite-"));
  tempRoots.push(root);
  return join(root, "essay-coach.sqlite");
}
