# ADR 0044: Idle-aware rate-demand scanning

Date: 2026-09-26
Status: Approved for Performance Guardrails Phase 1A

The Dev Backend scans once at startup, then schedules one scan after the prior
scan finishes. Consecutive successful empty scans wait 30, 60, 120, then 300
seconds; useful work restores 30 seconds. Failures wait at least 60 seconds and
back off to 300 seconds. A successful Backend write that exposes rate demand may
wake the scanner early; wakeups coalesce and never overlap a running scan.
Wakeups cannot bypass a failure retry delay.

Useful work means a claimed rate demand, a resolved Personal Payment FX
projection, or a listed automatic reference-valuation demand. The scanner does
not change claim, retry, provider, FX, or valuation rules. Demand produced
outside a known Backend write path can wait up to five minutes to be discovered.
No schema, API, or Mobile contract changes are required.
