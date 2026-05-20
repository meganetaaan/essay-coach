import type { AgentApiRoot } from "./interfaces/http/agent-api";
import {
  handleAgentClaimReviewJob,
  handleAgentFailReviewJob,
  handleAgentGetCapabilities,
  handleAgentSubmitReviewJob,
  handleAgentValidateReview,
  requireAgent
} from "./interfaces/http/agent-api";
import type { AgentScope } from "./application/ports/agent-auth";
import type { AgentAuditOperation } from "./application/ports/agent-audit-log";
import type { HttpResponse } from "./interfaces/http/http-contracts";
import { InMemoryAgentAuditLog } from "./infrastructure/agent/in-memory-agent-audit-log";
import { CloudflareD1AgentReviewJobStore } from "./infrastructure/agent/cloudflare-d1-agent-review-job-store";
import { InMemoryAgentReviewJobStore } from "./infrastructure/agent/in-memory-agent-review-job-store";
import {
  InMemoryAgentTokenRegistry,
  parseAgentTokenRecordsFromJson,
  type InMemoryAgentTokenRecord
} from "./infrastructure/agent/in-memory-agent-token-registry";
import { CloudflareD1EssayRepository } from "./infrastructure/persistence/cloudflare-d1-essay-repository";
import { CloudflareD1ReviewRepository } from "./infrastructure/persistence/cloudflare-d1-review-repository";
import type { D1DatabaseLike } from "./infrastructure/persistence/cloudflare-d1-types";
import { InMemoryEssayRepository } from "./infrastructure/persistence/in-memory-essay-repository";
import { InMemoryReviewRepository } from "./infrastructure/persistence/in-memory-review-repository";
import { InMemoryReviewJobQueue } from "./infrastructure/queue/in-memory-review-job-queue";
import { CloudflareD1ReviewJobQueue } from "./infrastructure/queue/cloudflare-d1-review-job-queue";
import { CloudflareR2ObjectStorage, type R2BucketLike } from "./infrastructure/storage/cloudflare-r2-object-storage";
import type { ObjectStorage } from "./application/ports/object-storage";
import type { EssayReviewer } from "./application/ports/essay-reviewer";

export interface WorkerEnv {
  ESSAY_COACH_DB?: D1DatabaseLike;
  ESSAY_COACH_IMAGES?: R2BucketLike;
  ESSAY_COACH_IMAGES_PUBLIC_BASE_URL?: string;
  ESSAY_COACH_AGENT_TOKENS_JSON?: string;
  ESSAY_COACH_CORS_ORIGIN?: string;
}

export interface WorkerRequestOptions {
  createRoot?: (agentTokens: InMemoryAgentTokenRecord[], env: WorkerEnv) => AgentApiRoot | Promise<AgentApiRoot>;
}

const agentReviewJobRoute = /^\/agent\/review-jobs\/([^/]+)\/(validate-review|submit|fail)$/;
const reviewActionAuth: Record<string, { scope: AgentScope; operation: AgentAuditOperation }> = {
  "validate-review": { scope: "review:validate", operation: "validate" },
  submit: { scope: "review:submit", operation: "submit" },
  fail: { scope: "review:fail", operation: "fail" }
};

let cachedDefaultRoot: AgentApiRoot | undefined;
let cachedDefaultTokenConfig: string | undefined;
let cachedDefaultD1Binding: D1DatabaseLike | undefined;
let cachedDefaultR2Binding: R2BucketLike | undefined;
let cachedDefaultR2PublicBaseUrl: string | undefined;

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleWorkerRequest(request, env);
  }
};

