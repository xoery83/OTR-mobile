# ADR 0002: Offline-First Local Database

## Status

Proposed

## Context

The app must work during real travel with weak networks, offline stations, queues, and tired users. Users must view trip data and record changes without waiting for cloud availability.

## Decision

SQLite-backed local data is the mobile source of truth. User writes are local first, then synchronized through durable queues.

## Alternatives

- API-first mobile client: simpler initially but fails the core travel requirement.
- In-memory cache plus cloud writes: loses durability and restart safety.
- Full CRDT system from day one: powerful but too complex for Phase 1.

## Consequences

Every feature must be designed around local records, sync metadata, and pending states. Backend APIs must support idempotency, versions, tombstones, and incremental sync.
