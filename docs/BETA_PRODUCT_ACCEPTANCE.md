# Unified Beta Product Acceptance

Owner direction: 21 November 2026. Native is the single delivery lead after the MCP Main/Shared DEV handoff. This is the active product backlog; historical package evidence remains reference material. The goal is reliable Beta journeys, not clearing every historical TODO.

## Baseline and execution

- Latest Main `1a6ac965` includes automatic Import Analyze, readable result preview and scoped receipt polling; fixed C0 Build32/source7c73d053 installed in place. Phone remains Build27/source31e20eef. Historical baseline: Build27/source31e20eef installed in place on fixed Forms QA and iPhone, Bundle `art.xoery.otr`, Team `3K49Z2Q5X7`, exact same JS bundle. Original data retained; simulator SQLite81. No new App Attest claim.
- Shared DEV uses Root2 diagnostic-only bundle14d2c21b/container5b23daf8 on unchanged imageb4d460f and standing policy/TTL3600/role limit1. Previous43715f retained; do not restore old preactivation configuration.
- One main QA Simulator: Forms QA `C0C23E00-5016-4289-B806-92C5484BD5BA`; physical iPhone UDID00008140-001C2980269B001C. Device Hub clicks/text work; App Switcher drag did not terminate, so Owner performed cold restart.
- Ordinary approved fixes may merge/push after focused checks and actual verification. No force push, Production, new authority, protected SQL or financial contract changes. TestFlight publication requires Owner approval.

## Prioritized journey backlog

Ledger acceptance focus (Owner clarification, 21 November): reuse the existing expense, split and settlement functional evidence. Remaining checks concern wiring: the selected Trip, current Account/Actor, canonical Member roster and payer identity, Trip currency settings, expense draft defaults, independent settings readback and restart. Account/Trip changes must invalidate stale currency previews and confirmations. Test currency changes on an independent empty owned QA Trip; do not finalize settlements or change existing expense currency merely to exercise this wiring. No new financial calculation or consistency contract is authorized by this check.

