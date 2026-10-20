# Ledger 2.0 Stage 9 Acceptance

Status: Complete

## Approved payload

- Transform: `stage9-europe-replay-v3`
- Mapping: `legacy-ledger-to-ledger2-v1`
- Allocation: `ledger-largest-remainder-v1`
- Normalization: `legacy-equal-rounding-normalization-v2`
- Dataset SHA-256:
  `be1fce8c0a4a681e2f520484401317a9ba3611cab1d0636f1c07bee754268a49`
- Classification: 126 ACCEPTED, comprising 68 INCLUDED and 58 EXCLUDED;
  0 DRAFT, 1 source row unloadable, and 0 import Review findings.
- Destination: 1 Journey, 8 members, 126 Expenses, 531 participants, 531
  splits, 126 rate snapshots, and 126 active `LEGACY_IMPORTED` valuations.

## Recovery proof

- Private backup format: PostgreSQL plain SQL schema plus COPY-based data for
  the complete Hosted Dev `public` schema.
- Schema backup: 467,025 bytes; SHA-256
  `95bf8ff80710e967a9cce28039e859f87bb23b6af47e19fbfd1261a8a9d89f34`.
- Data backup: 1,310,437 bytes; SHA-256
  `af6885826c5ec8138f53ab4e2adbedd6e98e106dc01f2b760ee2d7e227a327a7`.
- The backup was restored into an isolated local Supabase environment. All 92
  `public` tables and 1,860 rows matched the pre-load Hosted Dev counts and
  deterministic content digests.
- All 681 `public` constraints were validated; 275 foreign keys had zero orphan
  rows. The 21-entry migration ledger, latest migration, and sequence state
  matched. Restore-sensitive financial table fingerprints matched exactly.
- The backup intentionally excludes Auth credentials/sessions, Storage object
  binaries, Storage/non-`public` metadata, database roles/passwords, service
  keys, and environment files. Placeholder Auth UUID rows were used only in the
  disposable restore to satisfy existing public foreign-key references.

## Hosted Dev load

- Exact project/host, migration, compatible Backend, recovery, dataset, raw,
  mapping, manifest, privacy, and empty-target preflight gates passed.
- The guarded backend-owned import committed in one database transaction.
- Independent read-back matched 1/8/126/531/531/126/126 and 68/58 exactly. All
  126 original and settlement split sums reconcile; the INCLUDED-only balance
  vector is zero-sum; all 69 normalized rows retain v2 provenance.
- No DRAFT, PaymentRecord, receipt, Household, canonical Settlement, Transfer,
  Payment, historical audit, or import Review finding was created.
- The second canonical replay produced zero inserts, updates, revision changes,
  or additional change-feed effects and retained the same financial fingerprint.
- Privacy/redaction and deterministic-ID/duplicate checks remained zero-hit.

## Mobile acceptance

- Two iOS Release Simulator clients used normal Dev Auth, Backend bootstrap/pull,
  SQLite v17, and repository/UI paths; SQLite was not injected.
- Both clients hydrated 126 unique Expenses, 68 INCLUDED / 58 EXCLUDED, 531
  participants/splits, 126 active valuations, and 126 distinct rate-snapshot
  references.
- Spending, Search, and ordinary Analysis included all 126 Expenses. Settlement
  preview used exactly 68 INCLUDED inputs, excluded 58 with
  `EXCLUDED_FROM_SETTLEMENT`, and remained zero-sum. My Ledger server/cache
  results matched.
- Incremental pull returned no changes and created no duplicates. With Backend
  and Metro stopped, both Release clients cold-started from cached SQLite and
  reproduced the same counts.
- The approved dataset has one linked organizer and seven unlinked members, so
  both clients used that same approved linked identity. The existing unmapped
  creator identity received the expected read denial; no mapping was inferred.

## Notes and retention

- The only verifier defect encountered was equivalent UTC timestamp text using
  different `Z` and `+00:00` serialization. Normalizing both to UTC instants made
  every Expense field match; no Hosted Dev data was repaired or rewritten.
- Private raw, mapping, transformed, backup, manifest, and load/Mobile receipts
  remain outside Git until the approved rollback window expires.
- Production was not mutated. No rollback was executed. Stage 10 has not begun.
