import type { ReviewRunnerEnv, ReviewRunnerRoot } from "./composition-root";
import { processNextReviewJob } from "./process-next-review-job";

export function startWorkerLoop(root: ReviewRunnerRoot, env: ReviewRunnerEnv): NodeJS.Timeout {
  console.log(`Review runner started with ${env.reviewer} reviewer.`);

  async function tick(): Promise<void> {
    try {
      await processNextReviewJob(root);
    } catch (error) {
      console.error("Review job failed", error);
    }
  }

  const timer = setInterval(tick, env.intervalMs);
  void tick();
  return timer;
}
