# Essay Coach

TypeScript pnpm monorepo for the Essay Coach MVP.

## MVP Preview With Cloudflare Tunnel

Install dependencies if this checkout has not been installed yet:

```bash
pnpm install
```

Build the workspace:

```bash
pnpm build
```

Start the local MVP preview server:

```bash
pnpm preview:mvp
```

The preview serves `apps/frontend/dist` at `http://127.0.0.1:4173`, supports SPA fallback to `index.html` for deep links, and exposes `POST /api/mvp/submissions` for the local image submission and review flow. The default reviewer is real Hermes-backed review generation through the Hermes CLI. The server logs the active reviewer mode on startup.

For cheap manual smoke testing only, explicitly opt into the fixed fake reviewer:

```bash
ESSAY_COACH_REVIEWER=fake pnpm preview:mvp
```

The submission API returns a queued review lifecycle response first. The frontend polls `GET /api/mvp/submissions/:submissionId` until the review is completed or failed, so a manual Hermes smoke should submit one small image and confirm the completed review is generated from Hermes. Invalid `ESSAY_COACH_REVIEWER` values fail fast instead of silently selecting fake reviews.

In another shell, start a temporary Cloudflare Tunnel to that local server:

```bash
cloudflared tunnel --url http://127.0.0.1:4173 --no-autoupdate
```

Open the temporary `trycloudflare.com` URL printed by `cloudflared` to confirm the MVP features. The URL is temporary and only live while both `pnpm preview:mvp` and `cloudflared tunnel` are running.
