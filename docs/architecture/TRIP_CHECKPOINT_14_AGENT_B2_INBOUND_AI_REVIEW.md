# CP14 B2 — Independent durable inbound AI review

Date: 2026-10-06 (Pacific/Auckland). Review only.

**Verdict: PASS WITH REQUIRED CORRECTIONS**

**New findings: 0 CRITICAL, 1 IMPORTANT. Ready for Owner Review: NO.**

The proposal/consent separation holds in the inspected adapter and actual Server83
acceptance. An external client cannot authenticate through package claims or reserve
an OTR_USER decision. Proposals create neither decisions nor canonical authority IDs.
ACCEPT replay, concurrent duplicate admission, protected uniqueness, and preparation
recovery preserve authority. One B2 defect permits new REJECT/DEFER decisions against
stale Candidate/material observations. Correct F1 and independently recheck before
Owner Review. This conclusion does not authorize public or provider activation.

## Reviewed snapshot and authority

- Branch: `intelligence/cp14-inbound-ai-client`.
- Exact accepted base and retained HEAD:
  `508d79efb865ac8d7fc21ff949b6e6a12746f39a`.
- Reviewed worktree:
  `/Users/xoery/.codex/worktrees/cp14-inbound-ai-client/otr-mobile-canonical`.
- Review includes the uncommitted tracked documentation and untracked implementation,
  tests, preflight and owner clarification; the branch HEAD alone contains no B2 diff.
- Implementation: `backend/src/inboundAiClient.ts`,
  `src/domain/intelligence/inboundImportPackage.ts` and the actual
  `backend/src/inboundAiClient.test.ts`. All 760 pre-existing tracked implementation
  files under src/backend/scripts/supabase match the accepted base byte-for-byte.

Authority inputs included the complete B2 Builder report's historical ordering stop
and final delivery, `CP14_B2_OWNER_REVIEW_LIFECYCLE_CLARIFICATION.txt`, accepted
Server83 implementation/final F5/F6 review and VerifiedCallContextV1 clarification,
CP12 Import/Flight/Intelligence contracts and corrected I1/I2/I3/C1/C2/C3 addendum /
Red Team report, CP13A implementation/review/targeted correction and CP13B final
integration, and accepted C2/A2 implementations and final targeted rechecks. Current
API/DATA_MODEL/OFFLINE_SYNC and current-state updates were checked against the code.
Historical pending/failure labels do not supersede accepted final rechecks. Builder
YES answers were treated as claims, not independent evidence.

The calling canonical checkout is on another branch with pre-existing changes. It
was not switched or used as the B2 implementation. Execution used a review-owned
snapshot at `/private/tmp/b2-independent-review`, linked to the already installed
dependency tree. Supplemental tests change only that disposable snapshot, using
existing native SQLite/CP13B/CP13A fixtures and actual Server83 protected roots.
No implementation or Builder report was edited. Only this report is delivered.

## F1 — IMPORTANT: stale evidence does not block REJECT/DEFER reservation

**Location:** `backend/src/inboundAiClient.ts:940–954`, particularly the
ACCEPT-only closure check at line952; reservation/finish at lines1037 and1068.
The existing owning assessment is
`src/data/repositories/flightImportClosureOrchestrator.ts:145–253`.

**Independent reproduction, four vectors, also confirmed through real Server83:**

1. Submit a valid package and display its NEEDS_REVIEW proposal V1.
2. Independently change the persisted Candidate proposal hash, or advance the
   retained Source row revision so the original material pins are stale.
3. Keep the displayed package/version/Run/Input/proposal request bindings unchanged.
   Authenticate a real fixture OTR_USER and request REJECT, then repeat in a fresh
   fixture with DEFER.
4. Both dispositions succeed: Server83 stores a confirmed decision and the adapter
   returns REJECTED/DEFERRED. All four generated canonical IDs remain null.
   Required rejection tests fail because the promise resolves.

The same stale observations reject ACCEPT in the existing matrix. There is no
unconfirmed decision, forged actor, canonical Event mutation or authority-ID leak
in this finding; its severity is IMPORTANT, not CRITICAL.

