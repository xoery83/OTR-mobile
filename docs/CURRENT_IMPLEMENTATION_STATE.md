# Current Implementation State

Date: 2026-10-08 (Pacific/Auckland).

## Capture C2 canonical integration — prepared / independent review PASS

- Owner-authorized isolated worktree
  `/private/tmp/otr-c2-canonical-integration-20261008`, branch
  `codex/c2-canonical-integration-20261008`. Ordinary no-commit merge: exact first
  parent `56a7ab8f08ea973eb777fa00c8e6393057c1193c`, accepted C2 second parent
  `914e854cba7c2c97cfec7243047a06cadcc82c05`, common ancestor
  `b6daffecedab1616b173fde3f5e2de5d54770eff`. Fetched origin/main and actual main
  matched the first parent before preparation. HEAD remains there; no commit,
  push or main advancement is authorized.
- Only the shared handoff conflicted. Capture and Operations catalog entries and
  continuation tests retain both accepted sides. The sole additional test change
  updates P4a's full-registry diagnostics schema expectation from50 to51; its
  read-only and Account assertions remain. Accepted C2 runtime bytes and all
  canonical-only production paths are preserved. C3's uncommitted work is excluded.
- Fresh targeted34 files /727 PASS and separate terminology1 file /6 PASS.
  SQLite51 fresh/50→51 FK ON/OFF, cold recovery, Account/offline, P4a read-only and
  C4a dormancy regressions pass. Typecheck, lint/UI guard, Backend build, changed-file
  formatting and whitespace PASS. Independent7 files /334 PASS; zero findings.
- Exact canonical-main archive:1,214 tracked files verified; full serial217 files /
  2,818 tests:2,802 PASS,1 FAIL,15 SKIP. Integrated full serial219 files /2,864:
  2,848 PASS,1 same FAIL,15 SKIP;46 additional passes, zero new failures. The current
  shared architecture-boundary scanner failure sees a data/sync import in
  `LocalOperationsDiagnostics.test.ts`; identical normalized failure messages.
  This differs from C2's historical b6 diagnostic below. No full-suite PASS claim.
- Preservation PASS:25 C2 paths exact, both shared-file clean unions exact,
  1,197 canonical paths and88 historical migration files exact; registry changes
  only by SQLite51 import/entry. Eight protected worktree fingerprints unchanged.
  Results overlap and are not added. Evidence:
  `architecture/OTR_CAPTURE_C2_CANONICAL_INTEGRATION_REPORT.md` and
  `architecture/OTR_CAPTURE_C2_CANONICAL_INDEPENDENT_REVIEW.md`.
- Next: STOP for Owner review of the prepared merge. No commit/push/main advancement
  is authorized. Only local disposable SQLite fixtures were used; no Hosted
  operations, R3 migration rerun, device change, provider activation or new scope.

## Capture C2 — final Owner/device acceptance PASS

- Accepted commit `914e854cba7c2c97cfec7243047a06cadcc82c05`, sole parent
  `b6daffecedab1616b173fde3f5e2de5d54770eff`. Owner accepted durable local intake,
  SQLite51, native Files/Photos submission, atomic CP11 binding, idempotent recovery,
  offline acceptance and scoped Job read/reopen. The authorized local closure is
  complete. C3 Activity, processing and canonical/provider gates remain separate.
- Owner tested mixed Files/Photos4/4 saved, iCloud acquisition, duplicate-submission
  disabling, Hide/navigation/restart and offline submission. Read-only audit found
  7 Jobs /11 ACCEPTED Inputs /11 Captures /7 payloads, with verified original bytes,
  hashes and Account scope; no integrity violations. Offline2/2 is Owner-attributed,
  not inferred network telemetry. Three identical snapshots and unchanged repository
  list/read/reopen/exact-key recovery passed; Account switching disclosed no other
  Account's Jobs and fresh return reopened the originals, with zero audit writes.
- Signed embedded Release was overwrite-installed on Owner iPhone16Pro /iOS27.0.1
  under unchanged `com.xoery.otrmobile`, preserving identity and data. Device-copy
  rehearsal preserved all old rows/tables; actual50→51 startup preserved9,242 rows
  and historical migration records.83 prior tables had equal typed-row projections;
  normal startup changed only scan timestamps/generation in one health-state row.
  No new device build/install or device acceptance is performed by this integration.
- SQLite51 adds exactly two tables: immutable1:1 distinct Batch/Job header and ordered
  Input manifest. Explicit Add freezes submission/context/Input/replay identities;
  full-roster registration precedes native reader I/O. Registration retains intent;
  only atomic CP11 original-plus-binding acceptance means bytes are saved.
