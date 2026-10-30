# Native-04 first vertical slice — 30 October 2026

Base main2033e6c4; stable worktree branch codex/native-downstream-20261030.
Original Native branch and unmerged Enrichment remain intact.

- Normal committed ACCOUNT only, existing General DEV gate; Guest/provisional/finite QA selectors stay closed.
- Existing cold/account activation, foreground, connectivity restoration and Trip entry trigger background reads. The existing active health timer also checks Trip reads every30s while preserving the15-minute DataHealth cadence. No second engine/timer/outbox.
- Account discovery reuses bounded existing pagination and account-scoped summary cache. Its summaries grant no Core or local creator authority. Trip collections are serialized, coalesced, freshness-limited15s and failure-backed-off15/30/60s. Background/offline/stale queued reads do not start.
- Existing transport validates the complete actor-specific collection; existing Core Repository atomically installs accepted graph/bindings/certificate and preserves Pending/UNKNOWN/drafts/outbox. Exact unchanged certificate versions skip SQLite replacement. Certificate revision remains the existing JSON numeric TEXT contract; comparison alone parses it.
- Existing operational completion notifications invalidate MyTrips/Trip readers only for matching Account and generation. No network render loop or new UI copy.

## Evidence

Local four suites171PASS: actual SQLite remote-only P3 Create/Edit/legalSkip, competing unsent intent preservation and SQLite close/reopen; remote-only certified P2 read without local Trip or Queue; duplicate pull unchanged refreshGeneration; coalescing/backoff/switch fencing; cold/foreground/network/periodic lifecycle and mounted Home reader. These are deterministic L2 evidence, not DEV or iPad Downstream PASS. Existing successful Manual/Import receipts are not rerun or promoted.

## Next actual acceptance

Auth prepares a separate normal Host OTP session for the existing iPad Account, no device credential extraction. Wait for Import to explicitly return DEV business window, then external normal P3 Create/APPLIED -> iPad automatic pull/read/cold -> independent server identity, followed by Edit/Skip and controlled Pending conflict. No paid Provider calls.

## Explicit remaining contracts

The current UUID keyset list is not a multi-request consistent snapshot or durable change feed. A concurrent earlier UUID can be discovered on the next complete rescan; no deletion or access-loss inference is made from omission. This does not yet certify strict no-loss discovery under concurrent writes. Core collection itself is repeatable/complete and certified.

Generic403/404/503 is not an authoritative access-revision revocation. Existing Core revoke must receive legitimate owning evidence; a precise status/read contract may still be needed. No stale rights are restored by discovery and no unavailable response is reported Synced. Full A/B/Creator/revocation, downstream Trip metadata, six-family differential and Import-to-Pull remain pending.

AD5 supplied one complete nonrevoked Core certificate for existing Trip825f79b2. The Saved summary badge alone means absent local creator container; its click/actual graph/Reader issue remains to reproduce. Do not invent a local Trip or grant Edit to remove that badge.

Shared DEV Host/SQL/Source windows remain Import-owned. No Backend deployment/Schema/RLS/Role change in this candidate. Independent Auth boundary review pending; physical Native acceptance pending.
