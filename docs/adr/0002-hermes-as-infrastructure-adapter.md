# ADR 0002: Hermes as Infrastructure Adapter

## Status

Accepted

## Context

OCR and review are performed by Hermes. The product should not expose a Hermes/Codex subscription dependency in domain or application code.

## Decision

Hermes is represented by the `EssayReviewer` application port. The infrastructure adapter builds a prompt, runs `hermes chat -q`, parses JSON output, and validates scoring.

## Consequences

Tests can use `FakeEssayReviewer`. A later cloud-native reviewer can implement the same port without changing use cases or domain entities.
