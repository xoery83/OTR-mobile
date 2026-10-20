# Publication Membership Independent Review

Date: 2026-10-09 (Pacific/Auckland). Role: Independent Reviewer.

**Verdict: PASS WITH REQUIRED CORRECTIONS.**
**Findings: CRITICAL 0 / IMPORTANT 2 / MINOR 1.**
**Ready for Dormant-Code Owner Acceptance: NO.**

What this change does: It retains a complete Run/Candidate membership commitment
through a CLOSED private-read handoff and exposes dormant local installation and
validation. It detects missing siblings and Inputs, preserves derived material
identity and checks current Capture assignment. Two consistency checks still need
correction; no active product path or publication authority was installed.

## Reviewed source and acceptance evidence

Worktree:
`/Users/xoery/.codex/worktrees/publication-membership-builder/otr-mobile-canonical`.
HEAD independently verified as the exact expected base:
`f7115dc288aff7f0a252bf80f53b0f2b626a7534`.
This is an independent review in a separate chat from the Builder; no Builder
implementation edits were made. No remote freshness claim is made or needed for
this exact-base review.

Read the current handoff, repository guide and required project documents, the
Builder report, migration design and `2026-10-08-complete-publication-membership.md`.
External acceptance inputs were read only from their existing isolated worktrees:

| Input                                                              | Worktree                           | SHA-256                                                            |
| ------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| Complete membership preflight                                      | `publication-membership-preflight` | `152a7663fccfe979420fa5d856d103304358c3b84a4914d9306d6c07a3c57145` |
| P2b-A Builder / accepted F1–F4 blocker                             | `p2ba-c2-c4a-adapter`              | `aa896a7e25ae6db72e8e487fd4795f77c4d00b5649310f396751edb1268ef384` |
| P2b-A Independent Review                                           | `p2ba-c2-c4a-adapter`              | `6296183db81ca5a734898fb1c298334307a17416789e4e6ce0346806718a18de` |
| Accepted P2b-B persistence contract                                | `p2bb-snapshot-contract`           | `66406951e3b0278582e280f587793ea46a99e7670ae105eeba9c175b8b9279ba` |
| P2b-B Builder report, including correction addenda and limitations | `p2bb-sqlite-builder`              | `2e989fa7abf10214c085838eadc21eff3a05da396e1c914ad35cf3909f23dc40` |

The external documents live under each worktree's `otr-mobile-canonical/docs/architecture/`.
The first three external hashes for the accepted P2b-A reports and P2b-B contract
match the preflight's recorded acceptance inputs. Their original status and
limitations are retained; this review does not accept their integration.

Compared all **1,241 tracked files** against exact HEAD blobs. Exactly four tracked
files differ: current handoff, Flight interpretation, Capture Source admission and
Import admission. Six Builder files are untracked: the ADR, Builder report,
migration design, membership contract, repository and repository test. These match
the Builder's ten-path inventory. Review delivery adds only this report.

All **90 tracked migration/registry paths** under `src/data/db/migrations*` and
`supabase/migrations/` remain exact base bytes. Registry SHA-256:
`19a157ab72302015ea51d508dc7d8f16bd395f0618da8218015c56da056e1c25`.
The registered local chain remains SQLite1–51. No SQLite52/53 definition,
registration, allocation, migration-history change, new DDL execution or Server
migration was introduced by this work. The proposed one-column/four-guard SQL was
inspected as text only.

## IMPORTANT findings — required corrections

### F1 — Run Input Sources are not checked against the committed Run scope

Locations: `src/data/repositories/tripPublicationMembershipRepository.ts:59–88`.
Related validator: `tripImportCatalogRecovery.ts:163–197`.

**What this is:** The commitment separately binds the Run's Source scope and its
complete Input digest. The existing server publication command requires every
Input Source to be in that scope.

**Problem:** Neither `project` nor the reused snapshot validator enforces that
relationship. The independent probe adds a second same-Account/same-Trip Source,
its valid manifest and original, and an unreferenced Input for that Source. It
keeps the Run scope restricted to the first Source and recomputes the correct
Input digest. CLOSED projection, installation and owning read all succeed. The
returned scope excludes the second Source while verified roots include its Input.

**Fix:** Reject any Run Input whose `source_id` is absent from that Run's
`scope_source_ids` before sealing or accepting membership. Add this correctly
hashed out-of-scope negative to the owning membership suite. Do not require every
scoped Source to have an Input unless the owning contract separately requires it.

