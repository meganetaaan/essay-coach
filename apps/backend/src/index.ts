export * from "./app/composition-root";
export * from "./app/create-app";
export * from "./application/use-cases/create-essay-day";
export * from "./application/use-cases/get-essay-detail";
export * from "./application/use-cases/get-monthly-calendar";
export * from "./application/use-cases/process-review-job";
export * from "./application/use-cases/upload-essay-submission";
export * from "./domain/essay/topics";
export * from "./domain/review/review";
export * from "./application/ports/agent-audit-log";
export * from "./application/ports/agent-auth";
export * from "./application/ports/agent-review-job-store";
export * from "./infrastructure/agent/in-memory-agent-audit-log";
export * from "./infrastructure/agent/in-memory-agent-review-job-store";
export * from "./infrastructure/agent/in-memory-agent-token-registry";
export * from "./interfaces/http/agent-api";

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  const { app } = await import("./app/composition-root").then((module) => module.createCompositionRoot());
  console.log("Essay Coach backend composition root is ready.", Object.keys(app));
}
