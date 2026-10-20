# CLOSED Model Task lifetime admission and technical output

2026-10-12. Owner-approved isolated design/implementation only (CP-LLM-02A R1/R2/R2B).

Server83/84 already own call identity, START, conservative holds, mark, current
scope/Trip authorization, recovery and usage. Sequence1 alone did not enforce one
paid Attempt per logical Task across independent callers.

The additive forward migration `20261012000100_model_task_protected_admission.sql`
adds one immutable Account/integration/task→Call admission with unique logical
request/key, canonical request/profile/policy digests and currency/ceiling/deadline.
It extends the existing reserve/mark roots, uses their locks and original accounting,
and retains the binding for every execution state. Exact replay adds no START/hold;
new identities cannot release or reset responsibility. Historical unbound Calls
remain recoverable but cannot dispatch. There is no new public dispatch root,
accounting ledger, generic cumulative budget or SQLite migration.

The registered first profile composes compiled CP15 Flight text/schema/minimizer/
privacy pins. Shared request/result types contain no Flight business fields. The
owning workflow retains real Import/Trip/material Task pins internally; arbitrary
consumers cannot fabricate them to use this Flight-only protected admission.

A separate technical witness retains registered structural JSON in existing private
custody before semantic interpretation. Semantic rejection can coexist with that
witness; interpretation `ExecutionReport.response_sha256` is unchanged. Output reads
revalidate exact Attempt/digest/schema and current authorization/generation. Usage
and pending metering remain independent. Historical results without a witness do
not acquire retroactive technical success.

The isolated PostgreSQL fixture is network-none; read-and-CAS bootstrap adapts to
its retained configuration revision without disabling CAS. Owner review is still
required for integration; Hosted deployment, credentials, provider calls, device
and runtime/C5/C9/Core activation remain CLOSED. Full concurrent Core migration
chain and actual provider/custody operations are separate acceptance boundaries.
