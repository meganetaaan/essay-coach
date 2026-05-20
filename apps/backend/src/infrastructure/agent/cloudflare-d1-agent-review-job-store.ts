import type {
  AgentFailureMetadata,
  AgentReviewJobRecord,
  AgentReviewJobState,
  AgentReviewJobStore
} from "../../application/ports/agent-review-job-store";
import type { D1DatabaseLike } from "../persistence/cloudflare-d1-types";

interface AgentReviewJobClaimRow {
  review_job_id: string;
  submission_id: string;
  state: AgentReviewJobState;
  claimed_by_agent_id: string;
  claimed_at: string;
  claim_expires_at: string;
  attempt_count: number;
  submitted_payload_hash: string | null;
  failure_reason: string | null;
  failure_message: string | null;
  failure_recorded_at: string | null;
}

export class CloudflareD1AgentReviewJobStore implements AgentReviewJobStore {
  private readonly claimTtlMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly db: D1DatabaseLike,
    options: { claimTtlMs?: number; now?: () => Date } = {}
  ) {
    this.claimTtlMs = options.claimTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  async get(reviewJobId: string): Promise<AgentReviewJobRecord | undefined> {
    const row = await this.db.prepare("SELECT * FROM agent_review_job_claims WHERE review_job_id = ? LIMIT 1").bind(reviewJobId).first<AgentReviewJobClaimRow>();
    return row ? mapRecord(row) : undefined;
  }

  async recordClaim(input: { reviewJobId: string; submissionId: string; agentId: string }): Promise<AgentReviewJobRecord> {
    const previous = await this.get(input.reviewJobId);
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

    await this.db
      .prepare(
        `INSERT INTO agent_review_job_claims (
           review_job_id,
           submission_id,
           state,
           claimed_by_agent_id,
           claimed_at,
           claim_expires_at,
           attempt_count,
           submitted_payload_hash,
           failure_reason,
           failure_message,
           failure_recorded_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(review_job_id) DO UPDATE SET
           submission_id = excluded.submission_id,
           state = excluded.state,
           claimed_by_agent_id = excluded.claimed_by_agent_id,
           claimed_at = excluded.claimed_at,
           claim_expires_at = excluded.claim_expires_at,
           attempt_count = excluded.attempt_count,
           submitted_payload_hash = excluded.submitted_payload_hash,
           failure_reason = excluded.failure_reason,
           failure_message = excluded.failure_message,
           failure_recorded_at = excluded.failure_recorded_at`
      )
      .bind(
        record.reviewJobId,
        record.submissionId,
        record.state,
        record.claimedByAgentId,
        record.claimedAt.toISOString(),
        record.claimExpiresAt.toISOString(),
        record.attemptCount,
        null,
        null,
        null,
        null
      )
      .run();
    return record;
  }

  async markCompleted(input: { reviewJobId: string; submittedPayloadHash: string }): Promise<AgentReviewJobRecord> {
    const record = await this.requireRecord(input.reviewJobId);
    const updated: AgentReviewJobRecord = { ...record, state: "completed", submittedPayloadHash: input.submittedPayloadHash };
    await this.db
      .prepare(
        `UPDATE agent_review_job_claims
         SET state = ?, submitted_payload_hash = ?, failure_reason = ?, failure_message = ?, failure_recorded_at = ?
         WHERE review_job_id = ?`
      )
      .bind("completed", input.submittedPayloadHash, null, null, null, input.reviewJobId)
      .run();
    return updated;
  }

  async markFailed(input: { reviewJobId: string; failure: AgentFailureMetadata }): Promise<AgentReviewJobRecord> {
    const record = await this.requireRecord(input.reviewJobId);
    const updated: AgentReviewJobRecord = { ...record, state: "failed", failure: input.failure };
    await this.db
      .prepare(
        `UPDATE agent_review_job_claims
         SET state = ?, failure_reason = ?, failure_message = ?, failure_recorded_at = ?
         WHERE review_job_id = ?`
      )
      .bind("failed", input.failure.reason, input.failure.message, input.failure.recordedAt.toISOString(), input.reviewJobId)
      .run();
    return updated;
  }

  isClaimExpired(record: AgentReviewJobRecord): boolean {
    return record.state === "claimed" && record.claimExpiresAt.getTime() <= this.now().getTime();
  }

  private async requireRecord(reviewJobId: string): Promise<AgentReviewJobRecord> {
    const record = await this.get(reviewJobId);
    if (!record) throw new Error(`Agent review job not found: ${reviewJobId}`);
    return record;
  }
}

function mapRecord(row: AgentReviewJobClaimRow): AgentReviewJobRecord {
  return {
    reviewJobId: row.review_job_id,
    submissionId: row.submission_id,
    state: row.state,
    claimedByAgentId: row.claimed_by_agent_id,
    claimedAt: new Date(row.claimed_at),
    claimExpiresAt: new Date(row.claim_expires_at),
    attemptCount: row.attempt_count,
    submittedPayloadHash: row.submitted_payload_hash ?? undefined,
    failure:
      row.failure_reason && row.failure_message && row.failure_recorded_at
        ? {
            reason: row.failure_reason,
            message: row.failure_message,
            recordedAt: new Date(row.failure_recorded_at)
          }
        : undefined
  };
}
