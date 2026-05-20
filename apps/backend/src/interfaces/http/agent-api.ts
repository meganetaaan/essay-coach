import { createHash } from "node:crypto";
import type { AppDependencies } from "../../app/create-app";
import type { AgentAuditLog, AgentAuditOperation, AgentAuditStatus } from "../../application/ports/agent-audit-log";
import type { AgentScope, AgentTokenRegistry, AuthenticatedAgent } from "../../application/ports/agent-auth";
import type { AgentReviewJobRecord, AgentReviewJobStore } from "../../application/ports/agent-review-job-store";
import type { ReviewJob } from "../../application/ports/review-job-queue";
import type { EssaySubmission } from "../../domain/essay/essay-submission";
import {
  getRubric,
  getRubricGuidance,
  scoreTotal,
  type Review,
  type ReviewScoreBreakdown
} from "../../domain/review/review";
import { createId } from "../../shared/ids";
import type { HttpResponse } from "./http-contracts";

export interface AgentApiRoot {
  deps: AppDependencies;
  agentAuth: AgentTokenRegistry;
  agentReviewJobs: AgentReviewJobStore;
  agentAuditLog: AgentAuditLog;
  now?: Date;
}

export interface AgentRequestHeaders {
  authorization?: unknown;
}

export interface AgentCapabilitiesManifest {
  service: string;
  version: string;
  role: string;
  workflow: {
    steps: string[];
    instructions: string[];
  };
  endpoints: Array<{
    method: "GET" | "POST";
    path: string;
    description: string;
    requiredScopes: AgentScope[];
  }>;
  reviewInstructions: string[];
  mustNot: string[];
  outputShape: Record<string, string>;
  futureExtensions: string[];
}

export interface AgentReviewPayload {
  ocrText?: unknown;
  totalScore?: unknown;
  scores?: unknown;
  topicComment?: unknown;
  strengths?: unknown;
  improvementPoints?: unknown;
  rewriteAdvice?: unknown;
  childFriendlyComment?: unknown;
  parentSummary?: unknown;
  rawOutput?: unknown;
}

const scoreDimensions: Array<keyof ReviewScoreBreakdown> = [
  "topicRelation",
  "taskUnderstanding",
  "structure",
  "specificity",
  "expression",
  "grammarAndNotation",
  "readerAwareness"
];

export async function handleAgentGetCapabilities(root: AgentApiRoot): Promise<HttpResponse<AgentCapabilitiesManifest>> {
  await recordAgentAudit(root, { operation: "capabilities", status: "success" });
  return { status: 200, body: capabilitiesManifest };
}

export async function handleAgentClaimReviewJob(
  headers: AgentRequestHeaders,
  root: AgentApiRoot
): Promise<HttpResponse<{ job: unknown } | AgentAuthError | { job: null; nextActions: string[] }>> {
  const auth = await requireAgent(headers, root, "review:claim", "claim");
  if ("status" in auth) return auth;

  const candidate = await findClaimableJob(root);
  if (!candidate) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "claim", status: "success" });
    return { status: 200, body: { job: null, nextActions: ["poll_later"] } };
  }

  let job = candidate;
  if (candidate.status === "queued") {
    const picked = await root.deps.queue.pickNext();
    if (!picked) {
      await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "claim", status: "success" });
      return { status: 200, body: { job: null, nextActions: ["poll_later"] } };
    }
    job = picked;
  }

  const submission = await root.deps.essays.findSubmissionById(job.submissionId);
  if (submission) await root.deps.essays.updateSubmission({ ...submission, reviewStatus: "processing" });

  const claim = await root.agentReviewJobs.recordClaim({
    reviewJobId: job.id,
    submissionId: job.submissionId,
    agentId: auth.agent.agentId
  });
  const response = await buildClaimResponse(claim, root);
  await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "claim", reviewJobId: claim.reviewJobId, status: "success" });
  return { status: 200, body: { job: response } };
}

