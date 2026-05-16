# ADR 0004: Local-First Cloud-Migratable Runtime

## Status

Accepted

## Context

MVP deployment is for household local use, but the architecture should be easy to migrate to cloud services.

## Decision

The local runtime uses in-memory persistence, an in-memory review queue, and local filesystem object storage. These are all infrastructure adapters behind application ports. A Prisma schema is kept as documentation only.

## Consequences

The MVP remains simple to run and test. Cloud migration can introduce durable queue, object storage, and database adapters without changing the domain model.
