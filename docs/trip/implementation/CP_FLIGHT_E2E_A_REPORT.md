# CP-FLIGHT-E2E-A implementation report

Date: 2026-10-12. Owner authorized isolated implementation only.
Baseline/local/remote main: b5caa1f61cad1d8c612ee40142f3289f69715b5a.
Branch: codex/cp-flight-e2e-a. Worktree: /private/tmp/otr-cp-flight-e2e-a-20261012.

## Narrow preflight and scope

Capture Stage 1's 17-file integration-prep index is not integrated into canonical
main. Stage 1 branch 1fd4b7d includes 8743641 and ff7c2bb; only the necessary existing
interpretation/evidence/quality/enrichment/source payload/reference extractor source
files and immediate Stage 1 tests are carried as explicit dependencies here. The
other staged reports, benchmarks and concurrent current-state edits are untouched.
No main integration is implied by this dependency use.

fb8dbc9 is not integrated. It extends the existing Core owning SQL lifecycle test
and reconciles Core handoff docs; no Publisher/API change. It is not cherry-picked.

Reuse W4 publication2 at POST /v2/trips/:tripId/core/source-candidates/publish;
prepare/read/finalize2 at existing core/source-plans routes and the sole Core writer
commands/operation receipts. No new publisher, pipeline, queue or runtime wiring.

Execution: map the whole single-Source CandidateSet and exact evidence packets to
publication2; retain all sibling candidates and unknown/ambiguous fields. Durable
caller-supplied publication/plan/slot/operation/target IDs precede calls and are reused.
Core independently rereads originals and qualifies airport/purpose authority.
Capture prepares proposals; Core owns frozen commands, exact receipts and recovery.

Validation completed as recorded below. Runtime/Hosted/provider/native remain CLOSED; no merge or push.

## Final result

**IMPLEMENTED / ISOLATED SYNTHETIC SQL PASS / NOT INTEGRATED.**
Implementation commits: `e53e32d` and `d0525b0c2a30e99da86c81d69be5d3c6a6ea6b7c`.
The branch is based exactly on the Owner baseline. No merge, push, historical migration
change, new dependency, startup wiring, provider call or Hosted operation occurred.
The 10 carried Stage 1 dependency files match pinned `1fd4b7d` bytes exactly.
The complete 17-file Stage 1 integration remains a separate decision.

### Adapter and interfaces

- `src/data/interpretation/captureFlightCoreV2.ts`:
  `buildCaptureFlightPublicationV2`, `publishCaptureFlightSetV2`,
  `buildCaptureFlightSourcePlanV2`, `prepareCaptureFlightSetV2`.
- `buildCaptureFlightPublicationV2(context,set,materials,publicationId,hash,getAccountId)`
  verifies existing Stage 1 evidence coverage/quality, retains Candidate IDs, Source
  revision, Run ID and Input digest, and maps exact existing UTF-8 locators. It returns
  `{publication,quality,sourcePublication}`; quality is advisory. No authority flag or
  purpose certificate is minted. Complete originals and siblings stay in C2/Source.
- `CaptureFlightCoreIds` requires persisted `{candidateId,itemId,createSlotId,
createOperationId,qualifySlotId,qualifyOperationId}` for every Candidate. Persist these
  and publication/plan IDs before calls; retries never allocate replacements. Preparation
  makes an independent sparse CREATE and receipt-dependent QUALIFY for each same Item UUID.
- `prepareCaptureFlightSetV2(context,built,planId,identities,transport)` invokes existing
  publication and Source preparation. It returns `{publication,preparation,plan}`.
  `preparation.readyCommands` are Core-frozen commands; pass them unchanged to the existing
  `tripCoreV2Repository.enqueue`. Command delivery/retry stays with the Core queue/coordinator.
  This slice introduces no scheduler or native startup caller.
- `createCoreV2Transport` now also exposes `prepareSourcePlan` and `finalizeSourceSlot`.
  Existing `submit`, `receipt`, `collection` and publication methods remain. New calls use
  the existing authenticated client, bounded JSON and before/after account-generation
  fences. Prepared command operation/target/slot/payload/base and intent hash are bound to
  the exact request and public plan; foreign responses fail closed.
- Existing prepare/finalize request schemas moved without semantic changes to
  `src/domain/trip/tripCoreV2SourceContract.ts`, shared by backend and Capture. Backend
  re-exports preserve callers. The same existing public preparation/finalization shapes
  now have bounded client validators. No Core public version or admission rule changed.

### Source → Candidate → Publisher → Admission evidence

The synthetic original contains two independently evidenced segments:
`NZ1 AKL→CHC 2026-12-17 depInstant=2026-12-16T20:00:00.120000Z` and
`NZ2 CHC→AKL 2026-12-20 depInstant=2026-12-19T20:00:00.120000Z`.
Dates/instants are explicit synthetic Source observations; no civil-time inference.

The test bootstraps synthetic retained ORIGINAL TEXT Source rows, then calls the existing
C2 `trip_source_publish_flight_run` with the actual CP13B `FlightCandidateSet.publication_request`.
Its READY Run/Input digest must equal Capture's digest; no arbitrary replacement hash.
The actual client publication/prepare/command/recovery/finalization routes reach the existing
Core owning connection. HTTP authentication/token is a synthetic in-process test seam;
SQL runs through libpq/psql, not a deployed Node pg/TLS session.