export async function handleAgentValidateReview(
  reviewJobId: string,
  payload: AgentReviewPayload,
  headers: AgentRequestHeaders,
  root: AgentApiRoot
): Promise<HttpResponse<{ valid: boolean; errors: ValidationError[]; nextActions: string[] } | AgentAuthError>> {
  const auth = await requireAgent(headers, root, "review:validate", "validate", reviewJobId);
  if ("status" in auth) return auth;

  const ownership = await requireClaimOwner(reviewJobId, auth.agent, root);
  if ("status" in ownership) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "validate", reviewJobId, status: auditStatusFromHttp(ownership.status) });
    return ownership;
  }

  const context = await getReviewContext(ownership.record, root);
  if (isHttpResponse(context)) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "validate", reviewJobId, status: auditStatusFromHttp(context.status) });
    return context;
  }
  const errors = validateReviewPayload(payload, context.submission.strictness, context.essayDay.childGrade);
  await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "validate", reviewJobId, status: errors.length === 0 ? "success" : "invalid" });

  return {
    status: errors.length === 0 ? 200 : 422,
    body: {
      valid: errors.length === 0,
      errors,
      nextActions: errors.length === 0 ? ["submit_review"] : ["revise_review", "validate_review"]
    }
  };
}

export async function handleAgentSubmitReviewJob(
  reviewJobId: string,
  payload: AgentReviewPayload,
  headers: AgentRequestHeaders,
  root: AgentApiRoot
): Promise<HttpResponse<{ submitted: boolean; idempotent: boolean } | AgentAuthError | { error: string; errors?: ValidationError[] }>> {
  const auth = await requireAgent(headers, root, "review:submit", "submit", reviewJobId);
  if ("status" in auth) return auth;

  const ownership = await requireClaimOwner(reviewJobId, auth.agent, root, { allowCompleted: true });
  if ("status" in ownership) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: auditStatusFromHttp(ownership.status) });
    return ownership;
  }

  const payloadHash = hashPayload(payload);
  if (ownership.record.state === "completed") {
    if (ownership.record.submittedPayloadHash === payloadHash) {
      await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: "success" });
      return { status: 200, body: { submitted: true, idempotent: true } };
    }
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: "conflict" });
    return { status: 409, body: { error: "review_job_already_completed_with_different_payload" } };
  }

  const context = await getReviewContext(ownership.record, root);
  if (isHttpResponse(context)) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: auditStatusFromHttp(context.status) });
    return context;
  }
  const errors = validateReviewPayload(payload, context.submission.strictness, context.essayDay.childGrade);
  if (errors.length > 0) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: "invalid" });
    return { status: 422, body: { error: "invalid_review", errors } };
  }

  const normalized = normalizeReviewPayload(payload);
  const review: Review = {
    id: createId("review"),
    submissionId: context.submission.id,
    strictness: context.submission.strictness,
    ocrText: normalized.ocrText,
    totalScore: normalized.totalScore,
    scores: normalized.scores,
    topicComment: normalized.topicComment,
    strengths: normalized.strengths,
    improvementPoints: normalized.improvementPoints,
    rewriteAdvice: normalized.rewriteAdvice,
    childFriendlyComment: normalized.childFriendlyComment,
    parentSummary: normalized.parentSummary,
    rawOutput: normalized.rawOutput,
    createdAt: currentDate(root)
  };

  await root.deps.reviews.save(review);
  await root.deps.essays.updateSubmission({ ...context.submission, ocrText: review.ocrText, reviewStatus: "completed" });
  await root.deps.queue.complete(reviewJobId);
  await root.agentReviewJobs.markCompleted({ reviewJobId, submittedPayloadHash: payloadHash });
  await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "submit", reviewJobId, status: "success" });
  return { status: 200, body: { submitted: true, idempotent: false } };
}

