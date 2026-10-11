# Core v2 implementation — W1/W2/W3/W5

Owner accepted W0 on 2026-10-12 and authorized continuous isolated implementation.
Base main/local/remote:741579c; branch codex/trip-core-v2-w1-w5. W4 extraction,
W6 renderers, Flexible/TTR and Provider remain independently owned.

1. Validate temporal precision and correct only invalid fixture representations.
2. Add finite business2 schemas/commands, exact receipts and actor/Trip validators.
3. Add schema85/SQLite54 against reverified lineage, preserve historical bytes.
4. Implement protected Core save/access and strict same-ID Flight qualification.
5. Implement Booking/Entitlement/Document/Instructions/relations/lifecycle.
6. Implement P3–P6 details, accepted read2 and deterministic Day projection.
7. Integrate existing durable queue, account fencing, mirror and receipt recovery.
8. Publish exact tested Capture interfaces early, including sibling purpose gate.
9. Validate disposable SQL/RLS, SQLite/offline and twenty acceptance targets;
   commit coherent units and integrate only after concurrency/ancestry checks.

All hosted/provider/business-runtime activation remains CLOSED. SQL tests use an
explicitly owned disposable container only; no existing database resets. No UI
changes are in this data foundation. API/repository/sync ownership remains fixed.

## Pre-implementation temporal findings

P4 W0 command labels `11:00` with clockPrecision−1 are valid minute precision.
Storage normalizes to `11:00:00` while preserving−1; nonzero seconds/fraction with
−1 is rejected. No business-time change or product redesign required. Regression:
tripCoreV2Temporal.test.ts. Source instant precision−1 requires zero seconds and
actual SOURCE_INSTANT evidence; ordinary clock/offset is never upgraded to proof.

First focused temporal+existing Flight suites36 PASS; typecheck/touched lint PASS.
Sparse→qualified conversion remains a separate guarded command, not a relaxed
CP13A create/update or a duplicate legacy Event. Existing strict validator unchanged.
