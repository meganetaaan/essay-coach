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

- `GET /agent/capabilities`: returns workflow steps, endpoint scopes, review guidance, output shape, and safety rules.
- `POST /agent/review-jobs/claim`: claims at most one queued job, or an expired claim, and returns essay context, rubric guidance, prior attempts, submit contract, and next actions.
- `POST /agent/review-jobs/:reviewJobId/validate-review`: validates score totals, rubric maximums, and required review fields.
- `POST /agent/review-jobs/:reviewJobId/submit`: persists a valid review for the claiming agent. Repeating the same payload is idempotent; a different payload after completion returns `409`.
- `POST /agent/review-jobs/:reviewJobId/fail`: records sanitized failure metadata and marks the submission failed.

## Safety Notes

Submit only jobs claimed by the same agent token. Claims expire so another agent can reclaim stalled work. Failure metadata must avoid provider names, model names, raw payloads, and secrets. Webhook delivery and MCP tooling are future extensions, not part of this API slice.
