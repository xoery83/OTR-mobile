# CP14 Agent B2 — owner-authorized final delivery

**Current status: B2 F1 CORRECTED / READY FOR TARGETED INDEPENDENT RECHECK.**
The historical preflight below is retained; the final owner-authorized delivery
section supersedes that accepted ordering stop. The targeted F1 correction at the
end is the current delivery status; the independent review remains unchanged.

# CP14 Agent B2 — durable inbound AI hard-stop preflight

Date: 2026-10-06 (Pacific/Auckland).
**B2 complete: NO. Application adaptation not implemented.**

Exact base and retained HEAD: `508d79efb865ac8d7fc21ff949b6e6a12746f39a`.
Fresh branch: `intelligence/cp14-inbound-ai-client`.
Fresh worktree: `/Users/xoery/.codex/worktrees/cp14-inbound-ai-client/otr-mobile-canonical`.
Entry HEAD was exact and tracked/untracked status was clean before branch creation.
No commit, push, deployment, Hosted Dev/Production access or activation.

## Authority and execution

The user explicitly requested execution of the attached
`CP14_AGENT_B2_DURABLE_INBOUND_AI_INSTRUCTION.txt`, a fresh worktree at the exact
base and no commit/push. That adoption makes its B2 requirements applicable.
Historical report instructions describe their own stages; they do not authorize
new runtime activity. The accepted base outranks the frozen original B.

Execution stopped at the attached instruction's explicit boundary:

> If Server84, SQLite51, new durable authority, scheduler, auth authority or canonical command is required: STOP with exact preflight, do not author.

The preflight sequence was: verify clean exact base; inspect current handoff and
accepted authority contracts; trace Server83 review reservation and CP13A/B
selection preparation; reproduce the review-lifecycle mismatch in a fresh isolated
PostgreSQL fixture; verify preservation and record this report. No application
adapter, migration, replacement journal, credential verifier or route was authored.

Original B's report, package schema and process-local implementation were read as
reference only in `/private/tmp/otr-cp14-b`. Its files were not changed or copied
into the application. Accepted persistence final F5/F6 recheck and A2/C2 rechecks
remain historical, unchanged evidence. This is a compatibility preflight, not a
new FAIL verdict on their accepted scopes.

## Exact blocker: proposal reservation versus confirmed decision reservation

The new B2 REVIEW requirement says:

> Before confirmable proposal reserve durable review and generated IDs needed by CP13A

The accepted persistence preflight §4.5 specifies a different ordering: persist
selection IDs **before CP13A prepare**, after independent authentication of the
explicit user decision. Server83 implements that confirmed-decision contract:

- `inbound_ai_review_decisions` requires non-null `confirmed_user_id` and
  `confirmed_at`, with `confirmation_source=EXPLICIT_USER` and
  `confirmation_scope=EXACT_REVIEW_DECISION`.
- Its disposition is exactly ACCEPT/REJECT/DEFER. Its states are
  RESERVED/UNKNOWN/PREPARED/REJECTED/DEFERRED. There is no unconfirmed proposal state.
- `inbound_ai_reserve_review` requires verifier-derived OTR_USER and rejects an
  EXTERNAL_CLIENT even when that caller submits all explicit-user claims.
- ACCEPT retains Confirmation/slot/operation/intended Event IDs. Nonaccept
  requires all four null. Exact accepted decision replay preserves original IDs.
- Existing package NEEDS_REVIEW state, review_version and RUN/CONFIRMATION
  publication references can retain package progress and references. They do not
  introduce a pre-confirmation review-decision transition. This report does not
  claim that Server83 cannot persist generated IDs at all.

Source: unchanged Server83 table at lines465–506; reservation root at
lines1929–1956; publication-reference validator at lines2183–2207. Existing CP13B
`flightImportClosureOrchestrator.prepare` and CP13A admission require exact review,
Candidate/Run/Input and selection identities; they do not supply external-client
review authority.

Under the literal B2 ordering, an adapter cannot call the accepted review root
before user confirmation without asserting confirmation that has not occurred.
Treating an external client's claims as consent, relabeling a package reference
as a review decision, adding a process-local journal, or writing another local
review authority would violate the request. The injected verifier authenticates;
it cannot change Server83's admitted lifecycle.

