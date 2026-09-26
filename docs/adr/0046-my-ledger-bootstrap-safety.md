# ADR 0046: My Ledger bootstrap safety

Date: 2026-09-26
Status: Implemented locally; Dev deployment pending

`/v2/me/ledger` reads only linked Journeys with a Ledger settings row. A single
settings lookup over the linked Journey IDs determines eligibility before any
full reporting starts. Missing settings are counted and skipped: a linked trip
without Ledger settings has no Ledger currency or balance to report. No value is
fabricated. A failed settings lookup or a real reporting failure still fails the
whole request.

Eligible Journeys retain deterministic ID ordering. Reporting runs in batches
of at most two; a failed batch settles its running companion and starts no
later batch. Distinct My Ledger reads are serialized within the Backend
gateway, so the two-job cap also holds across requests. The HTTP handler shares
one in-flight Promise for identical account, period and date bounds, deleting
the entry on success or failure. It does not cache completed results.

The process-global limit of two is a **temporary Hosted Dev incident-safety
guardrail**, not the final Production architecture. Before Production rollout,
re-evaluate per-request Journey concurrency and a separately sized global
ceiling using measured capacity. The current global gate can cause head-of-line
blocking between unrelated users.

Structured logs contain counts, concurrency high-water mark, failed index and
error class, queued-work suppression, and single-flight leader/join counts.
They contain no token or Journey identifiers. Full reporting, financial rules,
response shape, Mobile sync cadence and database schema remain unchanged.
