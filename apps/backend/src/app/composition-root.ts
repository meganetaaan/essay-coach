import { createApp } from "./create-app";
import { processReviewJob } from "../application/use-cases/process-review-job";
import { FakeEssayReviewer } from "../infrastructure/ai/fake/fake-essay-reviewer";
import { CliHermesCommandRunner } from "../infrastructure/ai/hermes/hermes-command-runner";
import { HermesEssayReviewer } from "../infrastructure/ai/hermes/hermes-essay-reviewer";
import { InMemoryReviewJobQueue } from "../infrastructure/queue/in-memory-review-job-queue";
import { InMemoryEssayRepository } from "../infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "../infrastructure/persistence/in-memory-review-repository";
import { LocalObjectStorage } from "../infrastructure/storage/local-object-storage";

export function createCompositionRoot(options: { reviewer?: "fake" | "hermes" } = {}) {
  const essays = new InMemoryEssayRepository();
  const reviews = new InMemoryReviewRepository();
  const queue = new InMemoryReviewJobQueue();
  const storage = new LocalObjectStorage();
  const reviewer = options.reviewer === "hermes" ? new HermesEssayReviewer(new CliHermesCommandRunner()) : new FakeEssayReviewer();

  const deps = { essays, reviews, queue, storage, reviewer };
  return {
    deps,
    app: createApp(deps),
    processReviewJob: () => processReviewJob(deps)
  };
}