export async function handleAgentFailReviewJob(
  reviewJobId: string,
  payload: { reason?: unknown; message?: unknown },
  headers: AgentRequestHeaders,
  root: AgentApiRoot
): Promise<HttpResponse<{ failed: boolean; failure: { reason: string; message: string; recordedAt: string } } | AgentAuthError>> {
  const auth = await requireAgent(headers, root, "review:fail", "fail", reviewJobId);
  if ("status" in auth) return auth;

  const ownership = await requireClaimOwner(reviewJobId, auth.agent, root);
  if ("status" in ownership) {
    await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "fail", reviewJobId, status: auditStatusFromHttp(ownership.status) });
    return ownership;
  }

  const submission = await root.deps.essays.findSubmissionById(ownership.record.submissionId);
  const failure = {
    reason: sanitizeReason(payload.reason),
    message: sanitizeFailureMessage(payload.message),
    recordedAt: currentDate(root)
  };

  await root.agentReviewJobs.markFailed({ reviewJobId, failure });
  await root.deps.queue.fail(reviewJobId, new Error(failure.message));
  if (submission) await root.deps.essays.updateSubmission({ ...submission, reviewStatus: "failed" });
  await recordAgentAudit(root, { agentId: auth.agent.agentId, operation: "fail", reviewJobId, status: "success" });

  return {
    status: 200,
    body: {
      failed: true,
      failure: { ...failure, recordedAt: failure.recordedAt.toISOString() }
    }
  };
}

interface AgentAuthError {
  error: string;
  requiredScopes?: AgentScope[];
}

interface ValidationError {
  path: string;
  message: string;
}

const capabilitiesManifest: AgentCapabilitiesManifest = {
  service: "essay-coach",
  version: "0.1.0",
  role: "polling essay review agent",
  workflow: {
    steps: ["claim", "generate", "validate", "submit", "fail"],
    instructions: [
      "Claim at most one job before generating a review.",
      "Generate a review using the supplied essay context and rubric.",
      "validate the payload before submit.",
      "Submit only the job claimed by this agent, or report a sanitized failure."
    ]
  },
  endpoints: [
    { method: "GET", path: "/agent/capabilities", description: "Read agent workflow guidance.", requiredScopes: [] },
    { method: "POST", path: "/agent/review-jobs/claim", description: "Claim one queued or expired review job.", requiredScopes: ["review:claim"] },
    {
      method: "POST",
      path: "/agent/review-jobs/:reviewJobId/validate-review",
      description: "Validate review payload shape and rubric scores.",
      requiredScopes: ["review:validate"]
    },
    {
      method: "POST",
      path: "/agent/review-jobs/:reviewJobId/submit",
      description: "Persist a valid review for the agent-owned job.",
      requiredScopes: ["review:submit"]
    },
    {
      method: "POST",
      path: "/agent/review-jobs/:reviewJobId/fail",
      description: "Record sanitized failure metadata.",
      requiredScopes: ["review:fail"]
    }
  ],
  reviewInstructions: [
    "OCR the essay if ocrText is absent or incomplete.",
    "Score every rubric dimension within its maximum.",
    "Make comments concrete and useful for an elementary school child and parent."
  ],
  mustNot: ["Do not submit an unclaimed job.", "Do not include secrets, provider names, or model names in failure metadata."],
  outputShape: {
    ocrText: "string",
    totalScore: "number equal to the sum of scores",
    scores: "rubric dimension score object",
    comments: "topicComment, strengths, improvementPoints, rewriteAdvice, childFriendlyComment, parentSummary"
  },
  futureExtensions: ["webhook delivery can be added later", "MCP tooling can be added later"]
};

async function requireAgent(
  headers: AgentRequestHeaders,
  root: AgentApiRoot,
  requiredScope: AgentScope,
  operation: AgentAuditOperation,
  reviewJobId?: string
): Promise<{ agent: AuthenticatedAgent } | HttpResponse<AgentAuthError>> {
  const token = parseBearerToken(headers.authorization);
  if (!token) {
    await recordAgentAudit(root, { operation, reviewJobId, status: "unauthorized", requiredScopes: [requiredScope] });
    return { status: 401, body: { error: "missing_or_invalid_token" } };
  }

  const agent = await root.agentAuth.verifyToken(token);
  if (!agent) {
    await recordAgentAudit(root, { operation, reviewJobId, status: "unauthorized", requiredScopes: [requiredScope] });
    return { status: 401, body: { error: "missing_or_invalid_token" } };
  }
  if (!agent.scopes.includes(requiredScope)) {
    await recordAgentAudit(root, {
      agentId: agent.agentId,
      operation,
      reviewJobId,
      status: "forbidden",
      requiredScopes: [requiredScope]
    });
    return { status: 403, body: { error: "insufficient_scope", requiredScopes: [requiredScope] } };
  }
  return { agent };
}

function parseBearerToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^Bearer (.+)$/.exec(value);
  return match?.[1];
}

async function recordAgentAudit(
  root: AgentApiRoot,
  input: {
    agentId?: string;
    operation: AgentAuditOperation;
    reviewJobId?: string;
    status: AgentAuditStatus;
    requiredScopes?: AgentScope[];
  }
): Promise<void> {
  await root.agentAuditLog.record({
    ...input,
    timestamp: currentDate(root)
  });
}

function auditStatusFromHttp(status: number): AgentAuditStatus {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "invalid";
  if (status >= 500) return "error";
  return "success";
}

async function findClaimableJob(root: AgentApiRoot): Promise<ReviewJob | undefined> {
  const jobs = await root.deps.queue.list();
  const queued = jobs.find((job) => job.status === "queued");
  if (queued) return queued;

  for (const job of jobs) {
    if (job.status !== "processing") continue;
    const record = await root.agentReviewJobs.get(job.id);
    if (record && root.agentReviewJobs.isClaimExpired(record)) return job;
  }
  return undefined;
}

async function requireClaimOwner(
  reviewJobId: string,
  agent: AuthenticatedAgent,
  root: AgentApiRoot,
  options: { allowCompleted?: boolean } = {}
): Promise<{ record: AgentReviewJobRecord } | HttpResponse<AgentAuthError>> {
  const record = await root.agentReviewJobs.get(reviewJobId);
  if (!record) return { status: 404, body: { error: "review_job_not_found" } };
  if (record.claimedByAgentId !== agent.agentId) return { status: 403, body: { error: "wrong_claim_owner" } };
  if (record.state === "failed") return { status: 409, body: { error: "review_job_failed" } };
  if (record.state === "completed" && !options.allowCompleted) return { status: 409, body: { error: "review_job_completed" } };
  if (record.state !== "completed" && root.agentReviewJobs.isClaimExpired(record)) return { status: 409, body: { error: "claim_expired" } };
  return { record };
}

async function buildClaimResponse(claim: AgentReviewJobRecord, root: AgentApiRoot) {
  const context = await getReviewContext(claim, root);
  if (isHttpResponse(context)) throw new Error(context.body.error);
  const sameDaySubmissions = await root.deps.essays.listSubmissionsByEssayDay(context.essayDay.id);
  const priorSubmissions = sameDaySubmissions.filter((submission) => submission.attemptNumber < context.submission.attemptNumber);
  const priorReviews = (await Promise.all(priorSubmissions.map((submission) => root.deps.reviews.findBySubmissionId(submission.id)))).filter(
    (review): review is Review => Boolean(review)
  );

  return {
    reviewJobId: claim.reviewJobId,
    submissionId: context.submission.id,
    claimedByAgentId: claim.claimedByAgentId,
    claimedAt: claim.claimedAt.toISOString(),
    claimExpiresAt: claim.claimExpiresAt.toISOString(),
    strictness: context.submission.strictness,
    topic: context.essayDay.topic,
    ocrText: context.submission.ocrText,
    attemptNumber: claim.attemptCount,
    submissionAttemptNumber: context.submission.attemptNumber,
    priorSubmissions,
    priorReviews,
    rubric: getRubric(context.submission.strictness, context.essayDay.childGrade),
    rubricGuidance: getRubricGuidance({ strictness: context.submission.strictness, childGrade: context.essayDay.childGrade }),
    workflowInstructions: capabilitiesManifest.workflow.instructions,
    submitContract: {
      endpoint: `/agent/review-jobs/${claim.reviewJobId}/submit`,
      idempotency: "Identical payload resubmission returns 200 without creating another review.",
      conflict: "A different payload after completion returns 409."
    },
    nextActions: ["generate_review", "validate_review", "submit_review_or_fail"]
  };
}