**If skipped:** Internally inconsistent scope and material authority can be
certified as a complete publication. This is a synthetic inconsistent-catalog
probe, not proof of an exploitable Hosted gateway or a supported server writer
producing the case. The existing protected writer rejects it; that does not make
the new local owning consistency check complete.

### F2 — Capture support accepts caller choice among distinct original roots

Locations: `tripPublicationMembershipRepository.ts:114–115,432–456`;
`captureSourceAdmissionRepository.ts:97–104`.

**What this is:** A valid derived Input may have different bytes from its original.
The accepted preflight also requires unambiguous resolution to a C2 occurrence
before current Capture support is admitted.

**Problem:** `project` returns all original roots, but `readCaptureSupport` accepts
any binding whose original is merely included in that list. The independent probe
creates two retained originals in one Source manifest, derives one child from both,
and creates two distinct valid assigned Captures/ADMITTED bindings, one per original.
The same Run Input successfully returns Capture support for either caller-selected
binding. It never distinguishes unresolved multiple roots from uniquely admitted
occurrence support. No production trigger is disabled for this reproduction.

**Fix:** Preserve legitimate multi-parent publication ancestry, but withhold the
single-Capture support result when it cannot uniquely resolve the bound original.
For this seam, reject multiple distinct roots before accepting a binding; a DAG
whose paths converge on one original must remain valid. Any richer mapping needs
explicit C2-owned complete-occurrence validation, not caller selection or byte
equality. Add two-root/two-binding rejection and convergent-DAG positives.

**If skipped:** Future consumers can treat a partial, caller-selected original as
unambiguous support for combined derived material. This does not prove current C2
intake corruption or active semantic disclosure: C2 occurrence/header/roster
composition is still uninstalled and separately gated. That integration gate must
not be mistaken for an already satisfied ambiguous-ancestry check.

## MINOR finding — transaction guarantee needs qualification

### F3 — Only the membership store enforces the active-transaction precondition

Locations: `tripImportAdmissionRepository.ts:526–533,706–709`;
`captureSourceAdmissionRepository.ts:79–90`.

The membership transaction store rejects calls outside an active transaction and
checks Account/Trip admission. The newly exposed Import and Source stores rely
on their documented caller preconditions. They do not provide the same rejection
guarantee claimed broadly in the Builder report.

Independent probes show:

- With FK OFF, direct Import `transactionStore.applyCatalogs` writes a valid
  catalog without a transaction, even after the active Account changes.
- With FK ON and an already installed catalog, direct apply updates the Source
  revision, then fails on a changed immutable Run extractor pin. The earlier
  update remains committed because no caller transaction exists.
- Direct Source `assertCurrent` returns a binding read set outside a transaction
  after cached Trip admission is removed. It checks Account, but relies on the
  membership caller for Trip and transaction admission.

These deliberately violate the internal stores' caller contract. They are not a
bypass through the supported membership/public Import repository methods; the
current membership caller supplies the missing fences correctly. There is no
active runtime caller of these new seams. Accordingly this is a MINOR contract/
misuse hazard, not an active security or public-apply regression.

Qualify the guarantee explicitly at Owner acceptance, or enforce active transaction
and current Account checks at the exposed store boundary while retaining caller-
owned serialization/gating. Before future composition, every caller must use the
same database and existing Account gate; no nested public repository call or
unscoped statement may substitute for that contract.

## Verification and negative reproductions

Fresh affected regression run: **12 suites / 784 tests PASS**, including **34
membership tests**. Independent external harness: **27 tests PASS**. Assertions
that confirm F1–F3 are defect reproductions, not corrected-behavior passes. Counts
are separate; repeated exploratory runs are not added to final coverage.

