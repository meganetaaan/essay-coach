import { createCompositionRoot } from "@essay-coach/backend";

export type ReviewRunnerMode = "fake" | "hermes";

export interface ReviewRunnerEnv {
  reviewer: ReviewRunnerMode;
  intervalMs: number;
}

export interface ReviewRunnerRoot {
  processReviewJob(): Promise<unknown>;
}

export function readReviewRunnerEnv(env: NodeJS.ProcessEnv = process.env): ReviewRunnerEnv {
  return {
    reviewer: env.REVIEWER === "hermes" ? "hermes" : "fake",
    intervalMs: Number(env.REVIEW_RUNNER_INTERVAL_MS ?? 2000)
  };
}

export function createReviewRunnerCompositionRoot(env: ReviewRunnerEnv): ReviewRunnerRoot {
  return createCompositionRoot({ reviewer: env.reviewer });
}