interface ReviewContext {
  submission: EssaySubmission;
  essayDay: Awaited<ReturnType<AppDependencies["essays"]["findEssayDayById"]>> & {};
}

async function getReviewContext(record: AgentReviewJobRecord, root: AgentApiRoot): Promise<ReviewContext | HttpResponse<{ error: string }>> {
  const submission = await root.deps.essays.findSubmissionById(record.submissionId);
  if (!submission) return { status: 404, body: { error: "submission_not_found" } };
  const essayDay = await root.deps.essays.findEssayDayById(submission.essayDayId);
  if (!essayDay) return { status: 404, body: { error: "essay_day_not_found" } };
  return { submission, essayDay };
}

function isHttpResponse<T>(value: T | HttpResponse<{ error: string }>): value is HttpResponse<{ error: string }> {
  return typeof (value as HttpResponse<{ error: string }>).status === "number";
}

function validateReviewPayload(payload: AgentReviewPayload, strictness: EssaySubmission["strictness"], childGrade: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringFields: Array<keyof AgentReviewPayload> = [
    "ocrText",
    "topicComment",
    "childFriendlyComment",
    "parentSummary"
  ];
  for (const field of stringFields) {
    if (typeof payload[field] !== "string" || payload[field] === "") errors.push({ path: field, message: "must be a non-empty string" });
  }

  for (const field of ["strengths", "improvementPoints", "rewriteAdvice"] as const) {
    if (!Array.isArray(payload[field]) || !payload[field].every((value) => typeof value === "string" && value.length > 0)) {
      errors.push({ path: field, message: "must be an array of non-empty strings" });
    }
  }

  if (!isScoreBreakdown(payload.scores)) {
    errors.push({ path: "scores", message: "must include every rubric score dimension" });
  } else {
    const rubric = getRubric(strictness, childGrade);
    for (const dimension of scoreDimensions) {
      const score = payload.scores[dimension];
      if (!Number.isFinite(score) || score < 0 || score > rubric[dimension]) {
        errors.push({ path: `scores.${dimension}`, message: `must be between 0 and max ${rubric[dimension]}` });
      }
    }
    const computedTotal = scoreTotal(payload.scores);
    if (payload.totalScore !== computedTotal) {
      errors.push({ path: "totalScore", message: `expected ${computedTotal}, got ${String(payload.totalScore)}` });
    }
  }

  return errors;
}

function normalizeReviewPayload(payload: AgentReviewPayload): Omit<Review, "id" | "submissionId" | "strictness" | "createdAt"> {
  if (!isScoreBreakdown(payload.scores)) throw new Error("scores were not validated");
  return {
    ocrText: String(payload.ocrText),
    totalScore: Number(payload.totalScore),
    scores: payload.scores,
    topicComment: String(payload.topicComment),
    strengths: payload.strengths as string[],
    improvementPoints: payload.improvementPoints as string[],
    rewriteAdvice: payload.rewriteAdvice as string[],
    childFriendlyComment: String(payload.childFriendlyComment),
    parentSummary: String(payload.parentSummary),
    rawOutput: payload.rawOutput
  };
}

function isScoreBreakdown(value: unknown): value is ReviewScoreBreakdown {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return scoreDimensions.every((dimension) => typeof candidate[dimension] === "number");
}

function hashPayload(payload: AgentReviewPayload): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeReason(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "agent_error";
  return value.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
}

function sanitizeFailureMessage(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "[redacted]";
  return "[redacted]";
}

function currentDate(root: AgentApiRoot): Date {
  return root.now ? new Date(root.now.getTime()) : new Date();
}