- CP11 quotas/hash/exact-byte dedup remain shared through a transaction-local
  repository seam. First verified pins persist before acceptance. Lost registration,
  pin or acceptance ACK requires exact readback; unverifiable outcomes retain the
  same request. Bound originals/header/Inputs remain deletion-protected, including
  foreign keys OFF. There is no separate byte store or destructive cleanup.
- Native handles are bounded/read-only/transient. Hide never cancels durable work
  or auto-closes. Pinned recovery requires exact original bytes; unpinned recovery
  is a new explicit submission linked by immutable same-Account older-Input
  `continuesFromInputId` / `continues_from_input_id`. Forward/reverse lineage is
  verified and grants no equality, replacement, acceptance or processing authority.
- Read/list/reopen/exact-key recovery/resume derive truthful counts/actions;
  processing stays NOT_INSTALLED and semantic results zero/null. Every operation
  retains one Account generation and checks current revisions. Fresh A can reopen
  A's Job after A→B→A; old callbacks cannot regain authority. Trip prior is passive,
  nullable and never assignment; C2 originals enter INBOX.
- Normal Capture opens an empty new tray. Existing `/capture?jobId=<UUID>` and scoped
  repositories reopen retained Jobs; C3 Activity discovery is not installed.
  Native provider URI lifetime/fidelity and accessibility/visual matrices remain
  unverified beyond the stated Owner acceptance; inaccessible handles fail safely.
- Historical C2 validation:18 files /510 PASS; independent10 files /200 PASS and
  final handoff2 files /47 PASS, zero remaining CRITICAL/IMPORTANT/MINOR. Full suite
  212 files /2,737 tests:2,721 PASS,1 FAIL,15 SKIP; verified b6 base210 files /
  2,691 tests:2,675 PASS,1 same FAIL,15 SKIP. Existing architecture-boundary scanner
  failure sees the forbidden-module literal in the staging-test regex. No global
  PASS. Typecheck/lint/UI/terminology/build/changed-file format passed; full format
  retained25 exact-base issues. Current-main integration must establish its own
  baseline rather than inheriting these counts.
- Reports: `architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md`,
  `architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md`,
  `architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md`; decision:
  `adr/2026-10-08-capture-c2-local-intake.md`. Historical pending sections remain
  unchanged and are superseded by their explicit final Owner acceptance records.

## Canonical P4a and C4a — accepted and retained

- P4a `4f97bb6f96daaab7f96f19d192683f63846a413b` and C4a
  `f3c54c3dbeda1a0613fade89c560718231c83db6` share b6daffe parent. Ordinary C4a
  integration `c2f1524aa492ecf32982de6a52c7166bf45715e0` retains those parents in
  that order. Both accepted runtime slices, original reports and rechecks remain.
- P4a DEV/Debug-gated memory-only Operations observes Data Health, SQLite50
  continuation metadata and sync_operations with six states, explicit coverage,
  independent semantic/operator attention, nullable usage/cost and compatible age.
  It retains adopted-v2 read-only identity lookup and initialized-DB reads; normal
  Auth adoption remains. Display never opens/migrates the DB, wakes listPending,
  refreshes Auth, runs/repairs Health, resumes/dispatches or recovers provider work.
- Responsibility labels are validated for all non-shadow attempts; corruption
  makes that source unavailable. Current terminal FAILED requires attention despite
  retained RUNNING; older UNKNOWN dominates. Both locales distinguish successfully
  empty readable sources from denied/unavailable sources. Account generation,
  focus/active/supersession/cleanup fences include A→B→A; missing cached Trip actor
  denies continuation IDs/counts. No evidence or Import authority is disclosed.
  C2 availability does not automatically add intake coverage to this projection.
- P4a historical17 files /297 PASS; independent targeted5 files /24 checks PASS,
  F1–F6 closed. Original negative findings and appended corrections are retained in
  `architecture/OTR_PLATFORM_P4A_LOCAL_OPERATIONS_BUILDER_REPORT.md` and
  `architecture/OTR_PLATFORM_P4A_LOCAL_OPERATIONS_INDEPENDENT_REVIEW.md`; decision:
  `adr/2026-10-08-p4a-read-only-local-operations.md`. P4b/P4c remain gated.
- C4a stays dormant strict primitive JSON-text pure assessment. Caller INDEPENDENT
  assertions add DEPENDENCY_UNKNOWN; observed evidence does not clear unproven
  closure. Lossless grammar rejects duplicates before schema/hash; exotic objects/
  Proxies reject without inspection. No Node domain import, runtime composition,
  durable adapter, preparation/domain admission or mature actionable attention.
