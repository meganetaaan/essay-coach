import type { ReviewJob, ReviewJobQueue } from "../../application/ports/review-job-queue";
import { createId } from "../../shared/ids";
import type { D1DatabaseLike, D1Result } from "../persistence/cloudflare-d1-types";

interface ReviewJobRow {
  id: string;
  submission_id: string;
  status: ReviewJob["status"];
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class CloudflareD1ReviewJobQueue implements ReviewJobQueue {
  constructor(private readonly db: D1DatabaseLike) {}

  async enqueue(input: { submissionId: string }): Promise<ReviewJob> {
    const now = new Date().toISOString();
    const job: ReviewJob = {
      id: createId("review_job"),
      submissionId: input.submissionId,
      status: "queued",
      attempts: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };
    await this.db
      .prepare(
        `INSERT INTO review_jobs (id, submission_id, status, attempts, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(job.id, job.submissionId, job.status, job.attempts, null, now, now)
      .run();
    return job;
  }

  async pickNext(): Promise<ReviewJob | undefined> {
    const row = await this.db
      .prepare("SELECT * FROM review_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1")
      .bind("queued")
      .first<ReviewJobRow>();
    if (!row) return undefined;

    const updatedAt = new Date().toISOString();
    const attempts = row.attempts + 1;
    const result = await this.db
      .prepare("UPDATE review_jobs SET status = ?, attempts = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = 'queued'")
      .bind("processing", attempts, null, updatedAt, row.id)
      .run();
    if (result.meta?.changes !== 1) return undefined;
    return mapReviewJob({ ...row, status: "processing", attempts, error_message: null, updated_at: updatedAt });
  }

  async complete(jobId: string): Promise<void> {
    await this.update(jobId, { status: "completed", errorMessage: null });
  }

  async fail(jobId: string, error: Error): Promise<void> {
    await this.update(jobId, { status: "failed", errorMessage: error.message });
  }

  async list(): Promise<ReviewJob[]> {
    const result = await this.db.prepare("SELECT * FROM review_jobs ORDER BY created_at ASC").all<ReviewJobRow>();
    return rows(result).map(mapReviewJob);
  }

  private async update(jobId: string, patch: { status: ReviewJob["status"]; errorMessage: string | null }): Promise<void> {
    const result = await this.db
      .prepare("UPDATE review_jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?")
      .bind(patch.status, patch.errorMessage, new Date().toISOString(), jobId)
      .run();
    if (result.meta?.changes === 0) throw new Error(`Review job not found: ${jobId}`);
  }
}

function rows<T>(result: D1Result<T>): T[] {
  return result.results ?? [];
}

function mapReviewJob(row: ReviewJobRow): ReviewJob {
  return {
    id: row.id,
    submissionId: row.submission_id,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.error_message ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