**Cause:** CP13B revalidates the published Candidate and every Run Input. On
`INPUT_STALE`, it keeps the original pinned Candidate in the returned plan, records
the failure in `plan.reasons`, and sets closure NEEDS_REVIEW. B2 compares the pinned
Candidate hash/target and requires READY only for ACCEPT. REJECT/DEFER therefore
ignore the owning assessment's explicit stale-evidence finding and proceed to the
confirmed-decision root. Server83 cannot repair this: its durable package/version
checks do not independently read Mobile's current Candidate/material observations.

**Violated requirements:** owner lifecycle §3 requires exact current Candidate /
Run/Input/material bindings for ACCEPT/REJECT/DEFER. Review target3 makes the same
requirement for all dispositions. The Builder/API claims that explicit decisions
pin current hashes and stale proposals require refresh are consequently too broad.
A sealed historical decision's exact recovery is a separate permitted path; these
four probes create new decisions, not historical recovery.

**Smallest required correction:** refuse a new decision when owning assessment
reports stale Candidate/Input/material integrity, for all three dispositions,
before decision custody/reservation. Preserve REJECT/DEFER for valid incomplete,
unsupported or ambiguous proposals; requiring READY for every disposition would
be incorrect. Keep exact sealed historical recovery and null nonaccept IDs. Extend
the real-root regression matrix with these four cases and retain valid nonaccept /
historical replay positive controls. No Server84, SQLite51, new scheduler or review
journal is justified by this defect. Implementation was not modified by this review.

## Independent results by requested boundary

