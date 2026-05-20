import type {
  AgentFailureMetadata,
  AgentReviewJobRecord,
  AgentReviewJobStore
} from "../../application/ports/agent-review-job-store";

export class InMemoryAgentReviewJobStore implements AgentReviewJobStore {
  private readonly records = new Map<string, AgentReviewJobRecord>();
  private readonly claimTtlMs: number;
  private readonly now: () => Date;

  constructor(options: { claimTtlMs?: number; now?: () => Date } = {}) {
    this.claimTtlMs = options.claimTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  async get(reviewJobId: string): Promise<AgentReviewJobRecord | undefined> {
    return this.records.get(reviewJobId);
  }

  async recordClaim(input: { reviewJobId: string; submissionId: string; agentId: string }): Promise<AgentReviewJobRecord> {
    const previous = this.records.get(input.reviewJobId);
    const claimedAt = this.now();
    const record: AgentReviewJobRecord = {
      reviewJobId: input.reviewJobId,
      submissionId: input.submissionId,
      state: "claimed",
      claimedByAgentId: input.agentId,
      claimedAt,
      claimExpiresAt: new Date(claimedAt.getTime() + this.claimTtlMs),
      attemptCount: (previous?.attemptCount ?? 0) + 1
    };
    this.records.set(input.reviewJobId, record);
    return record;
  }

  async markCompleted(input: { reviewJobId: string; submittedPayloadHash: string }): Promise<AgentReviewJobRecord> {
    const record = this.requireRecord(input.reviewJobId);
    const updated = { ...record, state: "completed" as const, submittedPayloadHash: input.submittedPayloadHash };
    this.records.set(input.reviewJobId, updated);
    return updated;
  }

  async markFailed(input: { reviewJobId: string; failure: AgentFailureMetadata }): Promise<AgentReviewJobRecord> {
    const record = this.requireRecord(input.reviewJobId);
    const updated = { ...record, state: "failed" as const, failure: input.failure };
    this.records.set(input.reviewJobId, updated);
    return updated;
  }

  isClaimExpired(record: AgentReviewJobRecord): boolean {
    return record.state === "claimed" && record.claimExpiresAt.getTime() <= this.now().getTime();
  }

  private requireRecord(reviewJobId: string): AgentReviewJobRecord {
    const record = this.records.get(reviewJobId);
    if (!record) throw new Error(`Agent review job not found: ${reviewJobId}`);
    return record;
  }
}