**Reconciliation needed before implementation:** either explicitly confirm that
B2 intends the accepted sequence (package NEEDS_REVIEW/proposal projection, then
authenticated exact decision reservation, then CP13A prepare), or separately
approve an exact forward Server84 contract for an unconfirmed review reservation
and its authenticated transition. The latter must pin package/client/Account/Trip,
review version, Candidate hash/generation, Event revision and retained selection
IDs, without asserting consent or canonical acceptance. No forward SQL, new table,
state transition, gateway root or local authority is proposed as implemented here.
SQLite51, a second scheduler and new canonical commands are not needed by this
finding and were not authored.

## Reproduction and validation

`scripts/cp14/b2-review-preflight.py` runs the unchanged accepted Server83 harness
with seven additional review-contract probes inserted before its first review.
The original harness is loaded in memory; its source is unchanged. Only the target
container name changes. The extra checks verify rejection of:

1. An authenticated review reservation with no confirmation timestamp.
2. An authenticated review reservation with no confirmed user.
3. A PROPOSED disposition.
4. A NEEDS_REVIEW review-decision state.
5. REJECT carrying reserved Confirmation/slot/operation/Event IDs.
6. DEFER carrying those IDs.
7. A REVIEW-kind package publication reference.

The existing harness additionally confirms EXTERNAL_CLIENT cannot forge user
confirmation and authenticated ACCEPT/replay retains IDs. The REJECT/DEFER probes
characterize existing constraints; they are not an assertion that nonaccept must
invoke CP13A or an independent hard stop.

- Fresh offline 1→83 replay and seeded exact82→83 preservation: PASS.
- Accepted Server83 **548 checks**, plus **7 B2 probes**, total **555 PASS**;
  75 accepted residual checks included. Runtime gates CLOSED.
- Selected **7 files /330 tests PASS**: Server83 gateway, SQLite50 migration/reopen/
  FK foundation, CP13A admission, CP13B integration, C2/A2 continuation repository,
  Account apply gate and sync engine.
- Typecheck, full lint/UI guard, Backend build, changed-document formatting,
  Python compilation and whitespace checks: PASS.
- All **92** checked migration/registry/gateway/C2/A2/scheduler source files match
  `git show` at the exact base byte-for-byte. Server chain remains83; SQLite50
  registry/source is unchanged. All five C denials remain unchanged.
- Server83 SHA-256:
  `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
  SQLite50 SHA-256:
  `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.

Database validation used only task-owned `otr-cp14-b2-preflight`, the locally
installed Supabase PostgreSQL17.6 image, `--network none`, no published ports,
synthetic identities and disposable local trust authentication. The existing
schema-only platform fixture and hash-pinned helper definitions were read by the
accepted replay harness. Existing shared/Builder databases were not mutated.

Reproduce after replaying the unchanged migration chain in that isolated container:
`python3 scripts/cp14/b2-review-preflight.py`. Logs:
`/private/tmp/cp14-b2-review-preflight.log`, `/private/tmp/cp14-b2-selected.log`.

**NOT IMPLEMENTED / NOT CLAIMED:** B2 package schema/adapter, durable semantic
publication/recovery, N→M or augmentation through B2, user review transport, CP13A
prepare-response recovery through B2, A2 non-interference through a running B2
client, full B2 adversarial matrix, broader/full application suite, live custody,
OAuth/JWT/MCP, public client or device acceptance. Existing foundation passes do
not constitute B2 acceptance. Capture/Day/Ledger and other unaffected code was
preserved, not represented as newly end-to-end validated. API/DATA_MODEL/OFFLINE_SYNC
were left unchanged because no B2 application facts were implemented.

No new persistence/logging contains package bodies, conversations, ticket/email/
passenger/PNR/URL/token data or raw production errors. The reproduction adds only
synthetic contract probes and safe PASS output, not control-plane telemetry.

## Required answers

YES for a foundation capability below refers to the unchanged accepted Server83;
it does not mean B2 has been delivered. Application adaptation answers remain NO
where the hard stop prevented work.