| Target                      | Independently observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Trust/authentication     | Strict request schemas reject caller verified/actor/confirmation fields. Injected context binds original request/digest/action, actor/Account/client/environment and expiry/revocation; REVIEW requires OTR_USER. The unchanged gateway and SQL independently enforce dedicated-session, external subject, current grant/action/Account/Trip. Real-root acceptance covers SINGLE_TRIP, ACCOUNT_STAGING, P2/T2 against retained P1/T1, removed access and replacement grants. Independent all-entry actor/client/Account/environment/action/expiry probes reject.                       |
| 2. Proposal is not decision | SUBMIT and STATUS contain no review-reservation call. NEEDS_REVIEW retains package version/digest and RUN publication refs. Real tests observe zero decision rows, zero preparations/Confirmations/slots/operations, no generated intended Event, and canonical_acceptance=false. Repeated STATUS/exact SUBMIT returns the same semantic proposal without consent mutation. Existing-target Event refs are observations, not newly allocated targets. No sibling publication/proposal-to-consent path was found.                                                                       |
| 3. Authenticated decision   | External principal and caller confirmed-user/timestamp claims reject. New decisions compare package/review/proposal, Run generation/Input digest, Candidate and exact Event/base; current authorization is checked repeatedly. F1 is the exception for new stale nonaccept decisions. Sealed decision recovery remains exact and reauthorized rather than accepting a newer proposal.                                                                                                                                                                                                  |
| 4. ACCEPT IDs               | Deterministic IDs derive from retained reservation/review key only after authenticated decision validation; protected reservation commits before local CP13A prepare. Exact/restarted/concurrent duplicate ACCEPT retains one authority set and at most one queued preparation. REJECT/DEFER retain four null IDs and empty Input map, do not prepare, and changed same-key disposition rejects.                                                                                                                                                                                       |
| 5. Stale proposal           | ACCEPT rejects changed review_version, Run generation/Input digest, Candidate hash/material pins and Event revision; revoked/expired grant or Trip access rejects. Refresh increments version and preserves sealed historical decisions. New REJECT/DEFER stale Candidate/material admission fails the required invariant, F1.                                                                                                                                                                                                                                                         |
| 6. Package replay           | Real roots reject same request/key with changed bytes, changed package key under retained package, cross-client/Account/scope substitutions. Exact reservation/attach replay survives response loss. P2/T2 grants cannot widen retained P1/T1. No duplicate package semantic authority was observed.                                                                                                                                                                                                                                                                                   |
| 7. Invocation replay        | Duplicate SUBMIT returns the original completed projection. Interrupted invocation reconstructs call config_version/configuration_sha256 from the retained call, never readIntegration's rotated current config. Deterministic Run identity and immutable CP13B publication survive retries; response digest and retained package IDs are rechecked. No duplicate Source/Run/Candidate set was observed.                                                                                                                                                                               |
| 8. N→M/evidence             | Running B2 uses real deterministic CP13B for one material→two legs, several materials→one occurrence, heterogeneous OTHER declaration, repeated passenger evidence and contradictory clocks. Summary/interpretation refs never enter authoritative material extraction; no summary content is loaded as flight evidence. Original observations/locators survive. Passenger names create no Person/member. CP13B regressions also cover qualified codeshare/date/route and negative-evidence rules.                                                                                     |
| 9. Completion/augmentation  | Real existing Event/services baseline supports arrival completion with one UPDATE preparation at exact base7. Changed Event base rejects. Passenger-only same-flight evidence is AUGMENT_EXISTING assessment with non-READY closure and ACCEPT rejected; it is not participant mutation. Unrelated/date/reverse-route and reprocessed lineage/UNKNOWN/split regressions pass in CP13B. No unsupported booking/passenger persistence was added or claimed as applied capability.                                                                                                        |
| 10. Custody/projection      | Private content digest is selected by Server83 safe_result/safe_response; reads recompute content and envelope digests and exact package/reservation/version/state. Independent missing/corrupt projection reads fail closed; Account/Trip/package scope is checked before disclosure. B2 bounds request, package aggregate, interpretation/projection to4MiB and verifies material hashes/ancestry. projectionMaterial is an injected immutable content seam, not consent authority or a second implemented journal/store. Live custody is not installed or certified by this review. |
| 11. STATUS/disclosure       | Authorized current/status and historical invocation/decision recovery pass. Wrong package/client/Account/Trip/grant, revoked/expired grant and removed Trip access reject. Independent A→B→A during projection read prevents disclosure. Returned proposal has only IDs/digests/generation/closure/action/base and unsupported count, no ticket/passenger/PNR/text/URL content. Known package ID alone grants no access.                                                                                                                                                               |
| 12. Loss/UNKNOWN            | Actual package reservation, material attach, invocation reservation/completion, decision reservation/observation and prepare ACK-loss tests preserve identities. Reviewer projection-retain ACK loss also recovers one Source/Run/Candidate identity set. Absent exact prepared intent after retained ACCEPT returns UNKNOWN without another prepare; durable reservation is not guessed nonexecution. Existing exact preparation recovers even after proposal refresh. Canonical receipt uncertainty stays with unchanged CP13A; B2 executes no canonical command.                    |
| 13. CP13A boundary          | B2 calls the existing closure.prepare only. Owning preparation rechecks exact published evidence, claims/lineage and Event base, builds complete reviewed support/TRACK_C proof and queues the existing C_PREPARE_CONFIRMATION. Complete selected-field, claim, CAS/receipt/recovery regressions pass. No direct Event write or bypass command exists. Prior CP13A independent-security limitations remain unchanged.                                                                                                                                                                  |
| 14. A2 separation           | Static imports/call sites contain no A2 router, harness, executor or outbound-reservation dependency. Independent synthetic router/executor spies receive zero calls and protected-command recording has zero outbound reserve calls. Server records INBOUND_TOOL with provider/model/price null, START model units/cost null and content-safe completion metadata. No automatic OTR-paid enrichment or billable-provider attribution was observed.                                                                                                                                    |
| 15. Public activation       | Construction/import search finds only test construction of createClosedInboundAiClient; server/startup do not import it. TEST_ONLY/TEST checks have no default verifier. No HTTP route, OAuth/JWT verifier, vendor runtime, MCP publication, marketplace registration or secret resolver was added. Built Backend excludes this unwired adapter.                                                                                                                                                                                                                                       |
| 16. Privacy                 | New control-plane writes contain UUID references, SHA-256 digests, finite states/reasons and nullable measurements. Sensitive evidence remains in admitted private content, never safe_result/usage. No console/logger, raw provider-error persistence, credentials, signed URLs or raw attachment bytes were added to telemetry. Existing Server83 finite-reason/content-safe/request-binding assertions pass.                                                                                                                                                                        |
| 17. Non-interference        | All760 pre-existing implementation files are byte-identical to base, including Server83/SQLite50, A2/C2, Capture, Account/sync and five unconditional C denials. Server count83 and SQLite tail50; no84/51. Full relevant regressions execute. No UI/Admin/billing/CXE/training/Product Intelligence/startup activation change. sync_operations remains sole scheduler and all runtime/provider/public-client gates stay CLOSED.                                                                                                                                                       |

