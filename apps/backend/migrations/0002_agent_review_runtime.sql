-- Persist Cloudflare Worker review queue and agent claim state across isolates.
-- No secrets or review payloads are stored here.

CREATE TABLE IF NOT EXISTS review_jobs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_jobs_status_updated
  ON review_jobs(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_review_jobs_submission_id
  ON review_jobs(submission_id);

CREATE TABLE IF NOT EXISTS agent_review_job_claims (
  review_job_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  state TEXT NOT NULL,
  claimed_by_agent_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  claim_expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  submitted_payload_hash TEXT,
  failure_reason TEXT,
  failure_message TEXT,
  failure_recorded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_review_job_claims_state_expires
  ON agent_review_job_claims(state, claim_expires_at);
