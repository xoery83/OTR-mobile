# CP14 — Persistence authority split

Date: 2026-10-06 (Pacific/Auckland). Status: **PROPOSED — OWNER REVIEW REQUIRED**.

## Context

Frozen CP14 A/B memory state and C's deferred continuation require durable storage.
One provider/config registry cannot also be a device execution journal or canonical
Import authority. The supplied next-stage plan separates three intelligence products.

## Decision proposed

Server control plane owns generic integration/config/auth/price/usage/health/audit
and inbound reservation/recovery. Device execution plane owns logical continuations
and concrete attempts through repositories, with existing sync_operations as sole
scheduler/claim owner. Existing Source/Run/Candidate/Closure/Confirmation/output slot
and domain receipts retain Import/canonical authority. Execution certainty, metering
completeness and result installation are separate observations.

Append-only usage observations retain a stable call identity; unknown units remain
NULL. Inbound recovery persists exact package/review/generated preparation identities
before effects. Late usage survives cancel/UNKNOWN; neither usage nor package status
confers Event authority. Secrets resolve only through separately admitted references.

## Consequences and limits

Recommend one owner for additive server83 and SQLite50 after approval. No second
scheduler, customer charging, training/CXE model tables or Admin UI. Live credential,
inbound private-material/device bridge and retention/deletion dependencies stay gated.
This ADR is a proposal; no migration, code, connector or runtime is installed.

Exact design and acceptance: [CP14 preflight](../architecture/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT.md).
Owner planning source: [next-stage plan](../architecture/OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md).