## Duplicate-authority probe: actual index, not the test double, governs

An additional reviewer probe loses ACCEPT reservation response, recovers the same
key as UNKNOWN without preparing, then tries a new request/review key for that
same Candidate. The transport double admits a second authority set because it
omits Server83's partial unique index. **Actual Server83 rejects** at
`cp14_inbound_ai_review_decisions_51` (`Server83:575`), whose protected unique key
is `(reservation_id,candidate_id)` for RESERVED/UNKNOWN/PREPARED.
The original confirmed row/IDs survive; decision count stays one.

This was independently investigated rather than reported as a CRITICAL B2 defect.
The final real-root assertion passes. The disposable-double mismatch is a fixture
coverage limitation, not evidence of duplicate production authority. Concurrent
same-key ACCEPT also passes through actual protected roots. No duplicate canonical
Event, confirmation authority set or cross-scope mutation was demonstrated.

## Independently executed validation

| Check                                                                       | Observed result                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Original B2 native SQLite50 / CP13B / CP13A suite, fault-injected transport | 46/46 PASS                                                                     |
| Same original B2 suite through unchanged actual Server83 roots              | 46/46 PASS                                                                     |
| Reviewer-owned final real-root adversarial suite                            | 21 tests:17 PASS,4 required-behavior failures reproduce F1                     |
| Review-owned fresh1→83 and seeded exact82→83 replay                         | PASS: old public column definitions/functions and synthetic auth row preserved |
| Accepted protected-root Server83 harness                                    | 548 checks PASS, including75 residual checks; gates CLOSED                     |
| Full unmodified delivered Vitest snapshot                                   | 200 files:199 passed,1 failed;2396 tests passed,1 failed                       |
| Typecheck                                                                   | PASS                                                                           |
| Full lint including UI guard                                                | PASS;473 existing legacy occurrences /76 representative UI files               |
| Backend build                                                               | PASS in disposable output                                                      |
| Working-tree whitespace and exact input preservation                        | PASS                                                                           |

The full suite includes relevant CP13A/B, C2/A2, Capture, Account, SQLite
fresh/upgrade/FK/reopen and sync regressions; none were skipped to obtain this
count. Its only assertion failure is the unchanged Ledger Expense Detail UI→API
boundary in `src/domain/architectureBoundary.test.ts`. Both guard and offending
UI source match accepted-base bytes. This is not a global full-suite PASS. F1's
new review-owned failing tests were run separately and are not mislabeled baseline.

Database tests used only review-owned `otr-cp14-b2-independent`, PostgreSQL17.6
from the existing local image, `--network none`, no published ports and synthetic
identities. Existing Builder/Dev databases were not mutated. Replay reads the
existing local schema-only platform fixture and hash-pinned nonpublic utility
bodies from the CP13A disposable fixture; no hosted connection or private production
data is involved. No provider, OAuth/public client or production runtime was activated.
The review-owned database was removed after verification.

Reproduction artifacts are confined to `/private/tmp`:

```text
b2-independent-review/backend/src/b2Independent.test.ts
b2-independent-input-hashes.json
b2-independent-lifecycle.log
b2-independent-sql-lifecycle.log
b2-independent-final-probes.log
b2-independent-replay.log
b2-independent-server83.log
b2-independent-full.log
b2-independent-typecheck.log
b2-independent-lint.log
b2-independent-build.log
```

Run the retained snapshot's Vitest with `--configLoader runner --maxWorkers=1`.
Set `CP14_B2_SERVER83=1` only with an isolated replayed/seeded fixture and use
`--testTimeout=60000` for the supplemental suite's serial Docker/psql matrices.
An initial supplemental SQL run hit the default5-second timeout for three tests
containing seven serial probes each; the final rerun adjusts only reviewer timeout,
not implementation or assertions. Original B2 SQL tests passed unchanged.

Preserved source hashes:

