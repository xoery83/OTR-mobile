# ADR 0016: Ledger Stage 8 Review And Operational Hardening

Date: 2026-09-13
Status: Accepted

## Decision

1. Deterministic validation failures are structured authoritative errors. They
   cannot be acknowledged or dismissed. A deterministic finding is persisted
   only for an existing canonical entity revision found inconsistent by a
   versioned rerun.
2. Heuristic Review v1 is advisory and versioned. It covers possible duplicates,
   amount/rate outliers, evidence mismatch, and participant anomalies without
   mutating financial truth.
3. A finding is immutable observation context for one entity revision/ruleset.
   Acknowledge and dismiss append an actor/member/role/reason/operation action;
   the canonical global status changes, but action history is never rewritten.
4. Ledger cursors contain and validate version, Journey, authenticated user, and
   continuation sequence. Any mismatch returns `INVALID_CURSOR`; Mobile then
   performs a controlled bootstrap whose transaction preserves local pending,
   conflict, and durable operations.
5. Queue claims use a process owner and bounded lease. Only network, timeout,
   429, and retryable 5xx failures receive exponential backoff with jitter.
   Auth pauses; domain-terminal failures stop retrying.
6. Cleanup is whitelist-only. Only old completed operational rows are removed.
   Receipt originals are evictable only after canonical authenticated download,
   byte-size, and SHA-256 verification succeeds.
7. Release startup uses the embedded bundle immediately. Cached SQLite and a
   valid local session remain usable while background sync fails or is paused.

## Deployment Order

1. Mobile SQLite v16 and optional Review DTO compatibility.
2. Backend Review, cursor, receipt-download, and action support.
3. Dev-only `REVIEW_FINDING` change-feed trigger.

Stage 9, Production, AI models, payment providers, and new state/sync frameworks
remain out of scope.
