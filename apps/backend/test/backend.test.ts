import { describe, expect, it } from "vitest";
import { createEssayDay } from "../src/application/use-cases/create-essay-day";
import { processReviewJob } from "../src/application/use-cases/process-review-job";
import { uploadEssaySubmission } from "../src/application/use-cases/upload-essay-submission";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import { MVP_ESSAY_TOPICS, pickRandomEssayTopic } from "../src/domain/essay/topics";
import {
  EASY_REVIEW_RUBRIC,
  HARD_REVIEW_RUBRIC,
  rubricTotal,
  validateReviewScores,
  type Review
} from "../src/domain/review/review";
import { FakeEssayReviewer } from "../src/infrastructure/ai/fake/fake-essay-reviewer";
import { HermesReviewOutputParser } from "../src/infrastructure/ai/hermes/hermes-review-output-parser";
import { HermesReviewPromptBuilder } from "../src/infrastructure/ai/hermes/hermes-review-prompt-builder";
import { InMemoryReviewJobQueue } from "../src/infrastructure/queue/in-memory-review-job-queue";
import { InMemoryEssayRepository } from "../src/infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../src/infrastructure/persistence/in-memory-review-repository";

const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("essay coach MVP", () => {
  it("topic catalog returns a topic", () => {
    expect(MVP_ESSAY_TOPICS.length).toBeGreaterThan(0);
    expect(pickRandomEssayTopic(() => 0).id).toBe(MVP_ESSAY_TOPICS[0].id);
  });

  it("easy/hard rubric max totals are 100", () => {
    expect(rubricTotal(EASY_REVIEW_RUBRIC)).toBe(100);
    expect(rubricTotal(HARD_REVIEW_RUBRIC)).toBe(100);
  });

  it("validates review score totals and dimension maximums", () => {
    expect(() =>
      validateReviewScores({
        strictness: "easy",
        totalScore: 100,
        scores: EASY_REVIEW_RUBRIC
      })
    ).not.toThrow();
    expect(() =>
      validateReviewScores({
        strictness: "easy",
        totalScore: 101,
        scores: { ...EASY_REVIEW_RUBRIC, topicRelation: 11 }
      })
    ).toThrow(/topicRelation/);
    expect(() =>
      validateReviewScores({
        strictness: "easy",
        totalScore: 99,
        scores: EASY_REVIEW_RUBRIC
      })
    ).toThrow(/total score/);
  });

  it("upload submission increments attempt numbers and enqueues review jobs", async () => {
    const deps = makeDeps();
    const essayDay = await createEssayDay(
      { childId: "child-1", childGrade: 4, date: "2026-05-17", topicId: "kindness" },
      { essays: deps.essays }
    );

    const first = await uploadEssaySubmission(
      { essayDayId: essayDay.id, strictness: "easy", contentType: "image/png", body: Buffer.from("one") },
      deps
    );
    const second = await uploadEssaySubmission(
      { essayDayId: essayDay.id, strictness: "hard", contentType: "image/png", body: Buffer.from("two") },
      deps
    );

    expect(first.attemptNumber).toBe(1);
    expect(second.attemptNumber).toBe(2);
    expect(await deps.queue.list()).toHaveLength(2);
  });

  it("processReviewJob saves OCR text and exactly one review", async () => {
    const deps = makeDeps();
    const essayDay = await createEssayDay(
      { childId: "child-1", childGrade: 4, date: "2026-05-17", topicId: "kindness" },
      { essays: deps.essays }
    );
    const submission = await uploadEssaySubmission(
      { essayDayId: essayDay.id, strictness: "easy", contentType: "image/png", body: Buffer.from("image") },
      deps
    );

    await processReviewJob(deps);

    const updatedSubmission = await deps.essays.findSubmissionById(submission.id);
    const review = await deps.reviews.findBySubmissionId(submission.id);
    expect(updatedSubmission?.ocrText).toContain("やさしさ");
    expect(updatedSubmission?.reviewStatus).toBe("completed");
    expect(review?.submissionId).toBe(submission.id);
    await expect(deps.reviews.save({ ...(review as Review), id: "another" })).rejects.toThrow(/already exists/);
  });

  it("Hermes prompt contains OCR instruction, optional topic instruction, strictness and rubric", async () => {
    const prompt = new HermesReviewPromptBuilder().build({
      childGrade: 4,
      essayDate: "2026-05-17",
      topic: MVP_ESSAY_TOPICS[0],
      topicAdherenceRequired: false,
      strictness: "hard",
      imageObjectKey: "image.png",
      imageUrlOrPath: "/tmp/image.png"
    });

    expect(prompt).toContain("OCR the handwritten essay image");
    expect(prompt).toContain("Topic adherence is optional");
    expect(prompt).toContain("Strictness: HARD");
    expect(prompt).toContain('"topicRelation": 20');
    expect(prompt).toContain("Return JSON only");
  });

  it("Hermes output parser parses valid JSON and rejects invalid totals", () => {
    const parser = new HermesReviewOutputParser();
    const valid = {
      ocrText: "本文",
      totalScore: 100,
      scores: EASY_REVIEW_RUBRIC,
      topicComment: "関係があります",
      strengths: ["よい点"],
      improvementPoints: ["直す点"],
      rewriteAdvice: ["書き直し"],
      childFriendlyComment: "がんばったね",
      parentSummary: "保護者向け"
    };
    expect(parser.parse(JSON.stringify(valid), "easy").totalScore).toBe(100);
    expect(() => parser.parse(JSON.stringify({ ...valid, totalScore: 99 }), "easy")).toThrow(/total score/);
  });
});

function makeDeps() {
  return {
    essays: new InMemoryEssayRepository(),
    reviews: new InMemoryReviewRepository(),
    queue: new InMemoryReviewJobQueue(),
    storage,
    reviewer: new FakeEssayReviewer()
  };
}
