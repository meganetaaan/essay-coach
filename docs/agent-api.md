# Agent API

Essay Coach exposes a lightweight polling API for review agents. The first slice is intentionally local to the backend: no webhook subscription, no MCP server, and no database schema change.

## Auth

Agent requests use `Authorization: Bearer <agent-token>`. The backend verifies the token through an agent auth seam and works with token hashes in the in-memory registry. Do not log tokens or persist plaintext tokens. For local preview, provide hashed records through `ESSAY_COACH_AGENT_TOKENS_JSON` where possible.

Scopes:

- `review:claim`
- `review:validate`
- `review:submit`
- `review:fail`

Missing or invalid tokens return `401`. Valid tokens without the required scope return `403`.

## Polling Loop

```ts
while (true) {
  const claim = await post("/agent/review-jobs/claim", token);
  if (!claim.job) {
    await sleep(5000);
    continue;
  }

  try {
    const review = await generateReview(claim.job);
    const validation = await post(`/agent/review-jobs/${claim.job.reviewJobId}/validate-review`, token, review);
    if (!validation.valid) {
      continue;
    }
    await post(`/agent/review-jobs/${claim.job.reviewJobId}/submit`, token, review);
  } catch (error) {
    await post(`/agent/review-jobs/${claim.job.reviewJobId}/fail`, token, {
      reason: "agent_error",
      message: "sanitized failure"
    });
  }
}
```

## Endpoints

- `GET /health`: Worker health check. Returns `{ "status": "ok" }` without constructing persistence or requiring token configuration.
- `GET /agent/capabilities`: returns workflow steps, endpoint scopes, review guidance, output shape, and safety rules.
- `POST /agent/review-jobs/claim`: claims at most one queued job, or an expired claim, and returns essay context, rubric guidance, prior attempts, submit contract, and next actions.
- `POST /agent/review-jobs/:reviewJobId/validate-review`: validates score totals, rubric maximums, and required review fields.
- `POST /agent/review-jobs/:reviewJobId/submit`: persists a valid review for the claiming agent. Repeating the same payload is idempotent; a different payload after completion returns `409`.
- `POST /agent/review-jobs/:reviewJobId/fail`: records sanitized failure metadata and marks the submission failed.

## Cloudflare Worker

The Worker entrypoint is `apps/backend/src/worker.ts`, with a dev skeleton in `apps/backend/wrangler.jsonc`. It is a thin HTTP adapter around the existing pure agent handlers: it routes requests, parses JSON bodies for review payload endpoints, maps handler results to `Response`, and applies CORS headers.

The Worker currently composes in-memory local ports by default so the HTTP foundation can be smoke-tested without importing the SQLite runtime. This is not durable Cloudflare persistence. Durable storage, webhook delivery, and authenticated MCP remain follow-up layers.

Useful commands from the repository root:

```bash
pnpm --filter @essay-coach/backend worker:dry-run
pnpm --filter @essay-coach/backend worker:deploy
```

These scripts use the backend package's `wrangler` dev dependency. The repository does not include Cloudflare account IDs, API tokens, production URLs, or real secrets.

## Worker Token Env

Protected Worker endpoints fail closed when `ESSAY_COACH_AGENT_TOKENS_JSON` is absent, empty, malformed, or contains no token records. Configure it as a JSON array of agent records. Prefer `tokenHash` records generated from out-of-band token material:

```json
[
  {
    "agentId": "local-agent",
    "tokenHash": "<sha256-hex-of-agent-token>",
    "scopes": ["review:claim", "review:validate", "review:submit", "review:fail"]
  }
]
```

`token` is still accepted by the local in-memory registry for runtime-only development, but do not store plaintext tokens in `wrangler.jsonc`, documentation, commits, logs, or shared runbooks.

`ESSAY_COACH_CORS_ORIGIN` controls `access-control-allow-origin`. When omitted, the Worker returns `*` for local browser tools and self-hosted clients. Agent preflight responses allow `authorization` and `content-type` headers.

## Safety Notes

Submit only jobs claimed by the same agent token. Claims expire so another agent can reclaim stalled work. Failure metadata must avoid provider names, model names, raw payloads, and secrets. Webhook delivery and MCP tooling are future extensions, not part of this API slice.