export async function handleWorkerRequest(request: Request, env: WorkerEnv = {}, options: WorkerRequestOptions = {}): Promise<Response> {
  const url = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);

  if (request.method === "OPTIONS") return emptyResponse(204, corsHeaders);
  if (request.method === "GET" && url.pathname === "/health") return jsonResponse({ status: "ok" }, 200, corsHeaders);

  try {
    if (request.method === "GET" && url.pathname === "/agent/capabilities") {
      return mapHandlerResponse(await handleAgentGetCapabilities(await resolveRoot(env, options, { allowEmptyTokens: true })), corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/agent/review-jobs/claim") {
      const root = await resolveRoot(env, options);
      return mapHandlerResponse(await handleAgentClaimReviewJob(requestHeaders(request), root), corsHeaders);
    }

    const reviewJobMatch = agentReviewJobRoute.exec(url.pathname);
    if (request.method === "POST" && reviewJobMatch) {
      const [, reviewJobId, action] = reviewJobMatch;
      const root = await resolveRoot(env, options);
      const auth = reviewActionAuth[action];
      const authorization = await requireAgent(requestHeaders(request), root, auth.scope, auth.operation, reviewJobId);
      if ("status" in authorization) return mapHandlerResponse(authorization, corsHeaders);

      const payload = await parseJsonBody(request);
      if ("status" in payload) return mapHandlerResponse(payload, corsHeaders);

      if (action === "validate-review") {
        return mapHandlerResponse(await handleAgentValidateReview(reviewJobId, payload.body, requestHeaders(request), root), corsHeaders);
      }
      if (action === "submit") {
        return mapHandlerResponse(await handleAgentSubmitReviewJob(reviewJobId, payload.body, requestHeaders(request), root), corsHeaders);
      }
      return mapHandlerResponse(await handleAgentFailReviewJob(reviewJobId, payload.body, requestHeaders(request), root), corsHeaders);
    }

    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  } catch (error) {
    if (error instanceof WorkerConfigurationError) {
      return jsonResponse({ error: "agent_token_registry_unconfigured" }, 503, corsHeaders);
    }
    if (error instanceof WorkerBindingConfigurationError) {
      return jsonResponse({ error: "worker_bindings_unconfigured", message: error.message }, 503, corsHeaders);
    }
    return jsonResponse({ error: "agent_runtime_unavailable" }, 503, corsHeaders);
  }
}

async function resolveRoot(
  env: WorkerEnv,
  options: WorkerRequestOptions,
  settings: { allowEmptyTokens?: boolean } = {}
): Promise<AgentApiRoot> {
  const tokenRecords = parseConfiguredAgentTokens(env, settings);
  if (options.createRoot) return options.createRoot(tokenRecords, env);

  if (settings.allowEmptyTokens && tokenRecords.length === 0 && (!env.ESSAY_COACH_DB || !env.ESSAY_COACH_IMAGES)) {
    return createInMemoryWorkerRoot(tokenRecords);
  }

  const tokenConfig = env.ESSAY_COACH_AGENT_TOKENS_JSON ?? "";
  if (
    cachedDefaultRoot &&
    cachedDefaultTokenConfig === tokenConfig &&
    cachedDefaultD1Binding === env.ESSAY_COACH_DB &&
    cachedDefaultR2Binding === env.ESSAY_COACH_IMAGES &&
    cachedDefaultR2PublicBaseUrl === env.ESSAY_COACH_IMAGES_PUBLIC_BASE_URL
  ) {
    return cachedDefaultRoot;
  }

  cachedDefaultRoot = createCloudflareWorkerRoot(env, tokenRecords);
  cachedDefaultTokenConfig = tokenConfig;
  cachedDefaultD1Binding = env.ESSAY_COACH_DB;
  cachedDefaultR2Binding = env.ESSAY_COACH_IMAGES;
  cachedDefaultR2PublicBaseUrl = env.ESSAY_COACH_IMAGES_PUBLIC_BASE_URL;
  return cachedDefaultRoot;
}

