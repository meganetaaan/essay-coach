import { describe, expect, it } from "vitest";
import { createEssayDay } from "../src/application/use-cases/create-essay-day";
import { uploadEssaySubmission } from "../src/application/use-cases/upload-essay-submission";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import { EASY_REVIEW_RUBRIC } from "../src/domain/review/review";
import { InMemoryReviewJobQueue } from "../src/infrastructure/queue/in-memory-review-job-queue";
import { InMemoryEssayRepository } from "../src/infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../src/infrastructure/persistence/in-memory-review-repository";
import {
  handleAgentClaimReviewJob,
  handleAgentFailReviewJob,
  handleAgentGetCapabilities,
  handleAgentSubmitReviewJob,
  handleAgentValidateReview
} from "../src/interfaces/http/agent-api";
import { InMemoryAgentAuditLog } from "../src/infrastructure/agent/in-memory-agent-audit-log";
import { InMemoryAgentTokenRegistry } from "../src/infrastructure/agent/in-memory-agent-token-registry";
import { InMemoryAgentReviewJobStore } from "../src/infrastructure/agent/in-memory-agent-review-job-store";

const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("agent polling API", () => {
  it("capabilities manifest includes workflow steps and endpoint/scope guidance", async () => {
    const root = makeRoot();

    const response = await handleAgentGetCapabilities(root);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: "essay-coach",
      role: expect.stringContaining("review"),
      workflow: {
        steps: ["claim", "generate", "validate", "submit", "fail"]
      }
    });
    expect(response.body.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/agent/review-jobs/claim", requiredScopes: ["review:claim"] }),
        expect.objectContaining({ path: "/agent/review-jobs/:reviewJobId/submit", requiredScopes: ["review:submit"] })
      ])
    );
    expect(response.body.futureExtensions).toEqual(expect.arrayContaining([expect.stringContaining("webhook"), expect.stringContaining("MCP")]));
  });

  it("returns 401 for missing and invalid tokens", async () => {
    const root = makeRoot();

    await createSubmission(root);

    await expect(handleAgentClaimReviewJob({}, root)).resolves.toMatchObject({ status: 401 });
    await expect(handleAgentClaimReviewJob({ authorization: "Bearer invalid-token" }, root)).resolves.toMatchObject({ status: 401 });
  });

  it("returns 403 for insufficient token scope", async () => {
    const root = makeRoot();

    await createSubmission(root);
    const response = await handleAgentClaimReviewJob(auth("submit-token"), root);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: "insufficient_scope", requiredScopes: ["review:claim"] });
  });

  it("claims exactly one queued job with review context and agent instructions", async () => {
    const root = makeRoot();
    const first = await createSubmission(root, "2026-05-17", "hard");
    await createSubmission(root, "2026-05-18", "easy");

    const response = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    expect(response.status).toBe(200);
    expect(response.body.job).toMatchObject({
      submissionId: first.submission.id,
      strictness: "hard",
      attemptNumber: 1,
      topic: { title: "やさしさについて", prompt: expect.any(String) },
      priorSubmissions: [],
      priorReviews: [],
      rubric: expect.any(Object),
      rubricGuidance: expect.objectContaining({ strictness: "hard" }),
      workflowInstructions: expect.arrayContaining([expect.stringContaining("validate")]),
      submitContract: expect.objectContaining({ endpoint: expect.stringContaining("/submit") }),
      nextActions: ["generate_review", "validate_review", "submit_review_or_fail"]
    });
    expect((await root.deps.queue.list()).filter((job) => job.status === "processing")).toHaveLength(1);
    await expect(root.deps.essays.findSubmissionById(first.submission.id)).resolves.toMatchObject({ reviewStatus: "processing" });
  });

  it("rejects stale owners after a claim expires", async () => {
    const root = makeRoot({ now: new Date("2026-05-20T00:00:00.000Z") });
    await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    root.now = new Date("2026-05-20T00:06:00.000Z");
    const response = await handleAgentSubmitReviewJob(claim.body.job.reviewJobId, validReviewPayload(), auth("agent-a-token"), root);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: "claim_expired" });
  });

  it("prevents another agent from submitting a claimed job", async () => {
    const root = makeRoot();
    await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    const response = await handleAgentSubmitReviewJob(claim.body.job.reviewJobId, validReviewPayload(), auth("agent-b-token"), root);

    expect(response.status).toBe(403);
  });

  it("allows a timed-out claim to be reclaimed by another agent", async () => {
    const root = makeRoot({ now: new Date("2026-05-20T00:00:00.000Z") });
    await createSubmission(root);
    const firstClaim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    root.now = new Date("2026-05-20T00:06:00.000Z");
    const secondClaim = await handleAgentClaimReviewJob(auth("agent-b-token"), root);

    expect(secondClaim.status).toBe(200);
    expect(secondClaim.body.job.reviewJobId).toBe(firstClaim.body.job.reviewJobId);
    expect(secondClaim.body.job.claimedByAgentId).toBe("agent-b");
    expect(secondClaim.body.job.attemptNumber).toBe(2);
  });

  it("validate-review returns structured errors for malformed review payloads", async () => {
    const root = makeRoot();
    await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    const response = await handleAgentValidateReview(
      claim.body.job.reviewJobId,
      { ...validReviewPayload(), totalScore: 999, scores: { ...EASY_REVIEW_RUBRIC, topicRelation: 99 } },
      auth("agent-a-token"),
      root
    );

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ path: "scores.topicRelation", message: expect.stringContaining("max") }),
        expect.objectContaining({ path: "totalScore", message: expect.stringContaining("expected") })
      ]),
      nextActions: ["revise_review", "validate_review"]
    });
  });

  it("submit saves a review and is idempotent for identical payloads", async () => {
    const root = makeRoot();
    const { submission } = await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);
    const payload = validReviewPayload();

    const first = await handleAgentSubmitReviewJob(claim.body.job.reviewJobId, payload, auth("agent-a-token"), root);
    const second = await handleAgentSubmitReviewJob(claim.body.job.reviewJobId, payload, auth("agent-a-token"), root);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    await expect(root.deps.reviews.findBySubmissionId(submission.id)).resolves.toMatchObject({ totalScore: 100 });
    await expect(root.deps.essays.findSubmissionById(submission.id)).resolves.toMatchObject({
      ocrText: "本文",
      reviewStatus: "completed"
    });
  });

  it("returns 409 for a conflicting submit after completion", async () => {
    const root = makeRoot();
    await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    await handleAgentSubmitReviewJob(claim.body.job.reviewJobId, validReviewPayload(), auth("agent-a-token"), root);
    const response = await handleAgentSubmitReviewJob(
      claim.body.job.reviewJobId,
      { ...validReviewPayload(), parentSummary: "different summary" },
      auth("agent-a-token"),
      root
    );

    expect(response.status).toBe(409);
  });

  it("fail records sanitized metadata without raw provider payloads or secrets", async () => {
    const root = makeRoot();
    const { submission } = await createSubmission(root);
    const claim = await handleAgentClaimReviewJob(auth("agent-a-token"), root);

    const response = await handleAgentFailReviewJob(
      claim.body.job.reviewJobId,
      {
        reason: "provider_error",
        message: "OpenAI model gpt-5.5 failed with token sk-secret and raw payload { sensitive: true }",
        provider: "openai",
        model: "gpt-5.5",
        raw: { token: "sk-secret" }
      },
      auth("agent-a-token"),
      root
    );

    expect(response.status).toBe(200);
    expect(response.body.failure).toEqual({
      reason: "provider_error",
      message: "[redacted]",
      recordedAt: "2026-05-20T00:00:00.000Z"
    });
    expect(JSON.stringify(response.body)).not.toContain("openai");
    expect(JSON.stringify(response.body)).not.toContain("gpt-5.5");
    expect(JSON.stringify(response.body)).not.toContain("sk-secret");
    await expect(root.deps.essays.findSubmissionById(submission.id)).resolves.toMatchObject({ reviewStatus: "failed" });
  });
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