| Required answer                                 | Answer                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B2 complete                                     | NO                                                                                                                  |
| Uses Server83 external-client/grant authority   | NO — no B2 application adapter authored; preflight uses the real accepted roots                                     |
| Real OAuth/JWT verifier added                   | NO                                                                                                                  |
| Public endpoint added                           | NO                                                                                                                  |
| Vendor-specific client hard-coded               | NO                                                                                                                  |
| Package claims trusted as identity              | NO                                                                                                                  |
| Package replay durable                          | YES — unchanged Server83 foundation only                                                                            |
| Same request changed bytes rejected             | YES — unchanged Server83 foundation only                                                                            |
| N→M implemented                                 | NO — no B2 path; accepted CP13B is preserved                                                                        |
| Augmentation/completion implemented             | NO — no B2 path; accepted CP13B is preserved                                                                        |
| Passenger name creates Person                   | NO                                                                                                                  |
| Booking persistence added                       | NO                                                                                                                  |
| External summary authoritative                  | NO                                                                                                                  |
| CP13B reused                                    | NO — no B2 application adapter; unchanged integration regression passes                                             |
| CP13A reused                                    | NO — no B2 application adapter; unchanged admission regression passes                                               |
| Duplicate review can allocate new authority IDs | NO — accepted Server83 replay retains IDs                                                                           |
| External client can forge OTR user confirmation | NO — accepted Server83 rejects it                                                                                   |
| Revoked grant can disclose private status       | NO — accepted Server83 rejects it                                                                                   |
| Inbound automatically calls A2                  | NO — no B2 execution or wiring                                                                                      |
| Inbound creates OTR model usage/cost            | NO — no B2 execution or wiring                                                                                      |
| sync_operations sole scheduler                  | YES                                                                                                                 |
| Five C denials unchanged                        | YES                                                                                                                 |
| Server83/SQLite50 changed                       | NO                                                                                                                  |
| New migration required                          | YES to add the literal unconfirmed review lifecycle; none authored. Explicit ordering reconciliation could avoid it |
| Runtime/provider/public-client gates CLOSED     | YES                                                                                                                 |
| Hosted Dev/Production accessed                  | NO                                                                                                                  |
| Commit                                          | NO                                                                                                                  |
| Push                                            | NO                                                                                                                  |

**INBOUND APPLICATION BOUNDARY NOT IMPLEMENTED; PUBLIC CHATGPT/CLAUDE/MCP NOT ACTIVATED.**
The requested distinction remains: implementing an inbound application boundary
would not activate those public clients.

**STOP — AGENT B2 HARD STOP / REVIEW RESERVATION CONTRACT RECONCILIATION REQUIRED.**

## Owner-authorized resumption

The owner accepted the historical hard stop and corrected the ordering in
`CP14_B2_OWNER_REVIEW_LIFECYCLE_CLARIFICATION.txt`. Proposal state is package
NEEDS_REVIEW plus immutable versioned content/references; it is not a Review
Decision. Only an authenticated explicit OTR_USER decision reserves authority.
Server83/SQLite50 remain authoritative and unchanged.

Implementation plan: (1) strict ref-only neutral package/decision schemas;
(2) injected trusted verifier and existing Server83 roots/read projections;
(3) CP13B interpretation/publication/closure and digest-bound private proposal
custody; (4) authenticated decision reservation, finite nonaccept and exact CP13A
prepare recovery; (5) adversarial tests, preservation checks and current-state
update. No new store implementation, scheduler, migration, route or activation.

## Final owner-authorized delivery — supersedes the historical stop

**B2 complete: YES / ready for independent inbound review.** The preflight above
is retained as historical evidence. The owner clarification resolves that exact
ordering conflict without Server84, SQLite51 or another review authority.

### Implemented boundary

- `src/domain/intelligence/inboundImportPackage.ts`: strict vendor-neutral v1
  package, scope, SUBMIT/STATUS and finite authenticated decision contracts.
  MATERIAL is admitted authoritative evidence; SUMMARY/INTERPRETATION is advisory.
  Counts, aggregate bytes, reference uniqueness, cross-reference consistency,
  versions, enums and unknown fields are bounded/validated. No raw package text,
  executable instruction, credential or caller verified/confirmation claims.
- `backend/src/inboundAiClient.ts`: unwired TEST_ONLY adapter with injected trusted
  host verifier. It checks original request ID/digest/action, Account/client and
  environment, then composes unchanged protected Server83 roots. The accepted
  SQL authority checks current grant, retained target and Trip scope. Ordinary
  status/proposal/recovery disclosure is reauthorized and Account-generation gated.
- Package reservation and invocation/call+START responsibility precede semantic
  publication. Run/call/reservation identities are stable; interrupted invocation
  reconstruction uses the originally retained configuration, not mutable new pins.
  Exact completed invocation replay recovers its original proposal digest/version.
- Real CP13B deterministic Flight interpretation, match/consolidation, evidence
  lineage and closure remain authoritative. External summaries never enter the
  interpreter. N→M, duplicate/passenger evidence consolidation, heterogeneous
  declarations, contradiction, completion and deferred augmentation reuse CP13B.
  No passenger-to-Person mapping, booking persistence or direct Event writes.
