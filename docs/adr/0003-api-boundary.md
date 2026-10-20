# ADR 0003: Backend API Boundary Over Direct Database Access

## Status

Proposed

## Context

Legacy OTR Web uses direct Supabase access in many feature modules. Mobile needs offline sync, durable queues, idempotency, conflict handling, and stable permissions.

## Decision

OTR Mobile talks to an OTR Backend API. Supabase database access remains behind backend business logic. UI and feature code must not import Supabase clients.

## Alternatives

- Direct Supabase from Mobile: faster initial implementation but weakens sync, permissions, and future backend evolution.
- Mixed direct database and API access: creates unclear ownership and inconsistent conflict behavior.

## Consequences

The backend must expose mobile-ready contracts. Mobile development may move slower at first, but data ownership and offline semantics stay clean.