function makeRoot(options: { now?: Date } = {}) {
  const deps = {
    essays: new InMemoryEssayRepository(),
    reviews: new InMemoryReviewRepository(),
    queue: new InMemoryReviewJobQueue(),
    storage,
    reviewer: {
      async reviewEssayImage() {
        throw new Error("not used by agent API tests");
      }
    }
  };
  const root = {
    deps,
    agentAuth: new InMemoryAgentTokenRegistry([
      { agentId: "agent-a", token: "agent-a-token", scopes: ["review:claim", "review:validate", "review:submit", "review:fail"] },
      { agentId: "agent-b", token: "agent-b-token", scopes: ["review:claim", "review:validate", "review:submit", "review:fail"] },
      { agentId: "submit-only", token: "submit-token", scopes: ["review:submit"] }
    ]),
    agentReviewJobs: new InMemoryAgentReviewJobStore({
      claimTtlMs: 5 * 60 * 1000,
      now: () => root.now
    }),
    agentAuditLog: new InMemoryAgentAuditLog(),
    now: options.now ?? new Date("2026-05-20T00:00:00.000Z")
  };
  return root;
}

async function createSubmission(root: ReturnType<typeof makeRoot>, date = "2026-05-17", strictness: "easy" | "hard" = "easy") {
  const essayDay = await createEssayDay(
    { childId: "child-1", childGrade: 6, date, topicId: "kindness" },
    { essays: root.deps.essays }
  );
  const submission = await uploadEssaySubmission(
    { essayDayId: essayDay.id, strictness, contentType: "image/png", body: Buffer.from("image") },
    root.deps
  );
  return { essayDay, submission };
}

function validReviewPayload() {
  return {
    ocrText: "本文",
    totalScore: 100,
    scores: EASY_REVIEW_RUBRIC,
    topicComment: "題名に合っています。",
    strengths: ["具体的に書けています。"],
    improvementPoints: ["理由をもう一つ足しましょう。"],
    rewriteAdvice: ["最後に気持ちをまとめましょう。"],
    childFriendlyComment: "よく書けています。",
    parentSummary: "構成が明確です。",
    rawOutput: { source: "agent" }
  };
}