```text
Server83: c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93
SQLite50: 63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0
B2 adapter: 1d262f9bb27da3e0a89d9acf3f4bb712592fdc0955dd4ba1df569c7f65635cc9
B2 package contract: d3c711e9b30b2148e68df3d990ec3cafa5d76e9f35f5e84898b8163fa5ef7dec
B2 original tests: 1163d43d36ce4358b3a41dd51ea3127cf87fba11a0236ea5fb1c7afa6a73e72f
```

Live issuer verification, production read/custody provisioning, native/device
acceptance, live provider terminality and comprehensive new CP13A adversarial
canonical-command acceptance are not claimed. Canonical-response recovery is
covered by unchanged existing regressions/static ownership, not a new B2 executing
path. No legacy Web, Hosted Dev/Production, commit or push occurred.

## Required explicit answers

YES/NO refer to this closed delivered scope and actual protected persistence,
not to an activated public host. “Stale proposal can be accepted” means ACCEPT;
F1 separately records the invalid new nonaccept decisions.

| Question                                             | Answer                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Package claims can authenticate caller               | NO                                                                                                   |
| External client can forge OTR_USER confirmation      | NO                                                                                                   |
| Proposal creates Review Decision                     | NO                                                                                                   |
| Proposal allocates canonical authority IDs           | NO                                                                                                   |
| Proposal replay stable                               | YES                                                                                                  |
| Stale proposal can be accepted                       | NO                                                                                                   |
| Duplicate ACCEPT can allocate new IDs                | NO                                                                                                   |
| REJECT/DEFER can carry authority IDs                 | NO                                                                                                   |
| Package replay safe                                  | YES                                                                                                  |
| Invocation replay safe                               | YES                                                                                                  |
| Response loss can duplicate semantic side effects    | NO                                                                                                   |
| External summary can override evidence               | NO                                                                                                   |
| Passenger name creates Person/member                 | NO                                                                                                   |
| Unsupported passenger augmentation claimed/applied   | NO                                                                                                   |
| CP13B authority preserved                            | YES — owning interpretation/closure unchanged; F1 concerns B2 ignoring a nonaccept freshness failure |
| CP13A authority preserved                            | YES                                                                                                  |
| Direct Event write added                             | NO                                                                                                   |
| Revoked grant can disclose private status            | NO                                                                                                   |
| Raw private evidence enters control-plane telemetry  | NO                                                                                                   |
| Inbound submission automatically invokes A2          | NO                                                                                                   |
| Inbound submission creates outbound model usage/cost | NO                                                                                                   |
| Public inbound runtime reachable                     | NO                                                                                                   |
| Server83/SQLite50 unchanged                          | YES                                                                                                  |
| sync_operations sole scheduler                       | YES                                                                                                  |
| Five C denials unchanged                             | YES                                                                                                  |
| Runtime/provider/public-client gates CLOSED          | YES                                                                                                  |
| New CRITICAL findings                                | 0                                                                                                    |
| New IMPORTANT findings                               | 1                                                                                                    |
| Ready for Owner Review                               | NO                                                                                                   |

**STOP — B2 INDEPENDENT INBOUND AI REVIEW COMPLETE.**

## TARGETED F1 RECHECK

**Verdict: TARGETED RECHECK PASS.**

Independent recheck of `intelligence/cp14-inbound-ai-client`, accepted base
`508d79efb865ac8d7fc21ff949b6e6a12746f39a`, on 2026-10-06. This appendix
supersedes the original F1 readiness restriction; the original review remains
historical and is preserved byte-for-byte. No implementation was edited.

### Correction and owning semantics

The production correction is exactly the ten added lines in
`backend/src/inboundAiClient.ts:949`: every NEW disposition rejects owning
`INPUT_STALE`, `STALE_BASE_REVISION` or `CANONICAL_EVENT_MIRROR_INTEGRITY` before
`inboundId` decision/ACCEPT authority derivation, decision custody, protected
`inbound_ai_reserve_review` and CP13A prepare. READY remains ACCEPT-only.

