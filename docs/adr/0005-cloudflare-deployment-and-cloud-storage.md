# ADR 0005: Cloudflare deployment and cloud storage path

## Status

Proposed

## Context

Essay Coach currently runs as a local-first MVP. The checked runtime uses:

- a Vite/React frontend built into `apps/frontend/dist`;
- a Node preview server in `scripts/preview-mvp.ts`;
- local SQLite at `apps/backend/.storage/essay-coach.sqlite` by default;
- local filesystem image storage under `apps/backend/.storage/essay-images`;
- Clerk for browser authentication;
- a narrow Agent API track in progress for self-hosted review agents.

The current local data set is small enough for a first migration:

- SQLite database: about 160 KB;
- rows: guardians 2, children 2, essay_days 6, essay_submissions 10, reviews 9;
- uploaded images: 16 files, about 12 MB total.

The target is a durable Cloudflare deployment on a custom subdomain, while keeping the self-hosted AI agent boundary narrow and authenticated.

## Decision

Deploy Essay Coach on Cloudflare using this default shape:

```text
https://essay-coach.meganetaaan.com      Cloudflare Pages frontend
https://essay-coach-api.meganetaaan.com  Cloudflare Worker API
Cloudflare D1                            relational app data
Cloudflare R2                            uploaded essay images
Clerk                                    human browser authentication
Agent service token                      self-hosted agent authentication
Optional local/stdio MCP wrapper          ergonomic agent tool surface
```

Use Cloudflare D1 for the first cloud database target, not managed PostgreSQL, because the current schema and operational profile are small, SQLite-shaped, and cost-sensitive. Revisit PostgreSQL/Hyperdrive only if D1 limits or query semantics become product constraints.

Use R2 for uploaded image bytes. Do not store image bytes in D1.

Keep the self-hosted review agent integration as a narrow Agent API first:

- `GET /agent/capabilities`
- `POST /agent/review-jobs/claim`
- `POST /agent/review-jobs/:id/validate-review`
- `POST /agent/review-jobs/:id/submit`
- `POST /agent/review-jobs/:id/fail`

Future webhook or MCP surfaces should wrap that same Agent API instead of introducing another review-job state machine.

## Subdomain and environment naming

Initial production-like names:

- Pages project: `essay-coach-frontend-prod`
- Worker script: `essay-coach-api-prod`
- D1 database: `essay-coach-prod`
- R2 bucket: `essay-coach-images-prod`
- Frontend custom domain: `essay-coach.meganetaaan.com`
- API custom domain: `essay-coach-api.meganetaaan.com`

If a shared dev surface is needed later, mirror the names with `-dev` and use `dev.essay-coach.meganetaaan.com` / `essay-coach-api-dev.meganetaaan.com`.

## Implementation sequence

1. Merge or retarget the Agent API PR stack so the cloud runtime has a stable review-job contract.
2. Add Worker entrypoint tests before implementation.
3. Extract the preview server composition into a runtime-neutral app/API composition that can be used by both Node preview and Workers.
4. Add D1 schema/migrations matching the current SQLite tables.
5. Add D1 repository adapters behind existing application ports.
6. Add R2 object storage adapter behind the existing `ObjectStorage` port.
7. Add `wrangler.jsonc` for Worker deploy, with D1 and R2 bindings.
8. Add Pages deploy scripts/workflow and Vite env wiring.
9. Add a one-shot migration script:
   - read local SQLite without printing student/review content;
   - export schema-compatible rows to D1;
   - upload local image files to R2 under the existing object keys;
   - verify row counts and object counts after import.
10. Add deployed smoke checks:
    - Pages root returns HTML with the expected bundle;
    - `/health` or equivalent public API probe returns 2xx;
    - unauthenticated protected endpoints fail closed;
    - a protected Clerk-backed smoke path works when a short-lived non-personal smoke session is available;
    - Agent API rejects missing/invalid service tokens.
11. Only then switch the custom domains to the Cloudflare deployment.

## Authentication boundaries

Human browser access uses Clerk. Production backend routes must verify Clerk tokens at the HTTP boundary and must not trust prototype actor headers.

Agent access uses a separate service token, not a Clerk browser user token. Store only token prefix/hash/scope/expiry/revocation metadata in app storage. Do not log raw tokens.

For this single-operator app, keep a backend allowlist in addition to Clerk sign-in, for example `ESSAY_COACH_ALLOWED_EMAILS` initially and Clerk user IDs once stable.

## Secret handling

Do not paste these values into chat or commit them:

- `CLOUDFLARE_API_TOKEN`
- Clerk secret keys
- Agent service tokens
- D1/R2 credentials if any are ever exported outside Wrangler/Cloudflare

Non-secret values such as Cloudflare account ID, zone ID, project names, database IDs, and bucket names may be stored in Terraform variables or deployment docs.

## Migration verification

The first migration is considered successful only if all of these match or are explicitly explained:

- guardian count;
- child count;
- essay day count;
- submission count;
- review count;
- image object count;
- sampled image object metadata/content type;
- review status values;
- foreign-key-like relationships from submissions to days and reviews to submissions.

Avoid printing OCR text, review content, raw model output, or image bytes in logs.

## Consequences

This keeps hosting, database, and object storage inside Cloudflare and minimizes operating cost. It does require replacing Node-only `node:sqlite` and filesystem storage adapters in the Worker runtime.

The MCP layer is intentionally a convenience wrapper over the Agent API, not the source of truth. This makes it safe to support multiple clients later: polling self-hosted agents, webhook triggerers, and MCP-capable agents all converge on the same review-job lifecycle.
