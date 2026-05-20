import { describe, expect, it } from "vitest";
import { CloudflareD1AgentReviewJobStore } from "../src/infrastructure/agent/cloudflare-d1-agent-review-job-store";
import type { D1DatabaseLike, D1PreparedStatementLike, D1Result } from "../src/infrastructure/persistence/cloudflare-d1-types";
import { CloudflareD1ReviewJobQueue } from "../src/infrastructure/queue/cloudflare-d1-review-job-queue";
import { FakeD1Database } from "./fake-d1";

describe("Cloudflare D1-backed agent review runtime", () => {
  it("does not return a queued review job when another isolate already claimed it", async () => {
    const db = new ConditionalUpdateConflictD1();
    const queue = new CloudflareD1ReviewJobQueue(db);

    await expect(queue.pickNext()).resolves.toBeUndefined();
    expect(db.updateQuery).toContain("status = 'queued'");
  });

  it("does not overwrite an active claim for the same review job", async () => {
    const now = new Date("2026-05-21T00:00:00.000Z");
    const store = new CloudflareD1AgentReviewJobStore(new FakeD1Database(), { claimTtlMs: 60_000, now: () => now });

    await store.recordClaim({ reviewJobId: "review_job_1", submissionId: "submission_1", agentId: "agent-a" });

    await expect(
      store.recordClaim({ reviewJobId: "review_job_1", submissionId: "submission_1", agentId: "agent-b" })
    ).rejects.toThrow("Agent review job is actively claimed");
    await expect(store.get("review_job_1")).resolves.toMatchObject({
      claimedByAgentId: "agent-a",
      attemptCount: 1
    });
  });

  it("allows an expired active claim to be replaced atomically", async () => {
    let now = new Date("2026-05-21T00:00:00.000Z");
    const store = new CloudflareD1AgentReviewJobStore(new FakeD1Database(), { claimTtlMs: 60_000, now: () => now });

    await store.recordClaim({ reviewJobId: "review_job_1", submissionId: "submission_1", agentId: "agent-a" });
    now = new Date("2026-05-21T00:02:00.000Z");
    await expect(
      store.recordClaim({ reviewJobId: "review_job_1", submissionId: "submission_1", agentId: "agent-b" })
    ).resolves.toMatchObject({ claimedByAgentId: "agent-b", attemptCount: 2 });
  });
});

class ConditionalUpdateConflictD1 implements D1DatabaseLike {
  updateQuery = "";

  prepare(query: string): D1PreparedStatementLike {
    if (query.startsWith("SELECT * FROM review_jobs")) {
      return statement({
        first: async () => ({
          id: "review_job_1",
          submission_id: "submission_1",
          status: "queued",
          attempts: 0,
          error_message: null,
          created_at: "2026-05-21T00:00:00.000Z",
          updated_at: "2026-05-21T00:00:00.000Z"
        })
      });
    }
    if (query.startsWith("UPDATE review_jobs")) {
      this.updateQuery = query;
      return statement({ run: async () => ({ success: true, meta: { changes: 0 } }) });
    }
    throw new Error(`Unexpected query: ${query}`);
  }
}

function statement(overrides: Partial<D1PreparedStatementLike>): D1PreparedStatementLike {
  return {
    bind() {
      return this;
    },
    async first<T = unknown>(): Promise<T | null> {
      return null;
    },
    async all<T = unknown>(): Promise<D1Result<T>> {
      return { results: [] };
    },
    async run(): Promise<D1Result> {
      return { success: true, meta: { changes: 1 } };
    },
    ...overrides
  };
}
