# Backend Boundaries

The backend is organized so that the作文 learning model stays independent from runtime choices such as Hermes, SQLite, object storage, or HTTP.

## Dependency direction

```txt
interfaces -> application -> domain
infrastructure -> application -> domain
```

Allowed dependencies:

- `domain` imports only domain-local code and shared primitives.
- `application` imports domain types and application ports.
- `infrastructure` implements application ports and may import concrete SDKs, CLI runners, file systems, SQLite, or Hermes-specific code.
- `interfaces` adapts HTTP requests/responses into application use cases.

Disallowed dependencies:

- Domain code must not import infrastructure.
- Application use cases must not import HTTP handlers, SQLite, local file storage, or Hermes command runners.
- Frontend DTO concerns must not leak into domain validation.
- Hermes prompt/output details must not become the source of truth for scoring rules.

## Layers

### Domain

Location: `apps/backend/src/domain`

Owns business concepts:

- child grade bands
- essay days
- essay submissions
- review status
- review rubric and score validation
- one-review-per-submission semantics

Domain code should be deterministic and easy to unit test.

### Application

Location: `apps/backend/src/application`

Owns use-case orchestration:

- create or find a daily essay record
- upload a handwritten作文 submission
- enqueue a review job
- process the next review job
- read calendar summaries
- read essay detail and submission history

Application code talks to the outside world through ports:

- `EssayRepository`
- `ReviewRepository`
- `ObjectStorage`
- `ReviewJobQueue`
- `EssayReviewer`

The application layer decides when a port is used. It does not decide how the port is implemented.

### Infrastructure

Location: `apps/backend/src/infrastructure`

Owns concrete adapters:

- local object storage
- in-memory repositories for tests
- SQLite repositories for the MVP preview
- in-memory review queue
- fake deterministic reviewer
- Hermes-backed reviewer
- Hermes command runner and output parser

Infrastructure may be messy at the edges because it touches real systems. Keep that mess contained here.

### Interfaces

Location: `apps/backend/src/interfaces`

Owns external protocol adaptation.

The MVP currently exposes thin HTTP handlers for:

- `POST /api/mvp/submissions`
- `GET /api/mvp/submissions/:submissionId`
- `GET /api/mvp/submissions?year=YYYY&month=M`

Handlers validate request shape, call use cases or repositories through the composition root, and serialize response DTOs. They should not contain scoring rules or persistence-specific logic.

## Composition root

Location: `apps/backend/src/app/composition-root.ts`

The composition root wires ports to concrete implementations.

Current runtime choices:

- SQLite persistence for local preview state
- local object storage for uploaded images
- in-memory review job queue
- Hermes reviewer by default
- fake reviewer only when explicitly requested

This is the only place where the app should decide whether to use Hermes or fake review generation.

## Review adapter boundary

The `EssayReviewer` port is the boundary between application logic and AI review generation.

The Hermes adapter may:

- construct a prompt
- call the Hermes CLI
- parse JSON output
- preserve raw output for debugging

The Hermes adapter must:

- return the domain `Review` shape
- validate score totals and rubric maximums
- fail loudly on invalid output
- avoid silent fallback to fake reviews

The fake reviewer exists for deterministic tests and cheap manual smoke tests. It is not a production fallback.

## Persistence boundary

Repositories expose domain objects, not database rows.

SQLite-specific details such as table names, JSON serialization, and connection handling stay inside `apps/backend/src/infrastructure/persistence`.

The local MVP stores runtime data in ignored files. Future Cloudflare storage can replace these adapters without changing use cases.

## Testing implications

Prefer tests at the narrowest useful boundary:

- domain tests for score/rubric validation
- use-case tests with in-memory ports
- adapter tests for SQLite serialization and Hermes parsing
- HTTP handler tests for request validation and DTO shape
- frontend tests for routing, submission state, and API client behavior

Live Hermes behavior should be verified by explicit smoke tests, not by ordinary unit tests.
