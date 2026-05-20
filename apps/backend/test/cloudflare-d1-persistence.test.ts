import { describe, expect, it } from "vitest";
import type { Review } from "../src/domain/review/review";
import { MVP_ESSAY_TOPICS } from "../src/domain/essay/topics";
import { CloudflareD1EssayRepository } from "../src/infrastructure/persistence/cloudflare-d1-essay-repository";
import { CloudflareD1ReviewRepository } from "../src/infrastructure/persistence/cloudflare-d1-review-repository";
import { FakeD1Database } from "./fake-d1";

describe("Cloudflare D1 persistence", () => {
  it("persists essay days and submissions through D1 prepared statements", async () => {
    const db = new FakeD1Database();
    const repo = new CloudflareD1EssayRepository(db);
    const child = await repo.ensureDefaultChildForGuardian({ guardianId: "guardian-d1", displayName: "D1 Child", grade: 5 });
    const essayDay = {
      id: "essay_day_d1_1",
      childId: child.id,
      childGrade: child.grade,
      date: "2026-05-21",
      topic: MVP_ESSAY_TOPICS[0],
      createdAt: new Date("2026-05-21T01:02:03.000Z")
    };

    await repo.saveEssayDay(essayDay);
    await repo.saveSubmission({
      id: "submission_d1_2",
      essayDayId: essayDay.id,
      attemptNumber: 2,
      strictness: "hard",
      imageObjectKey: `${child.id}/2026-05-21/attempt-2.png`,
      reviewStatus: "queued",
      submittedAt: new Date("2026-05-21T01:04:00.000Z")
    });
    await repo.saveSubmission({
      id: "submission_d1_1",
      essayDayId: essayDay.id,
      attemptNumber: 1,
      strictness: "easy",
      imageObjectKey: `${child.id}/2026-05-21/attempt-1.png`,
      ocrText: "本文",
      reviewStatus: "completed",
      submittedAt: new Date("2026-05-21T01:03:00.000Z")
    });

    await expect(repo.ensureDefaultChildForGuardian({ guardianId: "guardian-d1" })).resolves.toEqual(child);
    await expect(repo.findGuardianIdByChildId(child.id)).resolves.toBe("guardian-d1");
    await expect(repo.findEssayDayByChildAndDate(child.id, "2026-05-21")).resolves.toEqual(essayDay);
    await expect(repo.listEssayDaysForMonth({ childId: child.id, year: 2026, month: 5 })).resolves.toEqual([essayDay]);
    await expect(repo.listSubmissionsByEssayDay(essayDay.id)).resolves.toMatchObject([
      { id: "submission_d1_1", attemptNumber: 1, ocrText: "本文" },
      { id: "submission_d1_2", attemptNumber: 2, ocrText: undefined }
    ]);
  });

  it("persists reviews with JSON fields and restores Date values", async () => {
    const repo = new CloudflareD1ReviewRepository(new FakeD1Database());
    const review: Review = {
      id: "review_d1_1",
      submissionId: "submission_d1_1",
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
      createdAt: new Date("2026-05-21T02:00:00.000Z")
    };

    await repo.save(review);
    const persisted = await repo.findBySubmissionId(review.submissionId);

    expect(persisted).toEqual(review);
    expect(persisted?.createdAt).toBeInstanceOf(Date);
    await expect(repo.save({ ...review, id: "review_d1_duplicate" })).rejects.toThrow(
      "Review already exists for submission: submission_d1_1"
    );
  });
});