The reason list matches the three errors that the unchanged CP13B orchestrator
converts into retained unresolved plans. `readClosureEvidence` and its `pin`
checks cover Candidate/Run retention and readiness, Source ownership/lifecycle/
retention/revision/current material, Representation registration/retention/hash/
size/remote verification and material manifest. The orchestrator additionally
checks Candidate Run/hash/input digest, recomputed proposal digest, exact field
values/locators/Input references and the complete retained Input set. Those
failures become `INPUT_STALE`. Event/services revision mismatch and matching
baseline revision mismatch become `STALE_BASE_REVISION`; known-version local
Event corruption becomes `CANONICAL_EVENT_MIRROR_INTEGRITY`.

Other errors propagate without reservation. In particular, changing a current
matching scope to `current=false` after display throws `MATCH_SCOPE_CHANGED`
from `assessFlightCandidateSet`, before B2 can reserve either nonaccept decision.
`MATCH_RESOLUTION_CHANGED`, admission integrity, account/access and typed/schema
errors likewise do not become permissive plans. Audited matching/closure reasons
include `INCOMPLETE_SCOPE`, unqualified/contradictory matching, continuity review,
missing/unadmitted fields, unresolved identity, contradictory evidence, unknown
predecessor, unavailable predecessor target, incompatible merge targets and
unsupported/deferred dimensions. These describe unresolved/nonexecutable content
or lineage; they do not suppress failed evidence-pin checks. Applicable missing
or changed displayed Event target/base also fails B2's exact target/base binding.
No equivalent owning freshness failure was found that can bypass the guard.

### Independent vectors and lifecycle controls

| Recheck                           | Result and evidence                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original four F1 vectors          | Actual B2 with both native SQLite/transport fixture and unchanged real Server83 roots rejects stale Candidate hash + REJECT/DEFER and stale Source row/material observation + REJECT/DEFER. Zero new Review Decision rows; custody/prepare counters unchanged; no reserve-review or outbound command; zero Confirmation/output-slot/Event/queue rows. |
| Ordering and all dispositions     | Review-owned Candidate/material checks also reject ACCEPT. Review-owned three-reason × ACCEPT/REJECT/DEFER matrix rejects before custody/reservation/prepare in both modes. Source inspection places deterministic authority derivation strictly after rejection; no replacement review authority is allocated.                                       |
| Event owning failures             | Review-owned real Event revision-change and known-version endpoint corruption each reject new REJECT and DEFER with no decision or additional custody/prepare. These use actual unchanged CP13B assessment, not an invented freshness evaluator.                                                                                                      |
| Current nonaccept controls        | Current incomplete REJECT and DEFER, ambiguous REJECT and unsupported passenger-augmentation DEFER succeed in both complete B2 suites. Canonical authority IDs remain null and prepare count remains zero.                                                                                                                                            |
| Historical recovery               | Sealed REJECT, DEFER and ACCEPT survive later Candidate hash/Source revision mutation and review-version refresh. Exact authorized restart recovery returns original disposition/IDs, with one retained decision and no repeated prepare.                                                                                                             |
| Current proposal refresh          | Review-owned test seals REJECT at Event base7, advances Event to8, rejects another decision against displayed version1, then supplies fresh admitted owning review context. SUBMIT retains version2, current DEFER succeeds, and exact version1 sealed REJECT remains unchanged. Two distinct explicit decisions; no rewritten confirmed intent.      |
| Refresh does not confer freshness | Advancing review_version alone while retaining stale Source/Input pins remains stale and rejects. The positive refresh control supplies genuinely current owning Event context; it does not bypass evidence checks or mutate historical decisions.                                                                                                    |

### Preservation smoke

Complete B2 and independent adversarial runs reconfirm verifier-derived caller
identity, strict rejection of caller authority claims, External Client inability
to forge OTR_USER confirmation, proposal/decision separation and no proposal
canonical IDs. Proposal/invocation replay is stable; duplicate/concurrent ACCEPT
and protected uncertain-reservation uniqueness preserve one authority set.
REJECT/DEFER have null canonical IDs. Package/invocation/decision/projection/
prepare response loss preserves semantic identities; exact prepare recovery does
not repeat preparation. Account A→B→A, wrong Account/client/Trip/grant and revoked
access prevent private status disclosure.

