# ADR 0003: Review One Per Submission

## Status

Accepted

## Context

Children can rewrite essays. Each rewrite should preserve its own score and feedback history.

## Decision

An `EssayDay` can have many `EssaySubmission` records with incrementing attempt numbers. Each submission can have exactly one `Review`.

## Consequences

Review history is append-only at the submission level. Reprocessing a completed submission is rejected by the review repository invariant.
