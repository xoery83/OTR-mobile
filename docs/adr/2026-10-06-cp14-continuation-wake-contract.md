# CP14 continuation wake contract

Date: 2026-10-06 (Pacific/Auckland). Status: owner-approved; implemented with closed injected adapters.

`INTELLIGENCE_CONTINUATION_WAKE` re-evaluates a retained SQLite50 task. It does not
invoke a provider. The approved strict v1 payload pins Account/task/publication
fence/version and REEVALUATE; current task row revision is loaded for fresh CAS.

One deterministic retained `sync_operations` row coalesces signals and can be
re-armed after a completed pass. Its existing base_version is wake signal generation.
Conditional Account/claim/signal finalization preserves a later signal. Per-claim
labels carry the existing process-owner prefix; process recovery does not steal a
live same-process claim. Queue completion, retry, count and lease remain evaluation
bookkeeping, independent of execution/install/metering and intelligence quiescence.

The existing central operational-sync/activity owner accepts a separately typed
closed adapter and uses its existing timer for cold/reconnect wake. Ledger UI counts
remain scoped. Five C Import denials stay unconditional; no second scheduler,
Server84/SQLite51, provider executor activation or durable authority is introduced.

Owner approval and implementation/acceptance are recorded in the
[C2 report](../architecture/TRIP_CHECKPOINT_14_AGENT_C2_CONTINUATION_RUNTIME_REPORT.md).
