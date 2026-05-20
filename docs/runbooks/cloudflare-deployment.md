# Cloudflare deployment foundation runbook

This runbook tracks the safe path from the local Essay Coach MVP to a Cloudflare-hosted deployment.

## Current baseline

Runtime baseline checked before this runbook was written:

- default local SQLite path: `apps/backend/.storage/essay-coach.sqlite`
- default local image path: `apps/backend/.storage/essay-images`
- local DB size: about 160 KB
- local image storage: 16 files, about 12 MB
- row counts: guardians 2, children 2, essay_days 6, essay_submissions 10, reviews 9
- Cloudflare token exists locally and is active, but no Essay Coach Pages project was found yet
- GitHub repo currently has no deployment secrets, variables, or workflows configured

Do not paste secret values into issues, PRs, docs, or chat.

## Target topology

```text
User browser
  -> https://essay-coach.meganetaaan.com      Cloudflare Pages
  -> https://essay-coach-api.meganetaaan.com  Cloudflare Worker
       -> D1 database: essay-coach-prod
       -> R2 bucket: essay-coach-images-prod

Self-hosted agent / MCP wrapper
  -> Agent API on Worker using scoped service token
```

## Required local protected files

Preferred local protected env file for Cloudflare:

```bash
mkdir -p ~/.config/essay-coach
chmod 700 ~/.config/essay-coach
read -s CLOUDFLARE_API_TOKEN
printf 'export CLOUDFLARE_API_TOKEN=%q\n' "$CLOUDFLARE_API_TOKEN" > ~/.config/essay-coach/cloudflare.env
chmod 600 ~/.config/essay-coach/cloudflare.env
```

Clerk values are already expected to live in a protected env file such as `~/.env.essay-coach`. Keep the frontend publishable key and backend secret key conceptually separate even if they are sourced from the same local file.

## Non-secret Cloudflare discovery

```bash
set -a
. ~/.config/essay-coach/cloudflare.env
set +a

curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify

curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts
```

Record account ID and zone ID in deployment config, not token values.

## First implementation slices

### Slice 1: Cloudflare design + deploy skeleton

- Add ADR and runbook.
- Add Wrangler dependency and `wrangler.jsonc` only after Worker entrypoint tests exist.
- Add GitHub Actions workflow that verifies first and skips deploy with clear missing config names when secrets are absent.

### Slice 2: Worker API runtime

- Add a Worker entrypoint that can answer a cheap health check without DB access.
- Keep the Node preview path working.
- Verify Clerk auth boundary fails closed in Worker runtime.

### Slice 3: D1 and R2 adapters

- Add D1 migrations matching the current SQLite tables.
- Current foundation migration: `apps/backend/migrations/0001_initial_d1_schema.sql`.
- Current D1 repositories:
  - `apps/backend/src/infrastructure/persistence/cloudflare-d1-essay-repository.ts`
  - `apps/backend/src/infrastructure/persistence/cloudflare-d1-review-repository.ts`
- Current R2 adapter: `apps/backend/src/infrastructure/storage/cloudflare-r2-object-storage.ts`.
- Worker production composition now requires both bindings:
  - D1 binding `ESSAY_COACH_DB`
  - R2 binding `ESSAY_COACH_IMAGES`
  - optional runtime var `ESSAY_COACH_IMAGES_PUBLIC_BASE_URL` for public image URL generation
- Current safe migration summary utility: `apps/backend/src/infrastructure/migration/sqlite-migration-summary.ts`.
- Focused tests:
  `pnpm --filter @essay-coach/backend test -- cloudflare-d1-persistence.test.ts cloudflare-r2-object-storage.test.ts sqlite-migration-summary.test.ts worker.test.ts`
- Bind D1 and R2 in Worker config.
- Worker config: `apps/backend/wrangler.jsonc`.
  It uses production-like names from ADR 0005 and an all-zero D1 `database_id` placeholder.
  Replace that placeholder with Wrangler's generated database ID before applying remote migrations or deploying.

### Slice 4: one-shot migration