| ID | Priority | Journey / user result | State | Evidence / next step |
|---|---|---|---|---|
| BETA-01 | P0 | Launch, Google/Apple login, account-specific cached Trips and restart | Google Build27 normal cloud/cold PASS; Apple Build14 evidence retained | Build27 Google dedicated Trip/P1 normal UI, APPLIED, independent server readback and Owner-assisted process cold recovery PASS. Apple prior evidence `ops/unified-prebeta-20261121/FINAL_NATIVE_ACCEPTANCE.json` retained; no new Apple run claimed. |
| BETA-02 | P0 | First-use Guest and transition to account | Initial-state coverage to qualify | Previously signed-in users cannot return to Guest: Owner rule, not a missing-entry bug. Do not reset the existing QA account to manufacture initial state. Reuse applicable Guest evidence, identify any remaining fresh-install-only proof honestly. |
| BETA-03 | P0 | Create/manage Trip and ordinary named travelers | PASS for original synthetic journey | Normal Create/companion queues and independent readback retained. Named travelers remain distinct from linked accounts/invitations. |
| BETA-04 | P0 | Day Feed, Details and P1–P6 Create/Edit/Cancel/reopen | Local/device PARTIAL PASS | Six Creates restored; P1/P3/P4/P5/P6 Edit and cold restoration passed; P2 Sparse Cancel passed. P6 duplicate gutter fixed. Participant subset qualifications and P2 formal opt-in remain explicit limits, not silent feature removals. |
| BETA-05 | P0 | Original manual operations reach formal receipts and latest server fields | PASS for representative P1–P6 minimal formal Create/Edit; known P2 visibility limit | Original seven Edits COMPLETED/APPLIED and independent readback; same Item/revisions/no duplicate. Build24 cold Day retains latest fields. New P2 Itemef0bd2a9 Create/Edit APPLIED/independent readback/r4/NZ9003/cold PASS on Build25; original local NZ9001 is unchanged. P2 PRIVATE and WHOLE_GROUP participation are separate; no shared visibility PASS. BUILD24_RECOVERY_AND_CURRENCY_WIRING.json and BUILD25_CURRENCY_AND_P2_PROGRESS.json. |
| BETA-06 | P0 | Backend outage Create/Edit/restart, then reliable recovery | PASS — controlled transport fault, not physical network isolation | Original Create2005a186 and Edit4aa434fa APPLIED/independent readback, same Itemd1e9d2f9 and cold latest Edit1. No replacement operations. |
| BETA-07 | P0 | Basic expense, payer/splits and restart | PASS — Native/Queue/independent server/cold | QA Harbour lunch NZD24, self share12, two equal splits; SYNCED/revision1 and cold UI. Root2 independently verified formalAPPLIED receipt4f02ea28…, exactsameexpense, oneobject, NZD2400/1200+1200/Bpayer/rev1. Build22 cold UI retains the same values; BETA-07 PASS. |
| BETA-08 | P0 security | Account/Trip isolation; minimum collaborative leave/revocation boundary | Account isolation evidence retained; Default-closed SQL installed/verified; actual A/B access-loss still unqualified | Reuse representative cross-account sync evidence only where contracts match. Auth/Core must establish current authoritative access-loss behavior; a404 is not revocation proof. Member Removal UI is deferred, not permission to leave unauthorized shared access. Current normal composition does not enable memberAccess and ordinary Leave/Removal is absent; Native authoritative consumer exists but Hosted port/E2E is unqualified. See BETA08_ACCESS_LOSS_READINESS.json. |
| BETA-09 | P1 | Universal/Type-scoped Import: custody → review → manual confirmation → saved item | Original V3 Analyze/recognized preview PASS; Create/Edit/Cancel/server readback/cold PASS (one TEXT) | Original batchef88ec6e auto Analyze succeeded once (DeepSeek Flash579 tokens; authoritative Task PUBLISHED). Build31 preview title/date and explicit Add plans to trip PASS; original CREATE85e5bda0 and LINKf1af APPLIED, independent readback/Day/Details/cold PASS. Build33 repairs own Imported P1 Edit: same8266 Item,87fa text Edit APPLIEDr3, Source/Doc/links retained, Cancel/cold PASS. Formal local completed-result reads reduce Core load; no repeated Provider. This is one TEXT slice, not all PDF/Photo/family Import coverage. |
| BETA-10 | P1 | Ledger Trip/Account/Member/Currency wiring | Normal cloud/cold/draft wiring PASS; pre-acceptance repair integrated | Reuse historical Ledger functional evidence. Build24 AccountScope repair reviewed. Initial preview preceded Trip acceptance and403; explicit preview after acceptance succeeds. One normalUSD commit/revision2 independently verified, cold TripUSD, LedgerUSD and draftUSD/You retained; original TripNZD/expense unchanged. Pre-acceptance repair9e3f66d2:28tests/types/UIguard/lint/independentNO_BLOCKER; actual new Trip pending hint, subsequent preview/cancel PASS. Exact pending-selection no-POST branch remains deterministic evidence, not a device race claim. No financial math change. |
| BETA-11 | P1 | Invite → explicit join → shared read, two-account isolation | Qualification / targeted QA pending | Auth owns Invite/Claim and scope qualification. Use normal identities and existing formal flow; preserve prior C04 UNKNOWN operations, do not resurrect old windows or copy sessions/tokens. |
| BETA-12 | P1 | Main UX regression and final physical delivery | PARTIAL | Build27 unified phone/simulator in-place update complete; Google synthetic Create/server/cold PASS. Complete remaining affected UI/Cancel and coverage deltas; preserve data/signing identity. |
| BETA-13 | P2 | Member Removal UI and non-blocking advanced features | TODO | Not a Beta feature-expansion task. BETA-08 security boundary must still be established. Realtime/private channels, paid Enrichment, advanced documents and unsupported owning fields stay separately scoped. |
| BETA-14 | P0 | MCP ordinary DEV account journey | MINIMUM_GOOGLE_DEVICE_PASS | Actual Google Consent123a APPROVED, Guide/Trip/P1 reads200; single title-only APPLY298bc98b responded Transportclosed, originalReceipt0f5eb507 recovered FULL/APPLIED; independent PG/freshMCP rev2/unchanged fields and relations PASS. iPhone originalApp updated Details and process-cold recovery PASS with Owner-assisted navigation. No replay/duplicate. Evidence ops/native-mcp-closure-20261121/ACCEPTANCE.json. BETA-15 stays open. |
| BETA-15 | P1 stability | MCP Consent wait / intermittent connections | OPEN | Corrected stale managed-fragment binding in browser; deployed/reviewed and real Google Consent passed. Separate existing Core sample c12e3655 confirms PG connect timeout3001ms/budget3000/noSQL/leasewait0. Fixed sanitized HTTP CONNECT_TIMEOUT category only; no timeout/retry/ACL change. Underlying cause and new APPLY Transportclosed hop unknown; retain original failures, do not equate receipt recovery with connection reliability. |
| BETA-16 | P2 Auth | Apple browser OAuth | TODO, independent of Native Apple | Missing Web OAuth secret causes400validation_failed per handoff. Native Build14 Apple login/cold remains accepted. Auth owns existing Web configuration. |


