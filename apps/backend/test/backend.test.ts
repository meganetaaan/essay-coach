import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { createEssayDay } from "../src/application/use-cases/create-essay-day";
import { processReviewJob } from "../src/application/use-cases/process-review-job";
import { uploadEssaySubmission } from "../src/application/use-cases/upload-essay-submission";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import { createCompositionRoot, resolveReviewerMode } from "../src/app/composition-root";
import { MVP_ESSAY_TOPICS, pickRandomEssayTopic } from "../src/domain/essay/topics";
import {
  EASY_REVIEW_RUBRIC,
  HARD_REVIEW_RUBRIC,
  getRubric,
  getRubricGuidance,
  rubricTotal,
  validateReviewScores,
  type Review
} from "../src/domain/review/review";
import { FakeEssayReviewer } from "../src/infrastructure/ai/fake/fake-essay-reviewer";
import { CliHermesCommandRunner, type HermesCommandRunnerInput } from "../src/infrastructure/ai/hermes/hermes-command-runner";
import { HermesEssayReviewer } from "../src/infrastructure/ai/hermes/hermes-essay-reviewer";
import { HermesReviewOutputParser } from "../src/infrastructure/ai/hermes/hermes-review-output-parser";
import { HermesReviewPromptBuilder } from "../src/infrastructure/ai/hermes/hermes-review-prompt-builder";
import { InMemoryReviewJobQueue } from "../src/infrastructure/queue/in-memory-review-job-queue";
import { InMemoryEssayRepository } from "../src/infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../src/infrastructure/persistence/in-memory-review-repository";
import { DEMO_CHILD_GRADE, getChildById, upsertDemoChild } from "../src/infrastructure/persistence/sqlite-database";
import { LocalObjectStorage } from "../src/infrastructure/storage/local-object-storage";

