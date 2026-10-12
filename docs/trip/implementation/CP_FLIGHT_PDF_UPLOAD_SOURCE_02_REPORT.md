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