MCP evidence: [Shared DEV handoff](ops/prebeta-user-journey-20261121/MCP_SHARED_DEV_HANDOFF.md). Owner-final candidatea397 was merged/pushed as2f4c123e by MC; Native now owns follow-up.

## Current fixes retained for integration

- Local-First drafts:3d585cbf, unchanged authorization/target/retry fences;196+17 focused checks and independent NO_BLOCKER.
- P6 gutter:6dde1bb9;226 focused activity tests/UI guard and actual simulator visual PASS.
- Bounded Core dependency reason:10923e37;110 tests/scoped lint and independent NO_BLOCKER. Diagnostic metadata only; no dispatch or authorization change.
- Settlement loading feedback:fa9512a8; canonical localized loading label and disabled duplicate tap, guard/lint PASS; actual flow still pending.
- QA-only one-shot receipt consumer is temporary diagnostic code, not a release feature; retain its evidence and remove unused probe code before final Main integration.

## Bottom Sheet pre-Beta retest

The unified Sheet presents by default in regular builds. Retest the following
through normal openings on the full build. Existing receipts and prior
synthetic evidence are reusable within their original scope.

| Journey | Remaining evidence |
|---|---|
| BETA-04 / P2 | Open and cancel the accepted NZ9003 editor on a qualified Native DEV build with isolated dispatch. Build542 read the existing item, and the prior formal Create/Edit receipts are retained. |
| BETA-09 / I3 | Open and return from an existing DEV batch with a nonempty pending Review. |
| BETA-09 / I4 | From an existing failed DEV batch, use Results → Add Manually and return to that same batch. Isolated synthetic navigation has passed. |
| BETA-12 / DOC3 | Retest Plan → Add Attachment with an eligible accepted Plan and an unlinked private local document in the same Trip. Isolated synthetic local navigation and pending operation have passed. |

Beta/TestFlight remains NO GO. Sample creation follows the existing DEV
execution boundaries for the owning workflow.

## Completion contract

Every journey records PASS / BUG / BLOCKED / TODO and an actual source/build/environment. Local, queue, Backend receipt, independent readback and device recovery are separate facts. Fixed IDs survive UNKNOWN and retries. No ordinary user should need internal technical concepts to finish a task. Runtime release and Main handoff do not themselves prove product PASS. Final delivery includes Main SHA, actual journey evidence, deferred items/reasons and a Beta/TestFlight recommendation, with publication still Owner-controlled.

## Owner priority update — continuous delivery

Execution order: BETA08 authoritative Hosted revoke boundary; BETA14 same-Google MCP→SharedDEV→iPhone; BETA09 one real-material Analyze→Review→Confirm→Save using existing Provider; BETA11 normal two-account Invite/Join; remaining Build27 matrix/P2 visibility/Cancel/probe cleanup. Track BETA15 actual failure concurrently; preserve all prior PASS/UNKNOWN.

Independent integration candidates (not Native daily coding ownership): Phase A P2–P5 Manual Multi-Object, prioritized foundational integration candidate; Phase B/C AI Form and Flight Enrichment, independent and do not consume P0 resources. Native owns final Main compatibility and Beta user acceptance. Candidate SHA/actual readiness pending owning-lane handoff; no invented completion or scope expansion.

## Frozen AI Form V2 integration queue — Owner21Nov

Candidate `fbbc01573e91ad30eed22fc43cba5e0ccb0f6d8d`, branch `codex/ai-form-v2-phase-c-20261121`, reported Main baseline `f5ca1edb`, SQLite81→83. Owner reports762 checks/isolatedPG/types/Backend/iOSRelease PASS; Native Hosted/device qualification NOT_RUN. Queue at next safe unified integration window after current P0 security/MCP; recheck currentMain/Guard/migration before integration. No current Runtime/DB/Provider change. Full cursor: `ops/ai-form-v2-frozen-candidate-20261121.json`.
