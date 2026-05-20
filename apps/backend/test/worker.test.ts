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
import { handleWorkerRequest, type WorkerEnv } from "../src/worker";

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

  it("returns stable 400 JSON for malformed endpoint JSON", async () => {
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

async function expectJson(response: Response, status: number, expected?: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  const body = await response.json();
  if (expected) expect(body).toMatchObject(expected);
  return body;
}
