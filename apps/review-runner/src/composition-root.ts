import { createCompositionRoot, resolveReviewerMode } from "@essay-coach/backend";

export type ReviewRunnerMode = ReturnType<typeof resolveReviewerMode>;

export interface ReviewRunnerEnv {
  reviewer: ReviewRunnerMode;
  intervalMs: number;
}

export interface ReviewRunnerRoot {
  processReviewJob(): Promise<unknown>;
}

export function readReviewRunnerEnv(env: NodeJS.ProcessEnv = process.env): ReviewRunnerEnv {
  return {
    reviewer: resolveReviewerMode(env.REVIEWER, "REVIEWER"),
    intervalMs: Number(env.REVIEW_RUNNER_INTERVAL_MS ?? 2000)
  };
}

export function createReviewRunnerCompositionRoot(env: ReviewRunnerEnv): ReviewRunnerRoot {
  return createCompositionRoot({ reviewer: env.reviewer });
}
