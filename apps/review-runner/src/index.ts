import { createReviewRunnerCompositionRoot, readReviewRunnerEnv } from "./composition-root";
import { startWorkerLoop } from "./worker-loop";

const env = readReviewRunnerEnv();
const root = createReviewRunnerCompositionRoot(env);

startWorkerLoop(root, env);