| Requested outcome                    | Executed result                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Source → two Candidates          | Actual `interpretFlightBatch`, Stage 1 evidence/quality and unchanged Candidate IDs                                                                                                                                       |
| Both enter publication2              | Existing owning publisher re-extracts complete originals; both QUALIFIED under private synthetic date-bound airport registry                                                                                              |
| Two independent legitimate outputs   | Owning purpose certificates and sole Core writer; two sparse CREATEs followed by two same-ID QUALIFYs                                                                                                                     |
| Stable Trip Item UUIDs               | Two caller-persistable UUIDs remain unchanged through creation, qualification, receipts and read2                                                                                                                         |
| Duplicate import                     | Exact publication/plan/command replay; newly allocated duplicate targets also fail Source purpose collision, zero extra Items                                                                                             |
| Lost response/replay                 | Four HTTP command responses intentionally lost after server commit; fresh owning connection recovers exact immutable operation receipts and replay results                                                                |
| Unknown airport / ambiguous siblings | Fresh Source/Run fixtures go through actual publisher/prepare SQL; REVIEW, no READY command or extra Item. Ambiguous observations may legitimately consolidate to one Candidate; none is discarded to manufacture success |
| Protected manual fields              | Manual title SET and description CLEAR retained; Source title overwrite yields PROTECTED_FIELD, no dispatch                                                                                                               |
| Private evidence                     | Other Trip member initially sees no private Item; explicitly sharing an Item still does not expose Source ID, publication authorization ref or field-evidence locators; foreign publication denied                        |

Four exact Source associations finalize COMPLETE against their original domain receipt IDs
and hashes. Formal Source plan status is COMPLETE; accepted Source qualification revision2
is retained while later manual edits have their own revisions. Publication QUALIFIED alone
is never treated as admission. Item/collection2 reads prove two accepted Items; native
SQLite/Day consumption belongs to Agent 2 and is not claimed here.

### Verification

- Focused Vitest: **9 suites / 171 PASS**, including Capture, shared DTO/client, Source,
  HTTP, publisher and carried Stage 1 regression. No failures in this scope.
- `python3 scripts/trip/core-v2-sql-acceptance.py --flight`: **1 scenario PASS**,
  covering the nine outcomes above with positive and negative cases.
- Existing `--source`: **3 SQL scenarios PASS** after fixture/schema extraction,
  preserving manual sparse qualification, registry revocation, historical retained
  finalization, redaction/deletion denial and legacy identity claims.
- Both SQL runs used fresh UUID-owned network-none Server84→Core85–92 clones and deleted
  only their own clone. All **329 historical public function fingerprints unchanged**;
  default RLS, principals and CLOSED activation checks PASS. Existing databases untouched.
- Typecheck, touched TypeScript lint (zero warnings), touched formatting, backend build
  and `git diff --check` PASS. No full-suite rerun or native/device test was required for
  this scoped task; the known unrelated baseline UI failures are not counted as PASS.
- Changed-file manifest: `CP_FLIGHT_E2E_A_CHANGED_FILES.txt` (against exact baseline).

### Agent 2 handoff

Consume accepted Core facts using `createCoreV2Transport.collection(context)` and existing
read2 validators. Install atomically through `tripCoreV2Repository.beginRefresh(context)`
then `install(refresh,manifest,pages)`; use `item`/`day` or existing `projectCoreItem` /
`projectCoreDay`. Preserve the actor/Trip/generation, epoch/access revision and complete
certificate. The boundary is accepted Item UUID + semantic revision, P2 typed ORIGIN /
DESTINATION / services and current Person-binding roster. Candidate/quality/Source-plan
DTOs are not Day facts or an accepted SQLite certificate. Pending queue overlays remain
outside accepted hashes. Accepted place UUIDs are NULL; no map/place authority inferred.

Receipt/finalization handoff requires original slot/operation/intent SHA, separate domain
receipt UUID and receipt SHA. EVIDENCE_PENDING does not undo an accepted sibling; missing
or uncertain receipt is not NO_COMMIT. Use the existing owning recovery paths, without
latest-revision rebasing or a second writer.

### Remaining limits and readiness

No missing custody dependency blocks this synthetic ORIGINAL TEXT/reference-grammar slice.
Binary/PDF/OCR, mixed Sources, richer supplier/codeshare/change evidence, existing-target
admission, original Document custody/host/copy grants and ordinary civil-time qualification
remain unsupported/REVIEW. Capture edits are preserved for owning rejection; known
Canonical target hints remain hints and the bounded publisher keeps them REVIEW.
No airport resolution cache, transient matching flag or caller declaration grants proof.

Native/Hosted E2E still needs a separate integration decision, accepted deployment/schema
and provisioned owning principal, approved runtime activation, production-grade retained
Source acquisition/byte custody, real Node pg/TLS/auth transport, and device queue/SQLite/Day
acceptance. This result is ready for scoped integration review, not production readiness.
All runtime/Hosted/provider/paid-LLM/AUTO_SOURCE activation remains CLOSED.
