import type { ReviewJob, ReviewJobQueue } from "../../application/ports/review-job-queue";
import { createId } from "../../shared/ids";

export class InMemoryReviewJobQueue implements ReviewJobQueue {
  private readonly jobs = new Map<string, ReviewJob>();

  async enqueue(input: { submissionId: string }): Promise<ReviewJob> {
    const now = new Date();
    const job: ReviewJob = {
      id: createId("review_job"),
      submissionId: input.submissionId,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async pickNext(): Promise<ReviewJob | undefined> {
    const job = [...this.jobs.values()].find((candidate) => candidate.status === "queued");
    if (!job) return undefined;
    const updated = { ...job, status: "processing" as const, attempts: job.attempts + 1, updatedAt: new Date() };
    this.jobs.set(job.id, updated);
    return updated;
  }

  async complete(jobId: string): Promise<void> {
    this.update(jobId, { status: "completed", errorMessage: undefined });
  }

  async fail(jobId: string, error: Error): Promise<void> {
    this.update(jobId, { status: "failed", errorMessage: error.message });
  }

  async list(): Promise<ReviewJob[]> {
    return [...this.jobs.values()];
  }

  private update(jobId: string, patch: Partial<ReviewJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Review job not found: ${jobId}`);
    this.jobs.set(jobId, { ...job, ...patch, updatedAt: new Date() });
  }
}