- Proposal state is existing package NEEDS_REVIEW (or DEFERRED), review_version,
  RUN publication references and a Server83-selected private content digest.
  Proposal display reserves no decision and allocates no Confirmation/slot/
  operation/intended Event IDs. Repeated authorized status returns identical
  semantic content; refresh increments review_version.
- Only verifier-derived explicit OTR_USER ACCEPT/REJECT/DEFER reserves an exact
  decision. Current proposal hash/version, Run generation/Input digest, Candidate
  hash and real Event revision are checked. ACCEPT IDs persist before CP13A prepare;
  REJECT/DEFER retain four null IDs and an empty Input map. Sealed historical
  decisions survive refresh and never assert acceptance of a newer proposal.
- CP13A preparation queues the existing C_PREPARE_CONFIRMATION operation, preserving
  TRACK_C field proof, lineage, slot claims and expected revision. Prepare response
  loss/reopen recovers that exact durable intent. Recovery can record a previously
  prepared intent after a later proposal refresh without preparing/applying it again.
  Canonical execution and canonical-response receipt recovery remain unchanged CP13A.

### Trusted host ports and limits

This ships the closed application boundary, not an activated host. As with accepted
A2, Server83 reads and admitted material/publication seams are injected trusted
ports; no production read gateway, verifier default, store, bucket or transport is
installed. `readPackage` / `readInvocation` / `readDecision` project existing
Server83 facts; `readPublishedRun` projects the existing admitted Run. Host reads
must retain original call configuration, sealed hashes and Account/Trip scope.

`projectionMaterial` is immutable private content addressed by the digest selected
in existing Server83 safe_result/safe_response. It retains CP13B interpretation and
closure references/settings for exact replay, has a 4 MiB envelope bound and cannot
reserve consent or canonical authority. It is an injected accepted-custody content
seam, not a second proposal journal or new store implementation. Missing/corrupt
exact content fails closed. The tests' disposable private files and transport double
are fixtures only; actual SQL-mode tests use real unchanged Server83 roots.

After an uncertain decision reservation, absent exact CP13A preparation evidence
returns UNKNOWN with the retained IDs and does not repeat prepare. The durable
reservation remains the authoritative Server83 record; the adapter does not invent
an ordinary UNKNOWN→resolved transition or claim nonexecution. Existing durable
Server83 UNKNOWN records remain subject to its separately authorized recovery rules.
Canonical response uncertainty is resolved by existing CP13A receipts, not this
adapter. Package/status/prepare acceptance always returns canonical_acceptance=false.

All protected-root invocations enforce their existing grant action checks, including
STATUS when the adapter verifies/discloses the current reservation. Hosting must
provide those admitted transport actions; package claims never grant them.

Inbound calls are INBOUND_TOOL with no provider/model attribution, null model-unit
and cost quantities and no automatic A2 routing/execution. No OTR model usage/cost
or fake billable usage is produced. Five C denials, sync_operations scheduling,
Capture ownership and runtime/provider/public-client closure remain exact-base.

### Final validation

- Fresh disposable **network-none** PostgreSQL: unchanged exact1→83 replay PASS;
  seeded82→83 preserved prior table definitions, public function bodies and auth row.
  Accepted **548 checks +7 B2 preflight probes =555 PASS**, including75 residual
  security/request-binding checks. No shared fixture was mutated.
- `backend/src/inboundAiClient.test.ts`: **46 PASS** in normal fault-injection mode
  using real CP13B/CP13A/native SQLite50, and **46 PASS** against real unchanged
  Server83 protected roots. Includes proposal without consent/IDs, exact status and
  historical replay, authenticated finite decisions, lost package/material/
  invocation/decision/prepare responses, config retention, proposal refresh,
  refresh-before-prepare recovery, native SQLite reopen, current Run/Candidate/
  material/Event staleness, Trip/grant revoke/expiry, Account A→B→A, cross-scope
  claims, staging deferral, 1→many, many→1, advisory summaries, contradiction,
  arrival completion and passenger augmentation deferral.
- Full suite: **199 files /2396 tests PASS;1 existing test FAIL** in
  `src/domain/architectureBoundary.test.ts`: unchanged
  `src/features/ledger/LedgerExpenseDetailScreen.tsx` imports `@/data/api`.
  Both the failing guard and offending file are byte-identical to the exact base.
  CP13A/B, C2/A2, Capture, Day, Ledger maintenance, Account, sync and SQLite migration/
  reopen/FK regressions pass. This unrelated failure was not changed or suppressed.