- C4a historical4 files /135 PASS (87 C4a),16 Builder targeted checks and25 independent
  checks PASS. C4a canonical smoke21 files /432 PASS, static/build/format and90
  preservation checks PASS. Original findings and final R1/R2 PASS remain in
  `architecture/OTR_PLATFORM_P2_C4A_IMPLEMENTATION_REPORT.md` and
  `architecture/OTR_PLATFORM_P2_C4A_INDEPENDENT_REVIEW.md`; integration evidence:
  `architecture/OTR_PLATFORM_P2_C4A_CANONICAL_INTEGRATION_REPORT.md`.
  Durable C4/C5 and new authority remain unauthorized; C2 is not their composition.

## R3 Hosted DEV rebuild — final Owner acceptance PASS / retained closure

- Canonical closure `56a7ab8f08ea973eb777fa00c8e6393057c1193c` has sole parent
  c2f1524. Owner accepted CLOSED-only same-project rebuild, one Ledger forward
  correction and bounded fixtures. Original rebuild and forward each committed
  once; never rerun. This integration makes no Hosted request.
- Last accepted DEV `tuqigdxrvrerfewsxqgm`:36 Hosted checks PASS; catalog
  `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`, function
  `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
  Historical68 records, R3 lineage, roles/FORCE RLS, Auth/Storage and CLOSED gates
  passed. No invented Hosted Server69–84 rows; Git migration history is separate.
- Accepted fixtures:Profiles2,Trips2,members4,Ledger settings2,Expenses2,uploaded
  Receipt1,finalized settlement1. NZD600-minor transfer OPEN/unpaid, OCR PENDING,
  provider calls0, Backend development/ok. Last verified Auth users12/sessions595,
  Storage43: original42 retained plus1 synthetic receipt. These are historical
  acceptance facts, not newly verified current Hosted observations.
- SQL origin a817e8e, rebuild approved canonical b6daffe, forward local base4f97bb6.
  R3 SQL/evidence/tests and environment/runbook bytes remain canonical. Reports:
  `architecture/OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md`,
  `architecture/OTR_R3_FRESH_TRIP_LEDGER_INITIALIZATION_CORRECTION_REPORT.md`,
  `architecture/OTR_R3_DOCUMENTATION_CLOSURE_PROPOSAL.md` and
  `../supabase/dev-forward/r3-v1/README.md`.
- Old device outboxes remain quarantined. Device first-sync/client re-enable is
  NOT accepted/authorized. No replay/wipe/reset/logout/rebind. C2 local device
  acceptance does not authorize R3 device synchronization or provider activity.

## Accepted foundation, schema and critical boundaries

- Local registry1–51; historical SQLite1–50 sources remain exact. SQLite48 owns
  originals,49 Import admission,50 continuation/attempts;51 only local submission.
  Git Server1–84 remains exact, tail
  `20261007000100_flight_dev_dispatch_foundation.sql`, SHA-256
  `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
  No Server85 or SQLite52. R3's68 Hosted historical records remain distinct.
- C1 Owner/device acceptance at79237cbd is retained in canonical b6daffe with all
  seven original commits. Joint P1/C2 Revision1 and final lineage naming follow
  `adr/2026-10-08-c1-integration-owner-decision.md`; original PROPOSED documents
  remain historical, not fabricated acceptance evidence.
- CP13A/B Flight interpretation/closure/preparation, CP14 final CLOSED A2/C2/B2,
  CP15B F1–F4/R1-C1 and LIVE-W remain accepted. SQLite50 continuation C2 is separate
  from Capture C2. Five generic C queue dispatch denials remain unconditional.
  READY/preparation is not accepted canonical output. No new Source/Run/Import,
  Event/Ledger authority, scheduler, queue drain, startup/reconnect polling or upload.
- CP15B/LIVE-W startup stays CLOSED; Linux anchored custody, exact one-call mark/
  recovery, portable fixture isolation and strict input grammar remain. LIVE-1,
  credentials/provisioning/monetary policy, Apple/vision/shadow/fallback/public B2
  activation and production access remain unauthorized.
- C3 Activity, Guest/adoption, durable semantic assessment, Review/Banner/OS
  notification, Wallet/Photo cloud, Ledger effects and final Experience shell
  require separate decisions. Source IO_UNKNOWN/provider terminality and safe IO
  retry remain blocked; retention/completion never authorizes evidence release or
  retry of unknown execution. Current Account/Trip/material authority is independent
  of retained evidence. Cached valid sessions keep offline launch; background auth
  failure pauses sync rather than blocks access.
- Read this handoff first, then task-relevant reports/contracts. Use PRODUCT,
  ARCHITECTURE, DATA_MODEL, API_CONTRACT, OFFLINE_SYNC and accepted Capture/Import
  design documents; no legacy Web reaudit or redesign. Future UI/copy uses
  `architecture/ui-foundation.md` and `architecture/OTR_TERMINOLOGY_GLOSSARY.md`.

**STOP — C2 INTEGRATION PREPARED FOR OWNER REVIEW.**