- Export rows from local SQLite to D1.
- Upload files from local `.storage/essay-images` to R2.
- Print counts, IDs, and object keys only when needed; do not print review text, OCR text, raw model output, or image bytes.

### Slice 5: custom domains and smoke

- Attach `essay-coach.meganetaaan.com` to Pages.
- Attach `essay-coach-api.meganetaaan.com` to Worker.
- Run public and authenticated smoke checks before considering the migration complete.

## GitHub repo settings needed

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLERK_SECRET_KEY`
- future: agent token seed/admin secret only if CI needs to provision it

Variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_ESSAY_COACH_API_BASE_URL`
- `ESSAY_COACH_ALLOWED_EMAILS` or later `ESSAY_COACH_ALLOWED_CLERK_USER_IDS`

Worker runtime vars/secrets:

- `CLERK_PUBLISHABLE_KEY` as non-secret runtime config
- `CLERK_SECRET_KEY` as secret only if the Worker needs Clerk Backend API calls
- `ESSAY_COACH_ALLOWED_EMAILS` or `ESSAY_COACH_ALLOWED_CLERK_USER_IDS`
- Agent service token seed/registry secret, if tokens are not provisioned manually

## Migration commands outline

Safe local verification commands:

```bash
pnpm --filter @essay-coach/backend test -- cloudflare-r2-object-storage.test.ts sqlite-migration-summary.test.ts
pnpm --filter @essay-coach/backend migration:summary -- \
  --sqlite .storage/essay-coach.sqlite \
  --images .storage/essay-images
pnpm --filter @essay-coach/backend d1:migrations:apply:local
pnpm --filter @essay-coach/backend worker:deploy:dry-run
pnpm --filter @essay-coach/backend test
pnpm --filter @essay-coach/backend typecheck
pnpm test
pnpm typecheck
pnpm build
```

The `migration:summary` command prints counts, review-status totals, image object keys, and image byte totals only. It must not print OCR text, review text, raw model output, image bytes, token values, or credentials.

Protected Cloudflare and Clerk config is still required before real remote DB import, R2 upload, or deployment. The current repo intentionally does not contain real Cloudflare IDs, tokens, Clerk secrets, or agent service tokens.

First remote setup commands, after sourcing protected env files:

```bash
set -a
. ~/.config/essay-coach/cloudflare.env
. ~/.env.essay-coach
set +a

pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build

pnpm --filter @essay-coach/backend exec wrangler d1 create essay-coach-prod
# Copy the generated database_id into apps/backend/wrangler.jsonc.
pnpm --filter @essay-coach/backend exec wrangler r2 bucket create essay-coach-images-prod
pnpm --filter @essay-coach/backend d1:migrations:list
pnpm --filter @essay-coach/backend exec wrangler d1 migrations apply essay-coach-prod --remote --config wrangler.jsonc
pnpm --filter @essay-coach/backend migration:summary -- \
  --sqlite .storage/essay-coach.sqlite \
  --images .storage/essay-images
# Future one-shot importer still needs to upload rows to D1 and files to R2 without logging private contents.
pnpm --filter @essay-coach/backend worker:deploy
pnpm --filter @essay-coach/frontend pages:deploy:prod
pnpm smoke:prod
```

## MCP wrapper direction

Do not make the Cloudflare app itself depend on MCP. The app should expose a narrow HTTPS Agent API with service-token auth. Then add a small self-hosted MCP server that wraps that API for Hermes or other agents.

Suggested MCP tools:

- `get_capabilities`
- `claim_review_job`
- `validate_review`
- `submit_review`
- `fail_review_job`

The MCP server stores the Agent API base URL and service token in its own environment. The model never receives raw service tokens.

## Done criteria

- Cloudflare Pages and Worker deployments are reproducible from scripts or CI.
- Custom frontend and API subdomains resolve to Cloudflare deployments.
- D1 and R2 contain migrated data matching local counts.
- Clerk protected browser routes fail closed when unauthenticated and work for the allowed operator.
- Agent API rejects missing/invalid token and accepts a scoped valid token.
- Smoke checks are documented and can be rerun without personal browser credentials.