Material evidence remains authoritative over external summary. Passenger names
create no Person/member; unsupported passenger augmentation remains unapplied.
CP13B owns freshness and interpretation; CP13A owns preparation/admission/recovery.
B2 performs no direct Event write or canonical execution. Injected A2-port spies
remain unused; real protected records show INBOUND_TOOL attribution, no outbound
reservation and null provider/model/token/cost attribution. Public inbound runtime
remains unreachable. Five C denials, sole `sync_operations` scheduler and all
runtime/provider/public-client gates remain unchanged and CLOSED.

Original-review input-hash comparison found only the corrected B2 adapter/test
and Builder documentation updates among substantive implementation inputs;
all other original implementation sources remain identical. Server83 SHA-256 is
`c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`;
SQLite50 SHA-256 is
`63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
Both equal their original independent-review bytes. No Server84, SQLite51,
new store, scheduler, review authority or activation was introduced.

### Independently executed validation

- Corrected complete B2 lifecycle suite: **57/57 PASS** with normal fault injection;
  **57/57 PASS** through actual unchanged Server83 protected roots.
- Review-owned normal probes: **30 PASS**. The original uncertain-replacement
  probe is intentionally run only against real roots because its simple transport
  double does not model the protected partial unique index. That real-root probe
  passes; this is the already documented fixture limitation, not a production gap.
- Review-owned actual-root coverage: **31 PASS** across the preservation run
  (21 original independent probes) and finalized targeted run (10 probes).
  No finalized reviewer assertion failed; test-name selection excludes unrelated
  probes only in the targeted rerun.
- Scoped CP13A/B, interpretation, Event mirror, Account/auth and external
  integration/Trip read regressions: **15 files / 295 tests PASS**.
- Fresh network-none migration1→83 replay and seeded82→83 preservation: **PASS**;
  accepted real Server83 harness: **548 checks PASS**, including75 residual checks,
  gates CLOSED. These are reviewer executions, not Builder assertions.
- Typecheck, full lint including UI guard, and Backend build: **PASS**. Initial
  snapshot checks lacked the app directory; after copying unchanged app/assets,
  both checks passed. Review-owned scratch probes are excluded from product lint.
- Early scratch refresh used newer review_version with still-stale Source pins;
  its rejected decision was correct. Early changed-scope probes expected the B2
  error text but received the owning `MATCH_SCOPE_CHANGED` rejection. Final probes
  test fresh admitted context and the actual owning rejection respectively.
  Neither scratch assertion error represents an implementation regression.
- Full repository rerun omitted as permitted: no new regression was found. The
  original unrelated Ledger architecture-boundary failure remains outside scope.

Evidence logs and runnable reviewer probes are under `/private/tmp/b2-f1-recheck`
and `/private/tmp/b2-f1-{lifecycle,probes-normal-final,sql,sql-targeted-final,
regressions,replay,server83,typecheck,lint,build}.log`. Only the review-owned
network-none disposable fixture was mutated. No Hosted Dev/Production access,
implementation edits, commit or push. Existing report prefix SHA-256 before
append is `f660f51ff34ce20c431b2aadbfa41db1d367bef38eb7dccfd8edfeaa0e294c6e`;
exact original-prefix equality is verified after append.

### Required final answers

| Question                                      | Answer |
| --------------------------------------------- | ------ |
| F1 FIX VERIFIED                               | YES    |
| Original IMPORTANT findings remaining         | 0      |
| New CRITICAL findings                         | 0      |
| New IMPORTANT findings                        | 0      |
| New regressions                               | NO     |
| Four original stale nonaccept vectors blocked | YES    |
| Freshness reason coverage complete            | YES    |
| Valid current REJECT/DEFER preserved          | YES    |
| Historical sealed recovery preserved          | YES    |
| Stale decision can allocate authority IDs     | NO     |
| Stale decision can invoke CP13A prepare       | NO     |
| Proposal/decision separation preserved        | YES    |
| External client confirmation forgery possible | NO     |
| CP13B freshness authority preserved           | YES    |
| CP13A authority preserved                     | YES    |
| Inbound invokes A2                            | NO     |
| Server83/SQLite50 unchanged                   | YES    |
| Five C denials unchanged                      | YES    |
| Runtime/provider/public-client gates CLOSED   | YES    |
| Ready for Final Owner Review                  | YES    |

**STOP — B2 TARGETED INDEPENDENT RECHECK COMPLETE.**
