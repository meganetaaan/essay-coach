import { describe, expect, it } from "vitest";
import { createApp } from "../src/app/create-app";
import { processReviewJob } from "../src/application/use-cases/process-review-job";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import { FakeEssayReviewer } from "../src/infrastructure/ai/fake/fake-essay-reviewer";
import { InMemoryReviewJobQueue } from "../src/infrastructure/queue/in-memory-review-job-queue";
import { InMemoryEssayRepository } from "../src/infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../src/infrastructure/persistence/in-memory-review-repository";
import {
  handleCreateMvpSubmission,
  handleGetMvpSubmissionStatus,
  handleListMvpMonthSubmissions
} from "../src/interfaces/http/mvp-submissions";
import type { AuthenticatedActor } from "../src/interfaces/http/auth-context";

const imageDataUrl = `data:image/png;base64,${Buffer.from("fake image").toString("base64")}`;
const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("MVP submissions HTTP handler", () => {
  it("rejects create, list, and status requests without an authenticated actor", async () => {
    const root = makeRoot();
    const createResponse = await handleCreateMvpSubmission(
      {
        date: "2026-05-17",
        strictness: "easy",
        contentType: "image/png",
        imageDataUrl
      },
      root
    );

    expect(createResponse.status).toBe(401);
    expect(createResponse.body).toEqual({ error: "auth_context_missing" });
    await expect(handleListMvpMonthSubmissions({ year: "2026", month: "5" }, root)).resolves.toMatchObject({
      status: 401,
      body: { error: "auth_context_missing" }
    });
    await expect(handleGetMvpSubmissionStatus("submission-1", root)).resolves.toMatchObject({
      status: 401,
      body: { error: "auth_context_missing" }
    });
  });

  it("rejects missing image", async () => {
    const root = makeRoot();

    const response = await handleCreateMvpSubmission(
      {
        date: "2026-05-17",
        strictness: "easy",
        contentType: "image/png"
      },
      root,
      actor("user_a")
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "imageDataUrl is required"
    });
  });

  it("creates a submission and returns a queued lifecycle response before review completion", async () => {
    const root = makeRoot();

    const response = await handleCreateMvpSubmission(
      {
        date: "2026-05-17",
        strictness: "hard",
        contentType: "image/png",
        imageDataUrl,
        sampleReviewId: "middle"
      },
      root,
      actor("user_a")
    );

    expect(response.status).toBe(201);
    expect(response.body.essayDay.date).toBe("2026-05-17");
    expect(response.body.submission.strictness).toBe("hard");
    expect(response.body.submission.reviewStatus).toBe("queued");
    expect(response.body.review).toBeUndefined();
    expect(response.body.imagePreviewUrl).toBe(imageDataUrl);
    expect(response.body.processStatus).toBe("queued");
    await expect(root.deps.essays.findEssayDayById(response.body.essayDay.id)).resolves.toMatchObject({ childGrade: 6 });
    await expect(root.deps.queue.list()).resolves.toMatchObject([{ status: "queued" }]);
  });

  it("returns completed review status after the queued job is processed", async () => {
    const root = makeRoot();
    const createResponse = await handleCreateMvpSubmission(
      {
        date: "2026-05-17",
        strictness: "easy",
        contentType: "image/png",
        imageDataUrl
      },
      root,
      actor("user_a")
    );

    await root.processReviewJob();
    const response = await handleGetMvpSubmissionStatus(createResponse.body.submission.id, root, actor("user_a"));

    expect(response.status).toBe(200);
    expect(response.body.processStatus).toBe("completed");
    expect(response.body.submission.reviewStatus).toBe("completed");
    expect(response.body.review?.submissionId).toBe(createResponse.body.submission.id);
    expect(response.body.review?.ocrText).toContain("自由課題");
  });

  it("returns same-day submission history with submitted time and score for detail views", async () => {
    const root = makeRoot();
    const first = await createAndProcess(root, "2026-05-17", "easy");
    const second = await createAndProcess(root, "2026-05-17", "hard");

    const response = await handleGetMvpSubmissionStatus(second.body.submission.id, root, actor("user_a"));

    expect(response.status).toBe(200);
    expect(response.body.submissionHistory).toHaveLength(2);
    expect(response.body.submissionHistory).toEqual([
      expect.objectContaining({
        submission: expect.objectContaining({ id: first.body.submission.id, attemptNumber: 1 }),
        score: expect.any(Number)
      }),
      expect.objectContaining({
        submission: expect.objectContaining({ id: second.body.submission.id, attemptNumber: 2 }),
        score: expect.any(Number)
      })
    ]);
  });

  it("lists persisted month submissions with latest submission and completed review for each day", async () => {
    const root = makeRoot();
    const first = await createAndProcess(root, "2026-05-01", "easy");
    const second = await createAndProcess(root, "2026-05-02", "hard");

    const response = await handleListMvpMonthSubmissions({ year: "2026", month: "5" }, root, actor("user_a"));

    expect(response.status).toBe(200);
    expect(response.body.days).toHaveLength(2);
    expect(response.body.days.map((day) => day.essayDay.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(response.body.days[0]).toMatchObject({
      latestSubmission: { id: first.body.submission.id, attemptNumber: 1, reviewStatus: "completed" },
      review: { submissionId: first.body.submission.id },
      processStatus: "completed"
    });
    expect(response.body.days[1]).toMatchObject({
      latestSubmission: { id: second.body.submission.id, attemptNumber: 1, reviewStatus: "completed" },
      review: { submissionId: second.body.submission.id },
      processStatus: "completed"
    });
  });

  it("lists only the latest attempt for a day when multiple submissions exist", async () => {
    const root = makeRoot();
    const first = await createAndProcess(root, "2026-05-01", "easy");
    const second = await createAndProcess(root, "2026-05-01", "hard");

    const response = await handleListMvpMonthSubmissions({ year: "2026", month: "5" }, root, actor("user_a"));

    expect(response.status).toBe(200);
    expect(response.body.days).toHaveLength(1);
    expect(response.body.days[0]).toMatchObject({
      essayDay: { date: "2026-05-01" },
      latestSubmission: { id: second.body.submission.id, attemptNumber: 2, strictness: "hard", reviewStatus: "completed" },
      review: { submissionId: second.body.submission.id },
      submissionHistory: [
        { submission: { id: first.body.submission.id, attemptNumber: 1 }, score: expect.any(Number) },
        { submission: { id: second.body.submission.id, attemptNumber: 2 }, score: expect.any(Number) }
      ],
      processStatus: "completed"
    });
    expect(response.body.days[0]?.latestSubmission?.id).not.toBe(first.body.submission.id);
  });

  it("keeps submission list and status scoped to the authenticated guardian child", async () => {
    const root = makeRoot();
    const userA = actor("user_a");
    const userB = actor("user_b");
    const userASubmission = await createAndProcess(root, "2026-05-01", "easy", userA);
    const userBSubmission = await createAndProcess(root, "2026-05-02", "hard", userB);

    const userAList = await handleListMvpMonthSubmissions({ year: "2026", month: "5" }, root, userA);
    const userBList = await handleListMvpMonthSubmissions({ year: "2026", month: "5" }, root, userB);
    const crossStatus = await handleGetMvpSubmissionStatus(userBSubmission.body.submission.id, root, userA);

    expect(userAList.status).toBe(200);
    expect(userAList.body.days.map((day) => day.latestSubmission?.id)).toEqual([userASubmission.body.submission.id]);
    expect(userBList.status).toBe(200);
    expect(userBList.body.days.map((day) => day.latestSubmission?.id)).toEqual([userBSubmission.body.submission.id]);
    expect(crossStatus).toMatchObject({ status: 404, body: { error: "submission was not found" } });
  });
});

function makeRoot() {
  const deps = {
    essays: new InMemoryEssayRepository(),
    reviews: new InMemoryReviewRepository(),
    queue: new InMemoryReviewJobQueue(),
    storage,
    reviewer: new FakeEssayReviewer()
  };

  return {
    deps,
    app: createApp(deps),
    processReviewJob: () => processReviewJob(deps)
  };
}

function actor(userId: string): AuthenticatedActor {
  return { userId };
}

async function createAndProcess(
  root: ReturnType<typeof makeRoot>,
  date: string,
  strictness: "easy" | "hard",
  authenticatedActor = actor("user_a")
) {
  const response = await handleCreateMvpSubmission(
    {
      date,
      strictness,
      contentType: "image/png",
      imageDataUrl
    },
    root,
    authenticatedActor
  );
  await root.processReviewJob();
  return response;
}