- Typecheck, full lint, UI guard and Backend build PASS. Changed TypeScript/docs
  formatting and whitespace checks PASS. No dependency was added.
- Every pre-existing implementation source under src/backend/scripts/supabase is
  unchanged from exact base. All83 server migrations and SQLite50 remain unchanged;
  accepted reviews/A2/C2, registry, scheduler and runtime composition are untouched.
  Server83 source SHA-256:
  `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`.
  SQLite50 migration source (`intelligenceContinuations.ts`) SHA-256:
  `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
- New control-plane writes contain refs/digests, finite states/reasons and nullable
  usage; no prompt, conversation, ticket/email, passenger/PNR, URL, auth token or
  raw exception is persisted/logged. Sensitive reference content stays in existing
  private evidence/custody seams. No logging is added.
- Final logs are under `/private/tmp/cp14-b2-{replay-resume,server83-resume,
native-server83,lifecycle,full,typecheck,lint,build}.log`. Disposable B2 DB and
  dependency symlink are removed after verification; no commit/push/remote access.

### Final required answers

| Question                                        | Answer                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| B2 complete                                     | YES                                                                       |
| Uses Server83 external-client/grant authority   | YES                                                                       |
| Real OAuth/JWT verifier added                   | NO                                                                        |
| Public endpoint added                           | NO                                                                        |
| Vendor-specific client hard-coded               | NO                                                                        |
| Package claims trusted as identity              | NO                                                                        |
| Package replay durable                          | YES                                                                       |
| Same request changed bytes rejected             | YES                                                                       |
| N→M implemented                                 | YES                                                                       |
| Augmentation/completion implemented             | YES — CP13B supported dimensions; passenger augmentation remains deferred |
| Passenger name creates Person                   | NO                                                                        |
| Booking persistence added                       | NO                                                                        |
| External summary authoritative                  | NO                                                                        |
| CP13B reused                                    | YES                                                                       |
| CP13A reused                                    | YES                                                                       |
| Duplicate review can allocate new authority IDs | NO                                                                        |
| External client can forge OTR user confirmation | NO                                                                        |
| Revoked grant can disclose private status       | NO                                                                        |
| Inbound automatically calls A2                  | NO                                                                        |
| Inbound creates OTR model usage/cost            | NO                                                                        |
| sync_operations sole scheduler                  | YES                                                                       |
| Five C denials unchanged                        | YES                                                                       |
| Server83/SQLite50 changed                       | NO                                                                        |
| New migration required                          | NO                                                                        |
| Runtime/provider/public-client gates CLOSED     | YES                                                                       |
| Hosted Dev/Production accessed                  | NO                                                                        |
| Commit                                          | NO                                                                        |
| Push                                            | NO                                                                        |

**INBOUND APPLICATION BOUNDARY IMPLEMENTED ≠ PUBLIC CHATGPT/CLAUDE/MCP ACTIVATED.**

**STOP — AGENT B2 COMPLETE / READY FOR INBOUND AI REVIEW.**

## TARGETED F1 STALE-EVIDENCE CORRECTION

The independent review found four invalid NEW decisions: Candidate hash stale plus
REJECT/DEFER, and retained Source/material pins stale plus REJECT/DEFER. These were
reproduced before correction: the four required rejection assertions failed because
the adapter resolved REJECTED/DEFERRED. They are B2 defects, not baseline failures.

The production correction is one 10-line guard in the shared decision path. After
CP13B owning assessment, a NEW decision rejects with INBOUND_STALE_REVIEW if its
plan reports INPUT_STALE, STALE_BASE_REVISION or CANONICAL_EVENT_MIRROR_INTEGRITY.
These are the accepted owner's freshness/integrity findings, including Candidate,
Input/Source/material pin failures and applicable Event baseline failures. Other
assessment errors already propagate without reservation. No matching or closure
logic was duplicated or changed.

The guard executes before generated ACCEPT authority IDs, decision custody,
inbound_ai_reserve_review and CP13A prepare. It covers ACCEPT/REJECT/DEFER.
READY remains ACCEPT-only: a current incomplete/ambiguous/unsupported proposal may
still be REJECTED/DEFERRED with null canonical IDs. Existing package/version/hash /
request bindings and Server83 uniqueness protections are unchanged.

The guard is NEW-decision-only (`!retained`). Sealed historical replay is still
reauthorized and returns its immutable original disposition/IDs before owning
assessment; it does not accept newer evidence. Exact previously reserved/prepared
responsibility and lost-prepare recovery remain on their existing paths. Proposal
refresh retains newer review_version without rewriting sealed history.

### F1 regressions and final checks

Eleven runnable tests were added to the existing B2 harness, without another
framework or authority. The exact four stale nonaccept findings now reject with:
zero decision rows, no additional custody call, no Confirmation/slot/operation/
Event rows, no CP13A prepare and no outbound protected command. Positive controls
cover current incomplete REJECT/DEFER, current ambiguous REJECT and current
unsupported passenger-augmentation DEFER. Sealed REJECT/DEFER/ACCEPT controls
survive later Candidate/material changes and proposal refresh with the same IDs.
Existing ACCEPT-staleness, response loss/reopen, authenticated-client rejection,
null nonaccept IDs, duplicate ACCEPT, Trip/grant and A→B→A tests remain in the suite.

- Complete B2 normal fault-injection suite: **57 PASS**.
- Complete B2 suite against unchanged actual Server83 protected roots: **57 PASS**.
  Serial Docker fixture tests use a60-second per-test timeout; no assertion is skipped.
- Fresh network-none disposable1→83 replay and seeded82→83 preservation: **PASS**.
  Accepted **548 +7 B2 probes =555 PASS**, including75 residual checks.
- Full suite: **199 files /2407 tests PASS;1 unchanged Ledger boundary failure**
  in architectureBoundary.test.ts / LedgerExpenseDetailScreen.tsx. The guard and
  offending UI file remain byte-identical to accepted base. No F1/new-test failure
  is classified as baseline. CP13A/B, C2/A2, Account/Trip/grant, Capture/Day/Ledger,
  sync, SQLite50 migration/reopen/FK regressions pass.
- Typecheck, full lint/UI guard, Backend build, changed-file formatting and
  whitespace checks: **PASS**. All pre-existing implementation sources, Server83,
  SQLite50, five C denials, sole sync_operations scheduler and public/runtime/
  provider closure remain unchanged. No direct Event write, Person/member mapping,
  booking authority, A2 execution or model-token/cost attribution was added.
- The independent review is NOT edited. Its SHA-256 remains
  `f660f51ff34ce20c431b2aadbfa41db1d367bef38eb7dccfd8edfeaa0e294c6e`.
  Historical verdict remains PASS WITH REQUIRED CORRECTIONS until independent
  targeted recheck. This Builder update claims the bounded fix, not that recheck.
- Logs: `/private/tmp/cp14-b2-f1-{before,lifecycle,sql-lifecycle,replay,server83,
full,typecheck,lint,build}.log`. Only the owned network-none fixture was mutated;
  it and the dependency symlink are removed after checks. No Hosted Dev/Production,
  migration/store/scheduler/review authority, commit or push.

### F1 final answers

| Question                                      | Answer                                                 |
| --------------------------------------------- | ------------------------------------------------------ |
| F1 fixed                                      | YES                                                    |
| Stale Candidate can reserve new REJECT        | NO                                                     |
| Stale Candidate can reserve new DEFER         | NO                                                     |
| Stale material can reserve new REJECT         | NO                                                     |
| Stale material can reserve new DEFER          | NO                                                     |
| Valid incomplete current proposal can REJECT  | YES                                                    |
| Valid current proposal can DEFER              | YES                                                    |
| Historical sealed decision recovery preserved | YES                                                    |
| Stale rejection allocates authority IDs       | NO                                                     |
| Stale rejection invokes CP13A prepare         | NO                                                     |
| Proposal/decision separation preserved        | YES                                                    |
| External client can forge confirmation        | NO                                                     |
| CP13B remains freshness authority             | YES                                                    |
| CP13A authority preserved                     | YES                                                    |
| Inbound invokes A2                            | NO                                                     |
| Server83/SQLite50 changed                     | NO                                                     |
| New migration                                 | NO                                                     |
| Five C denials unchanged                      | YES                                                    |
| sync_operations sole scheduler                | YES                                                    |
| Public/runtime/provider gates CLOSED          | YES                                                    |
| New regression                                | NO — no new failure;11 runnable regression tests added |
| Commit                                        | NO                                                     |
| Push                                          | NO                                                     |
| Ready for targeted independent recheck        | YES                                                    |

**STOP — B2 F1 CORRECTION COMPLETE / READY FOR TARGETED INDEPENDENT RECHECK.**

## FINAL CLOSURE F2 — CUSTODY-WINDOW FRESHNESS CORRECTION

Date:2026-10-07. Owner-authorized bounded correction in the existing B2 worktree,
branch `intelligence/cp14-inbound-ai-client`. Accepted B2 HEAD remains
`cbd11b414a691b4f3761b02877b45ef9b11545a8`, whose parent is the exact accepted
A2 base `508d79efb865ac8d7fc21ff949b6e6a12746f39a`. No commit or push.

### Finding and final reservation ordering

The Final Closure review's new F1 is tracked here as **B2 F2**. Accepted B2 F1
correctly rejected evidence already stale at initial assessment; it did not cover
advancement during subsequent decision custody/authentication. The original
Builder hard stop, owner lifecycle clarification, final implementation and F1
correction above remain historical evidence. The accepted B2 independent review,
including TARGETED F1 RECHECK, Final Integration report and Final Closure Review
are not edited or superseded by this Builder claim.

The correction completes decision custody and protected command authentication /
custody verification first. At the gateway's protected execute handoff, it rechecks
current authorized package/reservation, package digest, review_version, publication
fence and exact proposal content digest, then repeats CP13B owning assessment with
current review context and published Run identity/generation/Input digest. The
same F1 freshness policy applies to every NEW disposition; READY applies only to
ACCEPT. Matching and closure policy remain in the owning orchestrator.

After assessment, CP13B's existing admission repository performs a final read-only
revision admission inside its existing SQLite transaction and Account apply gate.
It reuses `closureEvidence` / Input/material `pin` validation rather than a second
freshness implementation. The final comparison binds Candidate/Run identities,
Run generation, Candidate proposal hash, Run Input digest and exact original Input
pins; where applicable it checks the canonical Event mirror's expected base
revision. Existing local Trip and Account generation admission still applies.
Successful COMMIT and synchronous Account-gate release start the exact protected
Server83 reservation directly. There is no further admission await after release;
remote I/O runs outside SQLite transactions and the Account gate. This is a local
owning revision fence plus Server83's unchanged atomic package/version/grant/Trip
admission, not a transaction spanning the two stores.

The exact authenticated request/body digest, disposition, decision key, package /
review version, Candidate hash, private material digest and publication fence stay
in the existing immutable protected request. Server83 remains the only durable
Review Decision authority. No new store, scheduler, schema, lock service or review
authority is introduced. The owning repository's public assessment semantics and
CP13A preparation/canonical admission are unchanged.

Prepared custody content remains non-authoritative if final admission fails. It
creates no retained decision, Confirmation, slot, operation or intended Event
allocation, performs no CP13A prepare, and implies no consent. Existing custody
retention applies; no cleanup authority was added. Sealed ACCEPT/REJECT/DEFER
recovery bypasses NEW-decision admission, keeps the original immutable disposition
and identities, and still requires current disclosure authorization.

### Deterministic and durable evidence

- The three Source-advancement custody tests fail against the accepted uncorrected
  B2 adapter in a disposable copy: ACCEPT resolves UNKNOWN, REJECT resolves
  REJECTED and DEFER resolves DEFERRED. The tests reject all three with F2.
- 84 F2 cases cover all three dispositions: Source row revision, material digest,
  Candidate hash/retention, Run generation, Input observed revision/digest,
  Event base revision, real proposal review_version/content refresh, Trip revoke,
  Account A→B and A→B→A, grant revoke and verifier review revocation during custody.
  Additional barriers cover verifier, Account read, custody verification, package
  read, protected status, review context, published Run read and owning assessment.
  Post-assessment Source/Run/Candidate/Input/Event mutations exercise the final
  local fence independently of the repeated async assessment.
- Every rejected vector reads actual decision count and exact decision-key absence
  independently of the thrown error. Local Confirmation/slot/sync-operation and
  canonical Event rows are compared before/after rejection; no preparation runs.
  Actual Server83 witnesses compare full-row fingerprints of Confirmation, slot,
  execution-attempt and canonical Event tables, plus non-INBOUND_TOOL call/usage
  counts. No new canonical authority, preparation, Event mutation or outbound
  usage/cost is created. The intentional stale-evidence fixture mutation is
  captured before the rejection comparison.
- Unchanged ACCEPT/REJECT/DEFER succeed exactly once; dedicated controls prove
  SQLite and Account gate are released at protected-call entry. Concurrent
  identical callers retain one decision and stable IDs. Accepted incomplete /
  ambiguous / unsupported nonaccept controls, sealed recovery for all dispositions,
  F1 vectors, package/invocation replay and response-loss/UNKNOWN recovery remain
  in the full B2 lifecycle suite.

### Validation and preservation

- Full B2 lifecycle: **141/141 PASS** in normal fault-injected mode and **141/141
  PASS** against unchanged actual Server83 protected roots/native SQLite50;
  84 new F2 cases. Actual rejected-vector row fingerprints, exact decision-key
  absence and outbound call/usage witnesses pass.
- Accepted offline replay:83 migrations PASS, seeded82→83 definitions/public
  function hashes unchanged. Accepted548 persistence checks +7 B2 review preflight
  probes = **555 PASS**, gates CLOSED.
- CP13A/B selected regressions:103 PASS alongside135 B2 cases before the final six
  controls were added. Final full suite covers those regressions, C2/A2, Account /
  Trip/grant, SQLite50 migration/reopen/FK and sync preservation: **2491 PASS,
  1 unchanged baseline failure** across200 files. The baseline is
  `src/domain/architectureBoundary.test.ts`, detecting the unchanged
  `LedgerExpenseDetailScreen.tsx` import from `@/data/api`; no F2 failure is
  classified as baseline.
- Typecheck, full lint/UI guard, Backend build, all nine changed-file formatting
  checks and whitespace: **PASS**. Backend output remains outside the worktree.
- Existing Final Integration cross-path tests: **2/2 PASS normal**, **2/2 PASS
  actual Server83**, unchanged assertions and byte-identical test files in an
  isolated disposable copy with corrected B2/owning source overlaid. An initial
  actual run stopped at the required container-name guard; renaming the task-owned
  network-none fixture to `otr-cp14-final-acceptance` satisfied that unchanged guard.
  No Final Integration test/report or independent review was modified.
- Evidence logs: `/private/tmp/cp14-b2-f2-{before,owning,full,sql-lifecycle,replay,
server83,typecheck,lint,build,format,integration-normal,integration-actual}.log`.
  Only local disposable synthetic fixtures were used. The owned fixture, temporary
  integration copy/build output and dependency symlink are removed after checks;
  CP14 worktrees remain retained.

Only B2 adapter/tests, the reused CP13B read-only admission/handoff seam, this
appended report and narrow API/data/offline/current-state wording change. Server83
and SQLite50 hashes remain respectively
`c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93` and
`63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`.
All historical migrations remain byte-identical; Server83 and SQLite50 are still
the migration tails. A2/C2, sole `sync_operations` scheduling, all five C denials,
production factories/endpoints and runtime/provider/public-client gates are
unchanged. No Hosted Dev/Production access or activation occurred.

### F2 final answers

| Question                                             | Answer                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| F2 fixed                                             | YES                                         |
| Stale evidence during custody can reserve ACCEPT     | NO                                          |
| Stale evidence during custody can reserve REJECT     | NO                                          |
| Stale evidence during custody can reserve DEFER      | NO                                          |
| Final freshness covers Candidate                     | YES                                         |
| Final freshness covers Run/Input/material            | YES                                         |
| Final freshness covers Event/base                    | YES                                         |
| Trip revoke during custody blocked                   | YES                                         |
| A→B→A during custody fenced                          | YES                                         |
| Unchanged ACCEPT still succeeds exactly once         | YES                                         |
| Unchanged REJECT/DEFER still succeed                 | YES                                         |
| Historical sealed recovery preserved                 | YES                                         |
| Rejected stale decision creates authority IDs        | NO                                          |
| Rejected stale decision invokes CP13A prepare        | NO                                          |
| B2 F1 remains fixed                                  | YES                                         |
| CP13B freshness authority preserved                  | YES                                         |
| CP13A authority preserved                            | YES                                         |
| Inbound invokes A2                                   | NO                                          |
| Server83/SQLite50 changed                            | NO                                          |
| New migration                                        | NO                                          |
| Five C denials unchanged                             | YES                                         |
| sync_operations sole scheduler                       | YES                                         |
| Runtime/provider/public-client gates CLOSED          | YES                                         |
| Final Integration tests preserved                    | YES                                         |
| New regression                                       | NO — unchanged Ledger baseline failure only |
| Commit                                               | NO — no new commit                          |
| Push                                                 | NO                                          |
| Ready for Final Closure targeted independent recheck | YES                                         |

**STOP — B2 F2 CORRECTION COMPLETE / READY FOR FINAL CLOSURE TARGETED RECHECK.**