| Review requirement / challenge                    | Observed result                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict canonical envelope, namespace and identity | Duplicate JSON keys, unknown body/member fields, noncanonical bytes, bad hashes/namespaces, wrong version, duplicate/unsorted members and oversized input reject. Rehashed wrong Account/Trip/Run/generation/operation/scope/proposal bindings reject owning read.                                                                                            |
| Trusted CLOSED handoff                            | Missing transport rejects; fabricated/copied handles reject; foreign Account projection and cross-Trip handle installation reject. Stale generation and A→B→A handles cannot regain authority. Parsing/sealing a raw catalog checksum does not mint a handle.                                                                                                 |
| Transport trust qualification                     | The RPC is a trusted injected infrastructure dependency. A forged RPC implementation is not an authenticated gateway witness and can provide synthetic rows; WeakMap identity protects handoff provenance within that dependency boundary, not network origin. No installed authenticated transport is claimed.                                               |
| Full Candidate roster                             | Zero/one/two/64 members verify deterministically. Missing unreferenced, PENDING, extra and substituted siblings reject; FK-OFF removal still rejects. No Flight-kind filtering reduces membership.                                                                                                                                                            |
| Complete Run Input digest                         | Missing unreferenced Input and wrong retained/authoritative digest reject. Independent probes exercise all eight Input pin fields and all seven selected descriptor fields used by `flightRunInputDigest`; every mutation changes the digest. Scope-to-Input relationship remains F1.                                                                         |
| Original/derived ancestry                         | Distinct child/original hashes and sizes work through current Capture support. Missing, foreign-Source and cyclic parents reject even with recomputed Input digest. A diamond DAG reaching one original passes. Two distinct original roots expose F2.                                                                                                        |
| Current Capture/Source admission                  | Current assigned Capture with exact revision/payload passes. Future binding revision and later legitimate unassignment reject. Source revision and cached Actor/Trip removal reject the supported owning publication path. Direct Source seam limitations are F3.                                                                                             |
| Coherent installation/read                        | Public membership install and read each open exactly one transaction. Protected RPC occurs before installation; neither install nor read calls it. Same-database mismatch and membership-store use outside a transaction reject. All installed work is SQL/hash work with cached Account lookup; no default refresh/provider/network dependency is installed. |
| Final owning read set                             | `assertCurrent` recomputes the whole scoped catalog/envelope/roots set in the caller transaction; late Source and Trip admission changes reject. Future C2/Capture complete-set comparison must still be composed in the same final transaction.                                                                                                              |
| Replay and recovery                               | Exact replay is neutral; different/corrupt envelopes reject; virtual lost COMMIT ACK recovers the same Run/envelope. Historical replay survives later Source revision without restoring current support. Fresh Run beside an older stale READY Run succeeds; the old Run's current read rejects.                                                              |
| Historical NULL / actual schema                   | NULL is unavailable even for a zero-Candidate catalog. Authenticated projected zero membership is separately valid. Actual SQLite51 installation fails schema admission before catalog writes; historical Import catalog/closure behavior remains available.                                                                                                  |
| Dormancy / owning authority                       | No runtime factory caller, barrel/default export wiring, new provider, scheduler, publication writer, C5/C9/business command, Backend route, configuration/dependency change or activation was introduced. Five existing unconditional C dispatch denials remain tested.                                                                                      |

Source inspection confirms the existing public Import apply merge, immutable
identity, monotonic revision, privacy/material transition, output claim and receipt
checks remain in the extracted body. Its validation now runs inside the existing
public Account-gated transaction; the extra cached Trip check is local. All direct
callers were searched and the affected Import/Source/closure/inbound regressions
passed. The Source change only adds the read seam; existing Source acquisition,
reuse, transfer and command bodies remain unchanged. Flight's only edit widens the
accepted argument shape to the already consumed `pin` fields; its digest algorithm
and bytes remain unchanged. No observed regression in supported existing paths.

## Commands and evidence

Run in the reviewed worktree, using existing installed dependencies through a
review-only temporary symlink; no package installation or lockfile change:

```sh
./node_modules/.bin/vitest run --configLoader runner --cache=false \
  --maxWorkers=1 --no-file-parallelism \
  src/data/repositories/tripPublicationMembershipRepository.test.ts \
  src/data/repositories/tripImportAdmissionRepository.test.ts \
  src/data/repositories/localCaptureInboxRepository.test.ts \
  src/data/repositories/captureSubmissionRepository.test.ts \
  src/data/repositories/intelligenceContinuationRepository.test.ts \
  src/data/interpretation/flightInterpretation.test.ts \
  src/data/interpretation/flightImportIntegration.test.ts \
  src/data/auth/accountRequestContext.test.ts \
  src/data/sync/syncEngine.test.ts \
  src/domain/capture/batchAssessment.test.ts \
  src/data/repositories/flightImportClosure.test.ts \
  backend/src/inboundAiClient.test.ts

./node_modules/.bin/vitest run \
  --config /private/tmp/otr-publication-review-20261009/vitest.config.mts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run lint
./node_modules/.bin/prettier --check .
git diff --check
```

- Typecheck **PASS**; full lint **PASS**, including UI guard **PASS**:
  80 representative files, 473 retained legacy occurrences.
- All ten Builder deliverables and this report pass changed-file Prettier.
  Git whitespace passes. Full-repository Prettier reports **28 existing files**;
  every reported path is unchanged exact-base content. No global formatting PASS.
