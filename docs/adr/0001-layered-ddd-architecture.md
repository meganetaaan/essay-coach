# ADR 0001: Layered DDD Architecture

## Status

Accepted

## Context

Essay Coach needs a local-first MVP while keeping the review domain independent from Hermes, storage, queues, and future cloud deployment choices.

## Decision

The backend uses domain, application, infrastructure, and interface layers. Domain code owns child, essay, review, and calendar concepts. Application use cases depend only on ports. Infrastructure implements storage, persistence, queue, and AI adapters.

## Consequences

Domain rules can be tested without runtime dependencies. Replacing in-memory persistence, local storage, or Hermes execution can be done by swapping port implementations.
