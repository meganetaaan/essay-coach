import { describe, expect, it } from "vitest";
import { createEssayDay } from "../src/application/use-cases/create-essay-day";
import { uploadEssaySubmission } from "../src/application/use-cases/upload-essay-submission";
import type { ObjectStorage } from "../src/application/ports/object-storage";
import { InMemoryAgentAuditLog } from "../src/infrastructure/agent/in-memory-agent-audit-log";
import { InMemoryAgentReviewJobStore } from "../src/infrastructure/agent/in-memory-agent-review-job-store";
import { InMemoryAgentTokenRegistry, hashToken } from "../src/infrastructure/agent/in-memory-agent-token-registry";
import { InMemoryEssayRepository } from "../src/infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../src/infrastructure/persistence/in-memory-review-repository";
import { InMemoryReviewJobQueue } from "../src/infrastructure/queue/in-memory-review-job-queue";
import { createCloudflareWorkerRoot, handleWorkerRequest, type WorkerEnv } from "../src/worker";
import { createApp } from "../src/app/create-app";
import { EASY_REVIEW_RUBRIC } from "../src/domain/review/review";
import { FakeD1Database } from "./fake-d1";

const storage: ObjectStorage = {
  async putObject(input) {
    return { objectKey: input.key };
  },
  async getReadableUrlOrPath(objectKey) {
    return `/tmp/${objectKey}`;
  }
};

describe("Cloudflare Worker agent API adapter", () => {
  it("returns health JSON without constructing persistence or requiring tokens", async () => {
    const response = await handleWorkerRequest(new Request("https://worker.test/health"), {}, {
      createRoot() {
        throw new Error("health must not construct app root");
      }
    });

    await expectJson(response, 200, { status: "ok" });
  });

  it("composes D1 and R2 bindings into the default Worker root", async () => {
    const bucket = new FakeR2Bucket();
    const root = createCloudflareWorkerRoot({
      ESSAY_COACH_DB: new FakeD1Database(),
      ESSAY_COACH_IMAGES: bucket,
      ESSAY_COACH_IMAGES_PUBLIC_BASE_URL: "https://cdn.example.test/images",
      ...tokenEnv()
    });
    const app = createApp(root.deps);
    const child = await root.deps.essays.ensureDefaultChildForGuardian({ guardianId: "guardian-worker", grade: 4 });
    const essayDay = await app.createEssayDay({
      childId: child.id,
      childGrade: child.grade,
      date: "2026-05-21",
      topicId: "free-assignment"
    });

    const submission = await app.uploadEssaySubmission({
      essayDayId: essayDay.id,
      strictness: "easy",
      contentType: "image/png",
      body: Buffer.from("worker-image")
    });

    expect(bucket.objects.get(`${child.id}/2026-05-21/attempt-1.png`)?.contentType).toBe("image/png");
    await expect(root.deps.essays.findSubmissionById(submission.id)).resolves.toMatchObject({
      id: submission.id,
      imageObjectKey: `${child.id}/2026-05-21/attempt-1.png`,
      reviewStatus: "queued"
    });
    await expect(root.deps.storage.getReadableUrlOrPath(submission.imageObjectKey)).resolves.toBe(
      `https://cdn.example.test/images/${child.id}/2026-05-21/attempt-1.png`
    );
  });

  it("persists queue and claim ownership across Worker roots that share D1", async () => {
    const db = new FakeD1Database();
    const env: WorkerEnv = {
      ESSAY_COACH_DB: db,
      ESSAY_COACH_IMAGES: new FakeR2Bucket(),
      ...tokenEnv()
    };
    const uploadRoot = createCloudflareWorkerRoot(env);
    const app = createApp(uploadRoot.deps);
    const child = await uploadRoot.deps.essays.ensureDefaultChildForGuardian({ guardianId: "guardian-worker", grade: 6 });
    const essayDay = await app.createEssayDay({
      childId: child.id,
      childGrade: child.grade,
      date: "2026-05-22",
      topicId: "free-assignment"
    });
    await app.uploadEssaySubmission({
      essayDayId: essayDay.id,
      strictness: "easy",
      contentType: "image/png",
      body: Buffer.from("worker-image")
    });

    const claim = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer agent-a-token" }
      }),
      env,
      { createRoot: () => createCloudflareWorkerRoot(env) }
    );
    const claimBody = await expectJson(claim, 200);

    const validate = await handleWorkerRequest(
      new Request(`https://worker.test/agent/review-jobs/${claimBody.job.reviewJobId}/validate-review`, {
        method: "POST",
        headers: { authorization: "Bearer agent-a-token", "content-type": "application/json" },
        body: JSON.stringify(validReviewPayload())
      }),
      env,
      { createRoot: () => createCloudflareWorkerRoot(env) }
    );

    await expectJson(validate, 200, { valid: true, nextActions: ["submit_review"] });
  });

  it("answers CORS preflight for agent endpoints", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/claim", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5173" }
      }),
      {}
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("fails protected endpoints closed when token env is missing or invalid", async () => {
    const missing = await handleWorkerRequest(new Request("https://worker.test/agent/review-jobs/claim", { method: "POST" }), {});
    const invalid = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer agent-a-token" }
      }),
      { ESSAY_COACH_AGENT_TOKENS_JSON: "not-json" }
    );

    await expectJson(missing, 503, { error: "agent_token_registry_unconfigured" });
    await expectJson(invalid, 503, { error: "agent_token_registry_unconfigured" });
  });

  it("returns a clear configuration error when protected default-root routes are missing D1 or R2 bindings", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer agent-a-token" }
      }),
      tokenEnv()
    );

    await expectJson(response, 503, { error: "worker_bindings_unconfigured" });
  });

  it("delegates claim requests to the existing agent handler with configured token records", async () => {
    const root = makeRoot();
    const { submission } = await createSubmission(root);

    const response = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer agent-a-token" }
      }),
      tokenEnv(),
      { createRoot: () => root }
    );

    const body = await expectJson(response, 200);
    expect(body.job).toMatchObject({
      submissionId: submission.id,
      claimedByAgentId: "agent-a",
      nextActions: ["generate_review", "validate_review", "submit_review_or_fail"]
    });
  });

  it("authenticates review body endpoints before parsing JSON", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/job-1/validate-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      }),
      tokenEnv(),
      { createRoot: () => makeRoot() }
    );

    await expectJson(response, 401, { error: "missing_or_invalid_token" });
  });

  it("returns stable 400 JSON for authenticated malformed endpoint JSON", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/agent/review-jobs/job-1/validate-review", {
        method: "POST",
        headers: {
          authorization: "Bearer agent-a-token",
          "content-type": "application/json"
        },
        body: "{"
      }),
      tokenEnv(),
      { createRoot: () => makeRoot() }
    );

    await expectJson(response, 400, { error: "malformed_json" });
  });

  it("returns stable 404 JSON for unknown routes", async () => {
    const response = await handleWorkerRequest(new Request("https://worker.test/nope"), {});

    await expectJson(response, 404, { error: "not_found" });
  });
});