- Reviewer harness and preservation fingerprints remain under
  `/private/tmp/otr-publication-review-20261009/`. Fixture construction reuses the
  Builder's real SQLite1–51/virtual-column adapter; added assertions are independent.
  Initial out-of-transaction Import probe with FK ON failed the deferred Source/
  manifest constraint; the completed FK-OFF probe and separate FK-ON partial-update
  probe establish the stated behaviors without relaxing production code or guards.
- No full test-suite, Backend build, native/device or production transport result is
  claimed by this reviewer. Existing Builder build results remain historical.

## Virtual-column evidence and remaining gates

The envelope column is absent from this source. Membership tests intercept its
metadata/read/write operations with a process-local Map, while existing catalogs,
queries, guards and transactions use real disposable SQLite1–51. Virtual rollback
and ACK assertions test code ordering; they cannot prove new SQL constraints,
actual schema evolution, committed file durability or cold-restart recovery.
No proposed publication DDL was parsed/executed as a migration by this review.

Remaining Migration/Transport gates:

1. Correct F1 and F2 and independently rerun their negatives; resolve/qualify F3.
   P2b-A F1–F4 remain unclosed at its adapter: this dormant seam is not integration.
2. Owner acceptance of separate SQLite52, verified canonical ancestry/registry and
   separate Owner allocation/authorization of the publication migration. SQLite53
   remains a candidate only; never append a presumed53 to this51 source.
3. Actual fresh/upgrade/FK ON/OFF schema/guard tests; prior typed-row/history
   preservation; failure after ALTER/each guard/history write, safe retry and exact
   byte/storage-class boundaries. Verify immutable install/identity/Run retention,
   compatibility and rollback without destructive down migration or backfill.
4. File-backed committed-envelope close/reopen, immutable replay and lost-ACK/
   unavailable-read recovery. Virtual Map tests and existing-system file tests do
   not certify this new durability. Native concurrency remains separately gated.
5. Provision and independently verify the exact admitted private transport/session,
   principal and bounded complete projection. No credentials, gateway availability
   or Hosted authorization have been exercised; absent transport stays unavailable.
6. Separately authorize P2b-A correction and P2b-B NEW append composition using
   current C2 complete identity/roster/original facts and the entire owning read set
   inside one Account-gated transaction. Historical replay cannot become NEW/current
   authority. Continuation callback wiring, Integrated C4 acceptance and all
   provider/runtime/C5/C9/business gates remain CLOSED.

Only this report is delivered. Production code, migrations, Builder report,
accepted contracts and handoff are preserved. No Hosted DEV/Production access,
device operation, provider activation, commit, push or migration allocation occurred.

**Ready for Dormant-Code Owner Acceptance: NO — F1/F2 correction and recheck required.**

**STOP — PUBLICATION MEMBERSHIP INDEPENDENT REVIEW COMPLETE.**

## Appended independent targeted recheck — 2026-10-09

Recorded by the Builder from the separate read-only correction recheck agent
`/root/correction_recheck`. The original review above, including F1–F3 findings
and its original verdict, is preserved. This appendix records corrected behavior;
it does not revise the original evidence.

**Final independent F1–F3 recheck: PASS; no remaining findings.**

- F1: shared projection rejects correctly rehashed out-of-scope Inputs during
  CLOSED projection and owning current read. Scoped Sources with zero Inputs
  remain valid.
- F2: complete verified ancestry accepts convergent multi-parent DAGs. Distinct
  Original roots reject before caller binding selection; neither of two valid
  bindings can provide partial support.
- F3: exposed internal Stores enforce active transaction, current Account and
  Trip admission. Missing transaction-state capability fails closed before
  writes. Connection-level transaction activity does not prove ownership:
  complete verified roots, the serialized owning transaction and existing
  Account apply gate remain explicit internal caller preconditions.

Independent final command:

```sh
npx vitest run src/data/repositories/tripPublicationMembershipRepository.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
```

**1 suite / 39 tests PASS**, 1.65 seconds. Rechecker modified no files.
Migration durability, authenticated transport and runtime integration were not
checked or activated. All original remaining migration/integration gates apply.

Owner subsequently accepted the original Builder report, original independent
review, correction evidence and this independent targeted PASS for **dormant
code/design only**, and authorized one scoped local closure commit with exact
parent `f7115dc288aff7f0a252bf80f53b0f2b626a7534`. No push, integration,
migration allocation or runtime authority is included in that acceptance.