function parseConfiguredAgentTokens(env: WorkerEnv, settings: { allowEmptyTokens?: boolean }): InMemoryAgentTokenRecord[] {
  try {
    const records = parseAgentTokenRecordsFromJson(env.ESSAY_COACH_AGENT_TOKENS_JSON);
    if (!settings.allowEmptyTokens && records.length === 0) throw new Error("Agent token registry is empty.");
    return records;
  } catch {
    throw new WorkerConfigurationError();
  }
}

function createInMemoryWorkerRoot(agentTokens: InMemoryAgentTokenRecord[]): AgentApiRoot {
  const storage: ObjectStorage = {
    async putObject(input) {
      return { objectKey: input.key };
    },
    async getReadableUrlOrPath(objectKey) {
      return objectKey;
    }
  };
  const reviewer: EssayReviewer = {
    async reviewEssayImage() {
      throw new Error("Worker polling API does not run local review generation.");
    }
  };
  const deps = {
    essays: new InMemoryEssayRepository(),
    reviews: new InMemoryReviewRepository(),
    queue: new InMemoryReviewJobQueue(),
    storage,
    reviewer
  };
  return {
    deps,
    agentAuth: new InMemoryAgentTokenRegistry(agentTokens),
    agentReviewJobs: new InMemoryAgentReviewJobStore(),
    agentAuditLog: new InMemoryAgentAuditLog()
  };
}

export function createCloudflareWorkerRoot(env: WorkerEnv, agentTokens?: InMemoryAgentTokenRecord[]): AgentApiRoot {
  if (!env.ESSAY_COACH_DB) throw new WorkerBindingConfigurationError("Missing required D1 binding: ESSAY_COACH_DB.");
  if (!env.ESSAY_COACH_IMAGES) throw new WorkerBindingConfigurationError("Missing required R2 binding: ESSAY_COACH_IMAGES.");

  const storage = new CloudflareR2ObjectStorage({
    bucket: env.ESSAY_COACH_IMAGES,
    publicBaseUrl: env.ESSAY_COACH_IMAGES_PUBLIC_BASE_URL
  });
  const reviewer: EssayReviewer = {
    async reviewEssayImage() {
      throw new Error("Worker runtime does not run local review generation.");
    }
  };
  const deps = {
    essays: new CloudflareD1EssayRepository(env.ESSAY_COACH_DB),
    reviews: new CloudflareD1ReviewRepository(env.ESSAY_COACH_DB),
    queue: new CloudflareD1ReviewJobQueue(env.ESSAY_COACH_DB),
    storage,
    reviewer
  };
  return {
    deps,
    agentAuth: new InMemoryAgentTokenRegistry(agentTokens ?? parseAgentTokenRecordsFromJson(env.ESSAY_COACH_AGENT_TOKENS_JSON)),
    agentReviewJobs: new CloudflareD1AgentReviewJobStore(env.ESSAY_COACH_DB),
    agentAuditLog: new InMemoryAgentAuditLog()
  };
}

async function parseJsonBody(request: Request): Promise<{ body: Record<string, unknown> } | HttpResponse<{ error: string }>> {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: 400, body: { error: "invalid_json_body" } };
    return { body: parsed as Record<string, unknown> };
  } catch {
    return { status: 400, body: { error: "malformed_json" } };
  }
}

function requestHeaders(request: Request) {
  return {
    authorization: request.headers.get("authorization") ?? undefined
  };
}

function mapHandlerResponse(response: HttpResponse<unknown>, corsHeaders: HeadersInit): Response {
  return jsonResponse(response.body, response.status, corsHeaders);
}

function jsonResponse(body: unknown, status: number, corsHeaders: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function emptyResponse(status: number, corsHeaders: HeadersInit): Response {
  return new Response(null, { status, headers: corsHeaders });
}

function buildCorsHeaders(env: WorkerEnv): Record<string, string> {
  return {
    "access-control-allow-origin": env.ESSAY_COACH_CORS_ORIGIN || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400"
  };
}

class WorkerConfigurationError extends Error {}
class WorkerBindingConfigurationError extends Error {}