const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("essay coach MVP", () => {
  it("topic catalog always returns the free assignment topic", () => {
    expect(MVP_ESSAY_TOPICS).toEqual([
      {
        id: "free-assignment",
        title: "自由課題",
        prompt: "書きたいことを自由に書きましょう。"
      }
    ]);
    expect(pickRandomEssayTopic(() => 0).id).toBe("free-assignment");
    expect(pickRandomEssayTopic(() => 0.99).id).toBe("free-assignment");
  });

  it("easy/hard rubric max totals are 100", () => {
    expect(rubricTotal(EASY_REVIEW_RUBRIC)).toBe(100);
    expect(rubricTotal(HARD_REVIEW_RUBRIC)).toBe(100);
  });

  it("demo child defaults to elementary grade 6", async () => {
    expect(DEMO_CHILD_GRADE).toBe(6);

    const tempRoot = await mkdtemp(join(tmpdir(), "essay-coach-child-"));
    try {
      const sqlitePath = join(tempRoot, "child.sqlite");
      upsertDemoChild(sqlitePath);

      expect(getChildById(sqlitePath, "child-1")).toMatchObject({
        id: "child-1",
        grade: 6
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("provides grade-specific easy and hard rubric guidance", () => {
    expect(rubricTotal(getRubric("easy", 6))).toBe(100);
    expect(rubricTotal(getRubric("hard", 6))).toBe(100);

    const easyGrade6 = getRubricGuidance({ strictness: "easy", childGrade: 6 });
    expect(easyGrade6.policyBasis).toContain("東京都");
    expect(easyGrade6.policyBasis).toContain("学習指導要領");
    expect(easyGrade6.gradeFocus).toContain("小学6年生");
    expect(easyGrade6.extraEntranceExamFocus).toHaveLength(0);

    const hardGrade6 = getRubricGuidance({ strictness: "hard", childGrade: 6 });
    expect(hardGrade6.policyBasis).toContain("東京都");
    expect(hardGrade6.extraEntranceExamFocus.join("\n")).toContain("都立型中学受験");
    expect(hardGrade6.vocabularyLevel).toContain("一段高度");
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

  it("updates an existing essay day to the requested fixed topic when the catalog changes", async () => {
    const deps = makeDeps();
    await deps.essays.saveEssayDay({
      id: "legacy-day",
      childId: "child-1",
      childGrade: 4,
      date: "2026-05-17",
      topic: {
        id: "kindness",
        title: "やさしさについて",
        prompt: "だれかにやさしくしたこと、またはやさしくされたことについて書きましょう。"
      },
      createdAt: new Date("2026-05-17T00:00:00.000Z")
    });

    const essayDay = await createEssayDay(
      { childId: "child-1", childGrade: 4, date: "2026-05-17", topicId: "free-assignment" },
      { essays: deps.essays }
    );

    expect(essayDay).toMatchObject({
      id: "legacy-day",
      topic: {
        id: "free-assignment",
        title: "自由課題"
      }
    });
    await expect(deps.essays.findEssayDayById("legacy-day")).resolves.toMatchObject({
      topic: {
        id: "free-assignment",
        title: "自由課題"
      }
    });
  });

  it("upload submission increments attempt numbers and enqueues review jobs", async () => {
    const deps = makeDeps();
    const essayDay = await createEssayDay(
      { childId: "child-1", childGrade: 4, date: "2026-05-17", topicId: "free-assignment" },
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
      { childId: "child-1", childGrade: 4, date: "2026-05-17", topicId: "free-assignment" },
      { essays: deps.essays }
    );
    const submission = await uploadEssaySubmission(
      { essayDayId: essayDay.id, strictness: "easy", contentType: "image/png", body: Buffer.from("image") },
      deps
    );

    await processReviewJob(deps);

    const updatedSubmission = await deps.essays.findSubmissionById(submission.id);
    const review = await deps.reviews.findBySubmissionId(submission.id);
    expect(updatedSubmission?.ocrText).toContain("自由課題");
    expect(updatedSubmission?.reviewStatus).toBe("completed");
    expect(review?.submissionId).toBe(submission.id);
    await expect(deps.reviews.save({ ...(review as Review), id: "another" })).rejects.toThrow(/already exists/);
  });

  it("reviewer mode resolves to Hermes by default and keeps fake as explicit opt-in", () => {
    expect(resolveReviewerMode()).toBe("hermes");
    expect(resolveReviewerMode("")).toBe("hermes");
    expect(resolveReviewerMode("hermes")).toBe("hermes");
    expect(resolveReviewerMode("fake")).toBe("fake");
    expect(() => resolveReviewerMode("stub")).toThrow(/ESSAY_COACH_REVIEWER.*fake.*hermes/);
  });

  it("composition root defaults to Hermes reviewer without making a live review call", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "essay-coach-root-"));
    try {
      const defaultRoot = createCompositionRoot({ sqlitePath: join(tempRoot, "default.sqlite"), storage });
      const fakeRoot = createCompositionRoot({ reviewer: "fake", sqlitePath: join(tempRoot, "fake.sqlite"), storage });
      const hermesRoot = createCompositionRoot({ reviewer: "hermes", sqlitePath: join(tempRoot, "hermes.sqlite"), storage });

      expect(defaultRoot.deps.reviewer).toBeInstanceOf(HermesEssayReviewer);
      expect(fakeRoot.deps.reviewer).toBeInstanceOf(FakeEssayReviewer);
      expect(hermesRoot.deps.reviewer).toBeInstanceOf(HermesEssayReviewer);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("LocalObjectStorage returns an absolute local image path for Hermes --image", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "essay-coach-storage-"));
    const relativeRoot = join(tempRoot, "relative-storage");
    await mkdir(relativeRoot, { recursive: true });
    const previousCwd = process.cwd();
    try {
      process.chdir(tempRoot);
      const storage = new LocalObjectStorage("relative-storage");
      const { objectKey } = await storage.putObject({ key: "child/essay.png", contentType: "image/png", body: Buffer.from("image") });
      const imagePath = await storage.getReadableUrlOrPath(objectKey);

      expect(isAbsolute(imagePath)).toBe(true);
      expect(imagePath).toBe(join(tempRoot, "relative-storage", "child/essay.png"));
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("CliHermesCommandRunner builds Hermes Codex command args with attached image", () => {
    expect(new CliHermesCommandRunner().buildArgs({ prompt: "review this", imagePath: "/tmp/essay.png" })).toEqual([
      "chat",
      "-Q",
      "--provider",
      "openai-codex",
      "-m",
      "gpt-5.5",
      "--source",
      "essay-coach-review",
      "--max-turns",
      "4",
      "--image",
      "/tmp/essay.png",
      "-q",
      "review this"
    ]);
    expect(new CliHermesCommandRunner({ timeoutMs: 10_000 }).buildExecOptions()).toMatchObject({ timeout: 10_000 });
  });

  it("HermesEssayReviewer passes the readable image path to the runner", async () => {
    const calls: HermesCommandRunnerInput[] = [];
    const runner = {
      async runChat(input: HermesCommandRunnerInput) {
        calls.push(input);
        return JSON.stringify({
          ocrText: "本文",
          totalScore: 100,
          scores: EASY_REVIEW_RUBRIC,
          topicComment: "題名と関係があります。",
          strengths: ["よい点"],
          improvementPoints: ["直す点"],
          rewriteAdvice: ["書き直し"],
          childFriendlyComment: "よく書けています。",
          parentSummary: "保護者向け"
        });
      }
    };

    await new HermesEssayReviewer(runner).reviewEssayImage({
      childGrade: 6,
      essayDate: "2026-05-17",
      topic: MVP_ESSAY_TOPICS[0],
      topicAdherenceRequired: false,
      strictness: "easy",
      imageObjectKey: "image.png",
      imageUrlOrPath: "/tmp/image.png"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ imagePath: "/tmp/image.png" });
    expect(calls[0]?.prompt).toContain("attached");
  });

  it("Hermes prompt contains attached image OCR instruction, optional topic instruction, strictness and rubric", async () => {
    const prompt = new HermesReviewPromptBuilder().build({
      childGrade: 6,
      essayDate: "2026-05-17",
      topic: MVP_ESSAY_TOPICS[0],
      topicAdherenceRequired: false,
      strictness: "hard",
      imageObjectKey: "image.png",
      imageUrlOrPath: "/tmp/image.png"
    });

    expect(prompt).toContain("The handwritten Japanese essay image is attached");
    expect(prompt).toContain("OCR the attached image");
    expect(prompt).toContain("Topic adherence is optional");
    expect(prompt).toContain("Strictness: HARD");
    expect(prompt).toContain("小学6年生");
    expect(prompt).toContain("東京都");
    expect(prompt).toContain("学習指導要領");
    expect(prompt).toContain("都立型中学受験");
    expect(prompt).toContain("一段高度");
    expect(prompt).toContain('"topicRelation": 20');
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("totalScore must equal the sum");
  });

  it("Hermes output parser parses valid and fenced JSON and rejects invalid totals", () => {
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
    expect(parser.parse(`Here is the JSON:\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, "easy").totalScore).toBe(100);
    expect(() => parser.parse(JSON.stringify({ ...valid, totalScore: 99 }), "easy")).toThrow(/total score/);
    expect(() => parser.parse(JSON.stringify({ ...valid, totalScore: 101 }), "easy")).toThrow(/total score|0 and 100/);
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
