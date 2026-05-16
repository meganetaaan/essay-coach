# Codex Goal: Essay Coach MVP

Build a local-first monorepo application for a handwritten Japanese essay practice/review app for elementary school children.

## Product Requirements

- A child submits one handwritten essay image per day.
- Each `EssayDay` has exactly one topic. In MVP, choose one randomly from a constant topic catalog.
- Writing to the topic is optional. Reviews should still comment on how the essay relates to the topic.
- Uploading an essay submission triggers a review job.
- OCR is performed by Hermes, not a separate OCR service.
- Review returns a 100-point score made from multiple rubric dimensions inspired by Tokyo metropolitan public junior-high entrance essay problems.
- Strictness must be selectable per submission: `easy` or `hard`.
- Rewrites are allowed: a rewritten essay is a new `EssaySubmission` for the same `EssayDay` with incremented `attemptNumber`.
- Each `EssaySubmission` can have exactly one `Review`.
- MVP deployment is local household use.
- DDD boundary is important: Hermes/Codex subscription dependency must be hidden behind infrastructure adapters so cloud-native migration is easy.

## Architecture Requirements

Create a RaaS-inspired TypeScript pnpm monorepo:

```txt
essay-coach/
├── apps/
│   ├── frontend/
│   ├── backend/
│   └── review-runner/
├── packages/
│   └── contracts/
├── db/
├── docs/
│   ├── adr/
│   ├── design/
│   └── plans/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Use TypeScript throughout. Keep implementation minimal but working and tested.

## Backend DDD Layout

Create `apps/backend/src` with:

```txt
app/
  composition-root.ts
  create-app.ts
domain/
  child/
  essay/
  review/
  calendar/
application/
  ports/
  use-cases/
infrastructure/
  ai/
    hermes/
    fake/
  storage/
  queue/
  persistence/
interfaces/
  http/
shared/
```

Domain must not import infrastructure or Hermes.
Application may depend only on ports.
Infrastructure implements ports.

## Contracts

Create `packages/contracts/src` with shared DTO/schema-like TypeScript types:

- `children.ts`
- `essay-days.ts`
- `submissions.ts`
- `reviews.ts`
- `calendar.ts`
- `index.ts`

## Core Domain Types

Implement at least:

- `Child`
- `EssayDay`
- `EssaySubmission`
- `ReviewStrictness = "easy" | "hard"`
- `ReviewScoreBreakdown`
- `Review`
- `ReviewRubric`
- `MVP_ESSAY_TOPICS`

Rubrics:

Easy mode:
- topicRelation 10
- taskUnderstanding 20
- structure 15
- specificity 20
- expression 15
- grammarAndNotation 10
- readerAwareness 10

Hard mode:
- topicRelation 20
- taskUnderstanding 15
- structure 20
- specificity 15
- expression 10
- grammarAndNotation 10
- readerAwareness 10

Validate that score dimensions are within their max and total is exactly the sum.

## Application Ports

Implement ports:

```ts
export interface ObjectStorage {
  putObject(input: { key: string; contentType: string; body: Buffer }): Promise<{ objectKey: string }>;
  getReadableUrlOrPath(objectKey: string): Promise<string>;
}

export interface EssayReviewer {
  reviewEssayImage(request: EssayReviewRequest): Promise<EssayReviewResult>;
}

export interface ReviewJobQueue { ... }
export interface EssayRepository { ... }
export interface ReviewRepository { ... }
```

`EssayReviewRequest` must include:

- childGrade
- essayDate
- topic
- topicAdherenceRequired: false
- strictness
- imageObjectKey
- imageUrlOrPath

`EssayReviewResult` must include:

- ocrText
- totalScore
- scores
- topicComment
- strengths
- improvementPoints
- rewriteAdvice
- childFriendlyComment
- parentSummary
- rawOutput

## Use Cases

Implement:

- `createEssayDay`
  - creates one essay day per child/date
  - assigns random constant topic if topic not provided
- `uploadEssaySubmission`
  - stores image through `ObjectStorage`
  - creates submission with next attempt number
  - saves selected strictness
  - enqueues review job
- `processReviewJob`
  - locks/picks a queued job
  - resolves image path via storage
  - calls `EssayReviewer`
  - saves OCR text and review
  - completes or fails job
- `getMonthlyCalendar`
- `getEssayDetail`

Use in-memory persistence for MVP tests and local prototype. It is fine to add Prisma schema as documentation, but the app should not require a real DB to test.

## Infrastructure

Implement:

- `FakeEssayReviewer` for deterministic tests/dev.
- `HermesEssayReviewer` infrastructure adapter that builds a prompt instructing Hermes to OCR and review the image.
- `HermesCommandRunner` abstraction for calling `hermes chat -q <prompt>`.
- `HermesReviewPromptBuilder` with Easy/Hard rubric differences.
- `HermesReviewOutputParser` that parses JSON output and rejects invalid scoring.
- `LocalObjectStorage` storing images under `.storage/essay-images`.
- In-memory queue/persistence suitable for tests.

Hermes prompt must say:

- OCR the handwritten essay image.
- Topic adherence is optional, but topic relation should be evaluated/commented on.
- Use Easy or Hard rubric depending on strictness.
- Return JSON only.

## Frontend

Create a minimal Vite React app with routes/components or route-like pages:

- Calendar page
- Essay detail page
- Submission upload page
- Review detail page

It may use mocked data or a thin API client, but should clearly represent the UX:

- show daily topic
- say that writing to the topic is optional
- choose Easy or Hard
- upload image
- show review status
- show OCR text, total score, score breakdown, topic comment, child comment, parent summary

## Review Runner

Create `apps/review-runner` as a thin process:

- composition root
- worker loop
- calls `processReviewJob`
- depends on application use case, not direct Hermes logic

## Docs

Create ADRs:

- `docs/adr/0001-layered-ddd-architecture.md`
- `docs/adr/0002-hermes-as-infrastructure-adapter.md`
- `docs/adr/0003-review-one-per-submission.md`
- `docs/adr/0004-local-first-cloud-migratable-runtime.md`

Create `docs/plans/essay-coach-mvp.md` summarizing implementation phases.

## Tests

Use Vitest.

Add focused tests for:

- topic catalog returns a topic
- easy/hard rubric max totals are 100
- review score total validation
- upload submission increments attempt numbers
- upload submission enqueues one review job
- processReviewJob saves OCR text and review
- one review per submission is enforced
- Hermes prompt contains OCR instruction, topic optional instruction, strictness/rubric
- Hermes output parser parses valid JSON and rejects invalid totals

## Tooling

Add scripts:

```json
{
  "test": "pnpm -r test",
  "typecheck": "pnpm -r typecheck",
  "build": "pnpm -r build",
  "dev:frontend": "pnpm --filter @essay-coach/frontend dev",
  "dev:backend": "pnpm --filter @essay-coach/backend dev",
  "dev:review-runner": "pnpm --filter @essay-coach/review-runner dev"
}
```

## Constraints

- Do not overbuild authentication, cloud deploy, or real DB integration.
- Do not call real Hermes in tests.
- Keep Hermes dependency behind infrastructure adapter.
- Do not commit automatically. Leave changes for the orchestrating agent to inspect.
- Prefer small, clear, tested implementation over broad incomplete scaffolding.

## Verification Commands

Run:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

If package installation is unavailable, still create complete package files and explain what remains.
