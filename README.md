# Essay Coach

Essay Coach は、小学生の手書き作文を毎日記録し、画像アップロードを起点に作文レビューを返すための MVP です。

このリポジトリは、RaaS の大まかなディレクトリ設計を応用した TypeScript / pnpm monorepo です。MVP ではローカルサーバを Cloudflare Tunnel で一時公開し、ブラウザから実際に提出・レビュー確認できることを目標にしています。

## MVPで確認できること

- 月間カレンダーで作文提出実績を見る
- 日付を選び、その日の作文画像をアップロードする
- 作文提出をトリガにレビュー処理が走る
- レビュー完了までフロントエンドが状態をポーリングする
- 100点満点の合計点と観点別スコアを見る
- 良かった点、直すとよい点、書き直しアドバイスを見る
- 同じ作文日に書き直しとして再提出し、提出履歴を残す

MVP のデモ児童は固定です。

- `child-1`
- 小学6年生
- 課題: 「自由課題」

## Repository layout

```txt
apps/
  backend/        Domain / application / infrastructure / HTTP handlers
  frontend/       Vite + React MVP UI
  review-runner/  Review job worker entrypoint
packages/
  contracts/      Frontend/backend shared DTO contracts
db/
  schema.prisma   Future relational schema reference
docs/
  adr/            Architecture decision records
  design/         Current design notes
  plans/          MVP planning notes
scripts/
  preview-mvp.ts  Local static frontend + MVP API preview server
```

## Architecture summary

Backend code follows a layered shape.

```txt
interfaces -> application -> domain
infrastructure -> application -> domain
```

- `domain`: 作文日、提出、レビュー、採点ルーブリックなどの業務ルール
- `application`: ユースケースとポート。具体的な保存先やAI実行方法を知らない
- `infrastructure`: SQLite、ローカルオブジェクト保存、Hermes CLI、fake reviewer などの具体実装
- `interfaces`: MVP HTTP handler。将来 Cloudflare Workers や別 API 層へ移し替えやすくする境界

詳しくは [`docs/design/`](docs/design/) と [`docs/adr/`](docs/adr/) を参照してください。

Cloudflare への常設デプロイとローカル SQLite / 画像ストレージ移行の方針は、[`docs/adr/0005-cloudflare-deployment-and-cloud-storage.md`](docs/adr/0005-cloudflare-deployment-and-cloud-storage.md) と [`docs/runbooks/cloudflare-deployment.md`](docs/runbooks/cloudflare-deployment.md) に記録しています。

## Prerequisites

- Node.js
- pnpm 9.x
- `cloudflared` for temporary external preview
- Hermes CLI available on the machine for real review generation

The project does not require committing any credentials. Keep local secrets in ignored files such as `.env` or in the host Hermes configuration.

## Install

```bash
pnpm install
```

## Local checks

```bash
pnpm test
pnpm build
```

Useful workspace scripts:

```bash
pnpm --filter @essay-coach/backend test
pnpm --filter @essay-coach/frontend test
pnpm --filter @essay-coach/review-runner build
```

## MVP Preview With Cloudflare Tunnel

Build the workspace first:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm build
```

Start the local MVP preview server with matching Clerk settings:

```bash
CLERK_PUBLISHABLE_KEY=pk_test_... pnpm preview:mvp
```

For local-only smoke testing without Clerk, you may explicitly enable the backend dev header fallback and call the API with `x-essay-coach-dev-user-id`. Do not expose that fallback as a public preview.

```bash
ESSAY_COACH_ALLOW_DEV_AUTH_HEADER_FALLBACK=true pnpm preview:mvp
```

If Clerk is not configured, the frontend shows a login setup screen instead of the protected app.

Rebuild after changing frontend env values:

```bash
pnpm build
```

The preview server:

- serves `apps/frontend/dist` at `http://127.0.0.1:4173`
- supports SPA fallback to `index.html`
- exposes the local MVP API under `/api/mvp/*`
- stores local runtime data under ignored local storage paths
- logs the active reviewer mode on startup

In another shell, start a temporary Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:4173 --no-autoupdate
```

Open the printed `trycloudflare.com` URL while both commands are running.

## Manual MVP smoke test

1. Open the Cloudflare Tunnel URL.
2. Select a day in the calendar.
3. Open the upload screen.
4. Choose a small handwritten作文 image.
5. Select review strictness.
   - `やさしめ`: 学年相応の言葉で、本人が直せる助言を重視
   - `きびしめ`: 都立型中学受験を意識し、構成・課題応答を重視
6. Submit the image.
7. Confirm the review status moves from queued/processing to completed.
8. Confirm the review page shows:
   - total score
   - rubric scores
   - OCR text
   - strengths
   - improvement points
   - rewrite advice
   - parent summary
9. Return to the calendar and confirm the submitted day is marked.
10. Re-submit another image for the same day and confirm the history count increases.

## Reviewer modes

By default, the MVP uses the real Hermes-backed reviewer through the Hermes CLI.

```bash
pnpm preview:mvp
```

For cheap manual smoke testing only, explicitly opt into the deterministic fake reviewer:

```bash
ESSAY_COACH_REVIEWER=fake pnpm preview:mvp
```

Invalid `ESSAY_COACH_REVIEWER` values fail fast. The app should not silently fall back to fake reviews when the intended check is real Hermes behavior.

## MVP API

The preview server exposes a thin local API for the MVP UI.

### `POST /api/mvp/submissions`

Creates an essay day when needed, stores the uploaded image, creates a submission, and queues review processing.

Request body:

```json
{
  "date": "2026-05-17",
  "strictness": "easy",
  "contentType": "image/png",
  "imageDataUrl": "data:image/png;base64,..."
}
```

Response includes:

- `essayDay`
- `submission`
- optional `review`
- `submissionHistory`
- `processStatus`

### `GET /api/mvp/submissions/:submissionId`

Returns the latest status for a submitted作文 and the review when available.

### `GET /api/mvp/submissions?year=2026&month=5`

Returns submitted days for the MVP calendar month view.

## Local data and ignored files

Runtime data is local-only and must not be committed.

Ignored examples:

- `.env`
- `.storage/`
- `*.sqlite`
- `*.sqlite-shm`
- `*.sqlite-wal`
- `node_modules/`
- `dist/`
- `*.tsbuildinfo`

Before publishing changes from a local prototype, scan staged files and diffs for credentials.

## Current limitations

- Authentication and multi-child account management are not implemented yet.
- The MVP uses a fixed demo child and a fixed topic.
- The preview server is local-first and temporary; it is not a production deployment target.
- The Prisma schema is documentation-oriented at this stage. The MVP runtime uses local SQLite adapter code directly.
- OCR/review quality depends on the active Hermes-backed reviewer configuration.

## Design documents

- [`docs/design/README.md`](docs/design/README.md): system design overview
- [`docs/design/backend-boundaries.md`](docs/design/backend-boundaries.md): backend layer and dependency boundaries
- [`docs/adr/0001-layered-ddd-architecture.md`](docs/adr/0001-layered-ddd-architecture.md)
- [`docs/adr/0002-hermes-as-infrastructure-adapter.md`](docs/adr/0002-hermes-as-infrastructure-adapter.md)
- [`docs/adr/0003-review-one-per-submission.md`](docs/adr/0003-review-one-per-submission.md)
- [`docs/adr/0004-local-first-cloud-migratable-runtime.md`](docs/adr/0004-local-first-cloud-migratable-runtime.md)
