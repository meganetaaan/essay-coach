import { createApp } from "./create-app";
import { processReviewJob } from "../application/use-cases/process-review-job";
import { FakeEssayReviewer } from "../infrastructure/ai/fake/fake-essay-reviewer";
import { CliHermesCommandRunner } from "../infrastructure/ai/hermes/hermes-command-runner";
import { HermesEssayReviewer } from "../infrastructure/ai/hermes/hermes-essay-reviewer";
import { InMemoryReviewJobQueue } from "../infrastructure/queue/in-memory-review-job-queue";
import type { ObjectStorage } from "../application/ports/object-storage";
import { initializeSqliteDatabase, resolveSqlitePath, upsertDemoChild } from "../infrastructure/persistence/sqlite-database";
import { SqliteEssayRepository } from "../infrastructure/persistence/sqlite-essay-repository";
import { SqliteReviewRepository } from "../infrastructure/persistence/sqlite-review-repository";
import { LocalObjectStorage } from "../infrastructure/storage/local-object-storage";

export type ReviewerMode = "fake" | "hermes";

export function resolveReviewerMode(value?: string, variableName = "ESSAY_COACH_REVIEWER"): ReviewerMode {
  if (value === undefined || value === "") return "hermes";
  if (value === "fake" || value === "hermes") return value;

  throw new Error(`${variableName} must be either "fake" or "hermes"; received "${value}".`);
}

export function createCompositionRoot(options: { reviewer?: ReviewerMode; sqlitePath?: string; storage?: ObjectStorage } = {}) {
  const sqlitePath = resolveSqlitePath(options.sqlitePath);
  initializeSqliteDatabase(sqlitePath);
  upsertDemoChild(sqlitePath);
  const essays = new SqliteEssayRepository(sqlitePath);
  const reviews = new SqliteReviewRepository(sqlitePath);
  const queue = new InMemoryReviewJobQueue();
  const storage = options.storage ?? new LocalObjectStorage();
  const reviewerMode = resolveReviewerMode(options.reviewer);
  const reviewer = reviewerMode === "fake" ? new FakeEssayReviewer() : new HermesEssayReviewer(new CliHermesCommandRunner());

  const deps = { essays, reviews, queue, storage, reviewer };
  return {
    deps,
    app: createApp(deps),
    processReviewJob: () => processReviewJob(deps)
  };
}
