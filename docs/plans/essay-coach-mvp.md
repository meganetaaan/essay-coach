# Essay Coach MVP Plan

## Phase 1: Monorepo Foundation

Create a pnpm/turbo TypeScript workspace with frontend, backend, review-runner, shared contracts, docs, and db documentation.

## Phase 2: Domain and Application Core

Model children, essay days, submissions, rubrics, reviews, and calendar views. Implement use cases for daily topic creation, image submission, queued review processing, calendar lookup, and essay detail lookup.

## Phase 3: Infrastructure Adapters

Provide local object storage, in-memory persistence, in-memory queue, deterministic fake review, and Hermes review adapter with prompt builder, command runner, and JSON parser.

## Phase 4: Local UX Prototype

Build a minimal Vite React interface for calendar, essay detail, upload, and review result screens. Use mocked data or thin API integration during MVP.

## Phase 5: Verification

Use Vitest for domain, use case, queue, and Hermes adapter tests. Run install, test, typecheck, and build before handoff.
