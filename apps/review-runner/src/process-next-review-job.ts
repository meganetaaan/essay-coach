import type { ReviewRunnerRoot } from "./composition-root";

export async function processNextReviewJob(root: ReviewRunnerRoot): Promise<void> {
  await root.processReviewJob();
}