class FakeR2Bucket {
  readonly objects = new Map<string, { body: ArrayBuffer | ArrayBufferView | string | ReadableStream; contentType?: string }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } }
  ) {
    this.objects.set(key, { body: value, contentType: options?.httpMetadata?.contentType });
  }
}

function tokenEnv(): WorkerEnv {
  return {
    ESSAY_COACH_AGENT_TOKENS_JSON: JSON.stringify([
      {
        agentId: "agent-a",
        tokenHash: hashToken("agent-a-token"),
        scopes: ["review:claim", "review:validate", "review:submit", "review:fail"]
      }
    ])
  };
}

function makeRoot() {
  const deps = {
    essays: new InMemoryEssayRepository(),
    reviews: new InMemoryReviewRepository(),
    queue: new InMemoryReviewJobQueue(),
    storage,
    reviewer: {
      async reviewEssayImage() {
        throw new Error("not used by worker tests");
      }
    }
  };
  const root = {
    deps,
    agentAuth: new InMemoryAgentTokenRegistry([
      { agentId: "agent-a", tokenHash: hashToken("agent-a-token"), scopes: ["review:claim", "review:validate", "review:submit", "review:fail"] }
    ]),
    agentReviewJobs: new InMemoryAgentReviewJobStore({
      claimTtlMs: 5 * 60 * 1000,
      now: () => root.now
    }),
    agentAuditLog: new InMemoryAgentAuditLog(),
    now: new Date("2026-05-20T00:00:00.000Z")
  };
  return root;
}

async function createSubmission(root: ReturnType<typeof makeRoot>) {
  const essayDay = await createEssayDay(
    { childId: "child-1", childGrade: 6, date: "2026-05-20", topicId: "free-assignment" },
    { essays: root.deps.essays }
  );
  const submission = await uploadEssaySubmission(
    { essayDayId: essayDay.id, strictness: "easy", contentType: "image/png", body: Buffer.from("image") },
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

async function expectJson(response: Response, status: number, expected?: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  const body = await response.json();
  if (expected) expect(body).toMatchObject(expected);
  return body;
}
