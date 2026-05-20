# Essay Coach Design

This directory records the current system design for the Essay Coach MVP. The goal is to keep the implementation understandable enough that the local prototype can later move toward a durable Cloudflare-backed product without changing the core domain model.

## Product goal

Essay Coach helps an elementary school child build a daily writing habit.

The target workflow is intentionally small:

1. A child writes one handwritten作文 for a day.
2. A parent or child uploads a photo of the page.
3. The upload creates a submission and queues one review for that submission.
4. The system evaluates the作文 with a 100-point rubric.
5. The child can rewrite and submit again; the new submission receives its own review.
6. The calendar keeps the visible record of daily practice.

The scoring perspective is inspired by 都立型中学受験作文, but the feedback must stay usable for an elementary school child. The app should say what to fix next, not merely assign a score.

## MVP scope

The current MVP proves the end-to-end interaction through a local server and Cloudflare Tunnel.

In scope:

- fixed demo child (`child-1`, grade 6)
- fixed sample topic (`free-assignment` / 「自由課題」)
- image upload as a data URL
- local object storage for uploaded images
- local SQLite persistence for essay days, submissions, and reviews
- queued review lifecycle: `queued -> processing -> completed | failed`
- real Hermes-backed review generation by default
- explicit deterministic fake reviewer for cheap smoke tests
- calendar, detail, upload, and review screens

Out of scope for this checkpoint:

- user authentication
- production Cloudflare deployment
- durable multi-tenant storage
- topic management UI
- payment, notifications, or parent accounts
- manual review editing

## High-level runtime

```txt
Browser
  |
  | HTTPS via temporary trycloudflare.com URL
  v
cloudflared tunnel
  |
  v
Local preview server (scripts/preview-mvp.ts)
  |-- serves apps/frontend/dist
  |-- handles /api/mvp/*
  |
  v
Backend composition root
  |-- use cases
  |-- repositories
  |-- object storage
  |-- review job queue
  `-- essay reviewer
        |
        v
      Hermes CLI / Codex subscription-backed review
```

The preview server is not meant to become the production server as-is. It is a thin local runtime that lets the team validate the UX and review lifecycle from an external browser.

## Monorepo layout

```txt
apps/backend
  src/domain           Business model and validation
  src/application      Use cases and ports
  src/infrastructure   Concrete adapters
  src/interfaces/http  Local MVP HTTP boundary

apps/frontend
  src/main.tsx         MVP React UI shell
  src/mvp-api.ts       Frontend API client and polling helpers
  src/app-route.ts     Hash/history route model

apps/review-runner
  src                  Worker entrypoint for queued reviews

packages/contracts
  src                  Shared DTO and type contracts

docs/adr
  *.md                 Architecture decisions

docs/design
  *.md                 Living design notes
```

## Core domain model

### Child

A child owns daily作文 records. The MVP uses one fixed child, but the model keeps `childId` and `childGrade` because review guidance changes by grade.

### EssayDay

An `EssayDay` represents one calendar day for one child.

Important properties:

- `childId`
- `date`
- `topic`
- unique logical identity for `(childId, date)`

A day can have multiple submissions because rewriting is allowed.

### EssaySubmission

An `EssaySubmission` represents one uploaded handwritten image attempt.

Important properties:

- `essayDayId`
- `attemptNumber`
- `strictness`
- `imageObjectKey`
- `reviewStatus`
- optional `ocrText`

A submission has at most one review. Re-submission creates a new submission instead of replacing the old one.

### Review

A `Review` is the result of evaluating one submission.

It includes:

- extracted `ocrText`
- `totalScore`
- `scores` by rubric dimension
- topic comment
- strengths
- improvement points
- rewrite advice
- child-friendly comment
- parent summary
- raw reviewer output for debugging

## Review rubric

The review is a 100-point total across seven dimensions.

- `topicRelation`: 題名・課題との関係
- `taskUnderstanding`: 課題理解
- `structure`: 構成
- `specificity`: 具体性
- `expression`: 表現
- `grammarAndNotation`: 誤字脱字、かなづかい、句読点など
- `readerAwareness`: 読み手意識

The maximum score per dimension changes by:

- grade band: lower / middle / upper elementary
- strictness: `easy` / `hard`

`easy` prioritizes encouragement and next-action clarity. `hard` adds entrance-exam-oriented attention to prompt response, structure, reasoning, and reader persuasion.

The domain validates that each dimension is within the active rubric maximum and that `totalScore` equals the sum of dimensions.

## Review lifecycle

```txt
POST /api/mvp/submissions
  -> create/find EssayDay
  -> create EssaySubmission
  -> enqueue review job
  -> return processStatus=queued
  -> preview server starts background processing

Frontend polling
  -> GET /api/mvp/submissions/:submissionId
  -> display queued/processing/completed/failed state
```

The one-review rule applies per submission, not per day. This preserves the history of rewrites while keeping each uploaded attempt auditable.

## Hermes boundary

Hermes is treated as an infrastructure adapter, not as domain logic.

The domain knows only the shape of a valid review. The application layer depends on an `EssayReviewer` port. The Hermes implementation is responsible for:

- building the review prompt
- invoking the Hermes CLI
- parsing structured JSON output
- validating score totals and rubric limits
- returning a domain `Review`

This keeps future provider changes local to infrastructure. It also prevents tests from requiring live Hermes calls unless a specific live smoke test is intended.

## Persistence strategy

The MVP is local-first.

- SQLite stores essay days, submissions, and reviews.
- Local object storage stores uploaded image bytes.
- `.storage/` and SQLite files are ignored by git.

The current Prisma schema is a documentation/reference schema for the future relational model. Runtime code currently uses local SQLite adapter code directly so the preview can run without a database provisioning step.

## Frontend design

The frontend is a single Vite React app with simple route states:

- calendar
- essay detail
- upload
- review

The MVP uses hash/history routing instead of a full router. This keeps the preview small and makes Cloudflare Tunnel testing straightforward.

Frontend responsibilities:

- maintain the selected calendar day
- read image files as data URLs
- submit uploads to the MVP API
- poll review status after submission
- merge completed review results into the month view
- display review history for a day

Business rules such as score validation and one-review-per-submission remain in the backend/domain.

## API boundary

The local API is intentionally thin.

- `POST /api/mvp/submissions`
- `GET /api/mvp/submissions/:submissionId`
- `GET /api/mvp/submissions?year=YYYY&month=M`

The API uses DTOs from `packages/contracts` where useful, but does not expose infrastructure details such as file paths or raw SQLite rows.

## Security and repository hygiene

This repository is public. Do not commit credentials or local runtime data.

Keep out of git:

- `.env`
- `.storage/`
- SQLite database files
- generated frontend/backend builds
- node modules
- private keys or API tokens

Hermes credentials belong in the host environment or Hermes configuration, not in this project.

## Open design questions

- How should parents create and manage children?
- How should topics be assigned: fixed curriculum, generated daily, or parent-selected?
- Should OCR text be editable before review?
- Should a failed review be retryable for the same submission, or should retry create a new attempt?
- What production storage should replace local SQLite/object storage?
- Which Cloudflare deployment shape is best: Workers + D1/R2, Pages + Worker API, or another split?
