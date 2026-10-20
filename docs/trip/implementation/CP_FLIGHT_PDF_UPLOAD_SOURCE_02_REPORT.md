# SOURCE-02 Final Readiness Addendum — allocation resolved

2026-10-13 · **READY FOR SEPARATE CANONICAL INTEGRATION APPROVAL — STOP AT OWNER REVIEW**

Owner has assigned Flight `20261013000100_source_pdf_upload_authority.sql` and TTR
`20261013000200_core_ordinary_order.sql`. This addendum supersedes the allocation
BLOCKED status in the preserved frozen report below. It does not approve Agent 2's
TTR implementation or authorize canonical merge/push.

## Exact pins, ancestry and unchanged inputs

- Local main: `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`; cached origin and actual remote main:
  `b4ddd27d2352350b6d16617543d0f17a715dc077` (read-only ls-remote reconfirmed).
  Canonical has not advanced from the previously tested baseline.
- Accepted Source implementation `1398b2bc1bf49755b31fc74c5f67dbb0534895cc`, tree
  `4b151dd4ac5e04117f26c0889893adb456292fe8`, exact 12-path manifest unchanged.
- Accepted frozen integration HEAD `9e80142a7e5797c68dd36da659c058517cda3d5f`, tree
  `c612ebced45fb150e47459e94674e3afd5242adb`, exact 14-path manifest verified.
  Merge implementation remains `1a67a217522a4fdc851dbef3f348bf3e7a121bc3` / tree
  `95c792120f28626706a3d52c88547322ea9071ca`.
- All recorded prepared hashes verified before this documentation update; all accepted
  non-handoff production, fixture, runner, contract and test blobs remain exact. Source
  SQL SHA256: `a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`.
- Existing 14-path manifest JSON is preserved byte-for-byte (SHA256 `6e9dc22aae04c1219f3eee5df081d5e394667d8d4fab397cbb65304a7cb6a60c`);
  it records the earlier frozen BLOCKED checkpoint. Path scope remains the same 14.
  This follow-up changes only this report and a prepended current-state readiness note;
  final documentation tip/tree are delivered by Git in the final handoff. No production
  tree reconstruction, cherry-pick or Source modification.
- Current main, SOURCE-01, SOURCE-03, DL4, Flexible, TTR, Native and PDF joined baselines
  remain ancestors of the candidate. G2-FLEX-02/Focus, Native, LLM and DEV TEXT inputs
  are identical to the previously verified candidate/baseline. Canonical handoff notes
  and five concurrent dirty/untracked files are preserved exactly.

## Migration allocation and newly executed check

Read-only scan of local branch/remote-tracking refs and registered worktree migration
filenames finds only the assigned file variant for each of `00100` and `00200`.
No other migration uses either version in the inspected scope. Flight retains repository
ordinal96 after 95 exact historical migrations. The existing schema manifest stays unchanged;
no Hosted migration registry was queried or installed.

TTR isolated worktree:
`/private/tmp/otr-cp-ttr04a3-core-order-02-20261013`, observed HEAD
`dbeea4b19107ae12b22971d358c75d8de932091a`. Its `00200` SQL retains SHA256
`45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`, matching the
former conflicting `00100` bytes. The old TTR filename is absent from the inspected
current worktrees/refs. Neither TTR migration nor its references/fixtures were modified,
staged, renamed, deleted or imported by this workflow. Agent 2 may continue updating its
isolated work; these observations do not constitute acceptance or broader TTR validation.

One newly executed **installation-only** check used an SHA-verified read-only TTR snapshot
outside the repo and a fresh UUID-owned disposable PostgreSQL clone. Installed order:
Core85–92 → LLM001 → PDF002 → Source Registration003 → Flight `20261013000100` →
TTR `20261013000200`. Installation PASS; TTR adds one new function, changes none of
378 preexisting Source/Core definitions; Source PDF upload ACL/RLS and CLOSED checks
PASS. Core/Source/PDF/upload/LLM runtime gates remain CLOSED. No dependency on TTR is
introduced into Flight. The disposable clone was removed; TTR `00200` is **not** in the
Flight candidate. This is compatibility evidence, not TTR integration/acceptance.

## Reused evidence, preservation and remaining gates

