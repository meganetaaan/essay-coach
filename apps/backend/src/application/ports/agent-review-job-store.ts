export type AgentReviewJobState = "claimed" | "completed" | "failed";

export interface AgentFailureMetadata {
  reason: string;
  message: string;
  recordedAt: Date;
}

export interface AgentReviewJobClaim {
  reviewJobId: string;
  submissionId: string;
  claimedByAgentId: string;
  claimedAt: Date;
  claimExpiresAt: Date;
  attemptCount: number;
}

export interface AgentReviewJobRecord extends AgentReviewJobClaim {
  state: AgentReviewJobState;
  submittedPayloadHash?: string;
  failure?: AgentFailureMetadata;
}

export interface AgentReviewJobStore {
  get(reviewJobId: string): Promise<AgentReviewJobRecord | undefined>;
  recordClaim(input: {
    reviewJobId: string;
    submissionId: string;
    agentId: string;
  }): Promise<AgentReviewJobRecord>;
  markCompleted(input: { reviewJobId: string; submittedPayloadHash: string }): Promise<AgentReviewJobRecord>;
  markFailed(input: { reviewJobId: string; failure: AgentFailureMetadata }): Promise<AgentReviewJobRecord>;
  isClaimExpired(record: AgentReviewJobRecord): boolean;
}