Reused: latest accepted **49 SQL PASS**, **227 TypeScript PASS / 3 skipped**, typecheck,
Backend build, touched-file lint, UI guard and formatting. Relevant Source SQL, DTO,
fixtures, runner, tests, dependency manifests and canonical G2/Native/LLM/TEXT inputs
are exact; only migration allocation external to Flight changed. Broad regression was
not rerun. New checks were frozen hashes/manifests/ancestry, allocation scan, installation
order/function/ACL/CLOSED assertions, concurrent preservation, Python syntax and diff checks.
Evidence: `/private/tmp/cp-flight-pdf-upload-source-02-resumption/`.

The prior nonreproducible `source_pdf_stage_shape` pre-dispatch failure remains
**unresolved**. An unchanged rerun passed, but cause was not proven; this addendum does
not classify it as fixed or waive the validation caveat. Provider had not dispatched and
no unsafe acceptance occurred. Earlier logs and clock-probe limits remain in the frozen
report below.

Agent A still needs a reviewed Provider Capability: fixed private endpoint/bucket/key,
one create-only dispatch without retries/upsert, trustworthy exact-request terminality
covering all delegates, bounded independent GET/hash/MIME, durable private staging and
quota/cleanup handling. SQL/digest/schema and synthetic evidence do not certify Supabase
remote terminality. Missing terminal evidence remains UNKNOWN, with no automatic retry,
VERIFY/registration or cleanup and no universal post-crash recovery claim.

Backend Runtime dependencies remain authenticated HTTP, private Source principal/role
review, Node pg/TLS, storage/credential custody and explicit runtime activation approval.
Agent B retains durable plan/original bytes, receipt-first uncertain-response recovery and
Source-sealed catalog handoff dependencies. Hosted, real Provider, paid LLM, DEV DATA,
Production and unrestricted Native runtime remain CLOSED/out of scope. No canonical
merge/push in this checkpoint. Recheck canonical HEAD, allocation and exact tip before
any separately approved integration if other workflows advance.

---

## Historical frozen readiness report — allocation status superseded above

# CP-FLIGHT-PDF-UPLOAD-SOURCE-02 Integration Readiness Report

2026-10-13 — **BLOCKED migration allocation / STOP AT OWNER REVIEW**

Branch `codex/cp-flight-pdf-upload-source-02`; frozen isolated merge candidate
`1a67a217522a4fdc851dbef3f348bf3e7a121bc3`, tree `95c792120f28626706a3d52c88547322ea9071ca`. Parents are current canonical `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016` and accepted
`1398b2bc1bf49755b31fc74c5f67dbb0534895cc`. Candidate has exactly the accepted 12-path
scope; this report/manifest are a documentation-only follow-up (combined 14 paths).
No canonical merge/push, Hosted/storage/provider or Native runtime activation.

## Accepted bytes and current baseline

Accepted tree `4b151dd4ac5e04117f26c0889893adb456292fe8`, exact 12-path manifest,
all ten recorded SHA256 hashes verified before merge. All **11 non-handoff paths**
retain exact accepted Git blobs after merge, including authority SQL, DTO, fixture,
runner and SOURCE-01 reports. No Source authority, parser, receipt or trust rule changed.
All 1707 canonical paths outside accepted scope retain exact baseline blobs:
G2-FLEX-02, Flexible, TTR, Native, LLM, DEV TEXT and Source VERIFY/REGISTER/SEAL preserved.

Local main `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016` includes new G2-FLEX-02. Cached/actual remote main remains
`b4ddd27d2352350b6d16617543d0f17a715dc077`. Source01 base `a878be3` is an ancestor
of current main. SOURCE-03, DL4 `eb4c8eb`, Flexible `1114ccc` and TTR remain ancestors.
Five canonical dirty/untracked file hashes are captured and preserved; no other worktree
was modified. Current canonical notes remain untouched.

## Exact conflicts and allocation blocker

Only Git content conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`, concurrent top
prefixes. Resolved by adding a BLOCKED SOURCE-02 header, retaining the accepted Source01
prefix and preserving current canonical G2/TTR notes verbatim as suffix. Shared SQL
fixture/runner have no competing main edits and remain byte-identical to accepted Source01.
No production/shared port conflict and no Stage1/Native branch independently merged.

Within candidate, upload timestamp `20261013000100` is unique and repository ordinal96:
Core85–92 → LLM `20261012000100` → PDF `20261012000200` → Source Registration
`20261012000300` → Upload `20261013000100`. All 95 historical migration files and
historical schema manifest remain exact; that snapshot was not regenerated or claimed
installed in Hosted. Repository ordinal is not Hosted migration-history equivalence.

**Cross-workflow registry collision discovered during allocation checks:**

- Accepted Source: `supabase/migrations/20261013000100_source_pdf_upload_authority.sql`;
  SHA256 `a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`.
- Concurrent TTR untracked file:
  `/private/tmp/otr-cp-ttr04a3-core-order-02-20261013/supabase/migrations/20261013000100_core_ordinary_order.sql`;
  SHA256 `45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`.
- Both allocate Supabase migration version **20261013000100**. TTR file is not in current
  main and was not imported, edited, staged, deleted or renamed. Accepted Source file
  was not renumbered. Candidate is therefore **not ready for canonical integration**.

Owner must resolve timestamp ownership with the TTR owner, or separately approve a
Source file allocation change/new exact manifest. This checkpoint makes neither decision.
The frozen candidate remains reviewable; no production authority changes are proposed.

## Combined verification and limits

Seven latest successful disposable SQL modes total **49 PASS**: upload security/recovery/
PNG lifecycle29, PDF upload → unchanged VERIFY/REGISTER/SEAL → qualified Flight/Core/Day1,
real local HTTP/Node pg/TLS TEXT1, ORIGINAL TEXT joined Flight1, Native REVIEW13,
Core Source3 and Core mutation/receipt1. UUID-owned clones were removed; no real provider
or supplier files used. SQL checks show CLOSED gates, NOLOGIN/private ACL/RLS, expected
migration order, 378 installed function definitions unchanged during each scenario.
Accepted upload changes only the existing PNG inventory predicate, as reviewed in SOURCE-01.

Focused15 TypeScript suites **227 PASS / 3 skipped** (owning SQL cases separately run),
including current G2 snapshot/Focus/render/composition/Lab registration. Typecheck,
Backend build, touched-file lint, UI guard, format, Python syntax and diff checks PASS.
Two qualified Items retain UUIDs/semantic revision2 across SQL/read2/collection/SQLite54
and production Day; replay/lost responses/offline reopen, manual protection and private
Source fences PASS. Ordinary Quartz/PDFKit remains REVIEW; Native created no accepted
Items or seals. Exact run UUIDs/receipts are in the accompanying manifest.

**Initial validation deviation is retained, not hidden:** first concurrent security run
passed28/29; the `attemptGeneration` negative case failed in its setup stage with
`source_pdf_stage_shape`, before provider dispatch, at
`trip_source_pdf_upload_execution` STAGE update. Accepted bytes were not changed.
One fresh unchanged rerun passed29/29. A read-only 200,000-sample server clock probe saw
zero negative deltas. A backward clock during seal is an inference from the stage shape,
not proven; the first failing clone had already been removed by the owned runner.
No unsafe success or authority bypass occurred. This nonreproducible fail-closed
pre-dispatch failure remains a validation/environment caveat for Owner Review.
Logs and allocation/preservation evidence: `/private/tmp/cp-flight-pdf-upload-source-02/`.

## Agent A/B and runtime gates

Use accepted `src/domain/trip/sourcePdfUploadAuthority.ts` and
`docs/trip/CP_FLIGHT_PDF_UPLOAD_AUTHORITY_V1.md` unchanged. Agent A still owns authenticated
Backend HTTP/Node pg/TLS, bounded private staging, fixed private provider adapter, one
create-only dispatch without SDK retry/upsert, independent GET/hash/MIME and trustworthy
remote terminal evidence. Agent B owns durable plan/original retention, uncertain-response
replay and Source-sealed catalog consumption. No independent DTO/trust redesign allowed.

Synthetic terminality is not evidence of real Supabase semantics. Real provider completion,
private storage/credentials, runtime role bridge, Hosted installation, Native integration
and real-PDF/device execution remain separately gated. UNKNOWN retains quota and may
persist indefinitely. No remote orphan deletion or universal crash recovery claim.
Full repository tests, real Provider and Native runtime were not run. Allocation conflict
must be resolved before any canonical integration decision.


**READY FOR SEPARATE CANONICAL INTEGRATION APPROVAL**
