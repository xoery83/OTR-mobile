# Native-04 automatic downstream — active 30 October 2026

Native stable worktree is on `codex/native-downstream-20261030`, based on main2033e6c4. Prior Native branch a5a258fa and unmerged Enrichment remain preserved. Candidate2daeab2f uses the existing discovery/Core transport, transactional accepted graph, operational notifications and lifecycle timer; committed Account/Session and generation fencing only. No new Queue, Schema, Authority or Backend deployment. Independent Auth review a92d1c61 NO_BLOCKER; current platform-only fix uses named AppState import after actual Metro dynamic-import startup failure. Latest fix four suites89PASS/typesPASS; preceding combined regression13s224PASS/UIguard/lint. Deterministic tests are not Cloud downstream acceptance.

Fresh iPad normal Email OTP Account1f3d7935, Trip eb3a3e70 and P1 6ba12b97 already passed normal Create/APPLIED, independent canonical receipt/readback and actual cold recovery. Do not recreate this prerequisite. Auth receipt: `docs/ops/auth-phase2-20261028/NATIVE_NEW_ACCOUNT_E2E.json`.

iPad QA bundle `com.xoery.otrmobile.ipadqa` now Build116, business source2daeab2f, JS095af7c9; same profile/keychain group and installation database UUID retained. Real screenshot shows original MyTrips without startup redbox. Retained Native93/60/56/54 is not latest-main full Native binary parity. agent-device screenshot works; AX snapshot still times out90s, tool owner notified. No iPhone/AD5 data touched.

Real external normal Core P3 Create op eeffb4cf / Item fab8ec55 APPLIED with independent canonical Supabase verification; iPad no local Create/manual Refresh automatically displayed it in Home/Day/exact-UUID Details and actual process cold recovery. Separate normal Host OTP helper420ad968 verified original Account and revoked only its own Session after each action. Remote title/schedule Edits ffb8ebf2 / dd4a5cba also APPLIED/independent verified, cold displayed title Edited and19:00/11:00. First idle mounted observation remained stale (foreground continuity unproven); a foreground warm-before-POST retry9699729f showed title Live in the same mounted Details after one30s cycle. Same Item, semantic revision4, single server row. Six Details mounted refresh hook149f73aa passed7s63/direct and2s14/independent NO_BLOCKER; it preserves open editors and rereads on Cancel/Save. iPad Build117/source149f73aa retains original database UUID/profile/Session. No full Native binary parity claim.

Next: same remote P3 legalSkip (prepared only), actual local Pending conflict, A/B and authoritative revocation, Trip metadata/six-family and Import-to-Pull. AX Runner still unavailable despite one bounded prepare; screenshots and existing authorized deep links work. Do not retry Runner blindly or copy SQLite. UUID discovery pagination is not a consistent cross-request change feed; generic HTTP failures are not authoritative access revocation. Remote-only Items remain read-only in current Forms absent retained local exact MANUAL Create proof; do not fabricate provenance to enable Edit. `docs/ops/native-04-downstream-20261030/` holds evidence. Full downstream/main integration remains NOT_DONE.

# Native General Account first-use acceptance — 30 October 2026

Owner's existing normal Hosted Email OTP Account4ebd independently had no Profile/Trip at baseline. Normal phone108 Login→self-Profile bootstrap→Synthetic Trip8b0a256b then P1–P6 Manual Create/Edit automatically accepted; 14 formal APPLIED receipts with exact Actor/Trip/op/admission/canonical-intent hashes validated and six unique Item IDs independently read from DEV Supabase. Phone110 actual AppSwitcher cold launch retained Session, same Trip, six real DayFeed rows/latest fields/noPending; P4 Details retained latest return08:07 and same-place. P3 checkin17:00, P5 TRAIN08:20, P6 start08:30; P2 Sparse+authored AKL/NSN Edit, not Qualified/Booking/Ticket. No Health retry, token/Session copy, new policy/SQL/Authority/Provider call or device-network change. This is existing Account first-use, not fresh signup or a new Backend isolation/offline PASS.

Fixed Home accepted P2-P5 with civil Header opening legacy generic preview without native Back/Edit: use existing owning Details after fresh Actor/Trip/epoch/revision/status check; Details/Repository still decide read/Edit. Five suites121PASS/types/UIguard/lint; independent85PASS/NO_BLOCKER; phone110 Home→P5 native Back/Edit and Cloud Edit PASS. No global _layout change. Phone110 JS0478f873 uses source2db8+this Home fix, retained Native93/60/56/54 and original DB/Session; not full latest-main Native binary parity. Receipts: docs/ops/general-account-cloud-sync-20261029/EMAIL_OTP_FIRST_TRIP_P1_P6_BUILD110.json and HOME_OWNING_DETAILS_REVIEW.json. Remaining: new signup and new physical offline/Backend ACL negatives not repeated; Home widget omits P6 although real DayFeed shows it; no-destination Home still shows timezone helper. Existing broader General/Sync evidence below remains bounded by its own receipts.

# General Account Cloud Sync — Native P0, 30 October 2026

Main-compatible code6aa553d3 passed Auth and Native composition NO_BLOCKER (independent8s234PASS), joined18s439PASS/7conditionalPG skips/types/UIguard/lint/server+capture builds, then actual primary7s124PASS/1conditionalPG skip/types/capture build. Original six dirty/index/untracked file bytes verified retained at serial fast-forward. Final normal Push pending final identity check. New signup and Mac unlock remain genuine user-interaction blockers; General Account full PASS is not claimed.

Native fixed2db8a651/38bd8cb3: exact normal Auth qualification, DEV MANUAL-only existing Coordinator/timer without account allowlist, Profile mount/DI/preflight and explicit legacy-person consent recovery included. Original Google Trip/two P1 Create/Edit/readback/cold PASS preserved; phone108 general-only JS installed in place with same Session/appDBUUID and no old QA/consent descriptor. Its cold UI shows original latest P1 fields/Everyone/noPending. New normal UI Synthetic Trip23afbfa3/op ed03e29a is independently accepted once, same Google linked Owner/Person69cb88ac, no business bypass. This is existing-Google proof, not fresh signup PASS.

DEV exact software81ad4fde/76c7846d and existing scope functionOID66180 MD50f3b543b installed/independently verified. Other four functions/policies/Source/Provider unchanged, no new Schema/RLS/GRANT/Role; old094/a055 retained. OriginalEnv/Host/sixmounts/fourfiles/health200/auth401 exact. Host/SQL returned. Auth+Native/SQL independent NO_BLOCKER;233 directed/101 independent/24 isolatedPG/55 actual-curated checks PASS. See ops/general-account-cloud-sync-20261029/DEV_NORMAL_ACCOUNT_ROLLOUT.json.

Fresh Google signup and Hosted Email OTP require an unused legitimate identity/mailbox and normal Owner interaction; no account reset, fabricated session or local-Mailpit-as-Hosted claim. Mac locked during UI test; do not claim new Trip cold or full General E2E until resumed. Existing QA smoke, representative normal P2–P6 and negative/recovery evidence remain. Enrichment/AI Scan paused, no paid calls. Latest37c5 Source PDF route retained; this integration excludes unmerged Enrichment and Root private candidates. Legacy private traveler recovery requires exact explicit consent; attempted/UNKNOWN identities immutable.

# Current implementation state — 30 October 2026

PDF Source optional software now includes normal reserve/finish, same-transaction
context opt-in and bounded original GET, all default closed/unbound. It reuses
existing Auth/Trip, Source journal, V2 verifier and Native transport; no runtime,
SQL/GRANT/Role/Secret activation or PDF E2E is included. See ADR
`2026-10-30-pdf-source-runtime-ports.md`; joined-main validation is recorded under
`docs/ops/universal-product-20261028/`.


## Active delivery

PDF optional software now carries the explicit frozen PREPARE parent from Native
through normal Auth/Trip checks to the existing SQL on one scoped Source lease.
Strict parent/upload receipts remain separate; stale identities and generations
are rejected; no automatic retries or parent fabrication. Default closed/unbound.
Joined main: five suites97 PASS, six conditional SQL skips, types/lint/capture
bundle PASS and independent Review NO_BLOCKER. No SQL/Host/Provider/Secret or
runtime activation is included. See `PDF_PREPARE_SOFTWARE_MAIN_READY.json`.

Universal Import product completion is active in the stable worktree
`/Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical`.
The `universal-product-p2-host` checkout is an older image host (`e973ffe0`), not
the delivery checkout. Reuse the attached delivery worktree; preserve untracked
Python caches and other worktrees. Start from this handoff and the specific
receipts below, not a new historical audit. Previous detailed handoff prose is
recoverable in Git `72331060`; all underlying receipts remain in `docs/ops/`.

Universal owns Source/Task/Provider/Admission, Import Activity/Results/Review,
Documents custody and Import event projection. Native owns shared Navigation,
Day Feed, Core/Queue/Sync and manual forms. Auth owns identity. Public interfaces,
DEV service/SQL changes and main updates require serial Writer coordination.

## Verified Import behavior

- Historical minimal P1–P6 formal Save Golden Slices remain accepted. Sparse P2
  only; no Qualified Segment/Journey/Booking/Ticket. These do not certify all-user
  Beta or binary interpretation.
- Normal restricted-QA product P1 and the five-file P2–P6 Batch completed real
  Source Review→Plan→Admission→Core, independent readback, Day Feed and cold
  recovery. The five accepted Items each have their own legitimate Source;
  no Cartesian Batch-to-Item links. P5 is TRAIN. The account/Trip, exact supported
  types and original 2026-11-01T08:48:56Z expiry remain the approved boundary.
- Current mixed Batch `c31cd292-bb97-4902-857c-d5cc63c86d2c` / Task
  `bcff4ba9-5136-886f-a214-00b75229c745` has one real Attempt
  `401a0382-221c-84c9-9c05-53d678c18dc6`: SUCCEEDED, Task PUBLISHED, wake COMPLETED.
  The Result is ABSTAIN/zero candidates: the Plan text does not establish a legal
  kind/subtype. Do not invent Review or Save. PDF is retained/Not processed and
  absent from the sole TXT Source binding.
- Actual normal AD5 JS101 refresh and cold My Trips→same 19:27:30 Batch→Results
  passed under the read optimization. Original/input IDs and both blob hashes
  remain exact; no Analyze/Save on recovery. Independent call count remains one:
  1506 input +75 output tokens, cached1280; recorded estimate165480nanos
  (US$0.00016548, not invoice). No new Item was created from ABSTAIN.
- Explicit Start can coalesce one user click behind a status GET; hidden,
  Account/generation or Batch transitions cancel the intent, including leave and
  return before GET completes. It is not a second queue or automatic retry.
- PDF/image Local Durable original viewing, background cleanup and normal cold
  reopening have separate Native acceptance. Local originals are not permanent
  cloud backups. Trip Documents, Personal Inbox and Import Activity remain
  separate. Saved Updates use real completion receipts and Batch event identity.

Authoritative receipts under `docs/ops/universal-product-20261028/`:
`CONTINUOUS_PRODUCT_P1_SERVER_VERIFIED.json`,
`MULTI_SOURCE_FIVE_ITEMS_SERVER_VERIFIED.json`,
`MULTI_SOURCE_FIVE_ITEMS_NATIVE_E2E.json`, `MIXED_FRESH101_INTERPRETATION_RECEIPT.json`,
`RESULT_READ_REUSE_REVIEW.json`, `RESULT_READ_REUSE_NATIVE_RECEIPT.json`,
`PDF_LOCAL_NATIVE_READER_PASS.json`, `IMAGE_LOCAL_NATIVE_READER_PASS.json`.

## Code, DEV and integration

- Read optimization source `1822be4c`: same authenticated GET reuses the manifest
  already validated by the canonical two-read/hash guard, instead of running that
  guard twice. Material tampering, second snapshot drift and Auth revocation during
  receipt read still reject; no cross-request cache. Three suites20 tests,
  typecheck/lint0errors and independent NO_BLOCKER. Native recovery above is real;
  it is not a precise latency benchmark or proof of every earlier failure cause.
- Current DEV image after Native's normal-account rollout:
  `sha256:81ad4fdea800b38c1701dc9b6bafa0885ab31fad3de9798e94977ecd55454ed2`,
  container `76c7846d534dbac3b2262fb02117c7a96d727681082444a3c744b62eacf12b87`.
  Root independently checked only actual container/image/healthy. Native reports
  curated `/private/tmp/otr-owner-manual-rollout-20261029/backend-general-normal`,
  serverb64b90d8/capture2077c8a3, Config65a03026, unchanged Envab5/Hoste89/six
  mounts/four files, health200/auth401 and Enrichment closed. Old094/a055 is
  stopped/retained, not the automatic rollback target for future Import work.
  Preserve the new normal-account behavior and fresh-check complete hashes before
  any deployment. `NATIVE_NORMAL_ROLLOUT_HANDOFF.json` distinguishes reported SQL
  from Root's container-only verification; full General E2E is not claimed.
- Root read receipt uses only Synthetic QA Account
  `f4b059c5-8241-4ffb-aa15-37fa25474543` / Trip
  `825f79b2-4a9d-4535-a62e-43000ca50c4a`. Source sustained scope and Provider
  budget/expiry have not been enlarged. Fresh-check actual gates before mutations;
  no Root temporary admin or Provider window is open.
- Latest Import integration: main/origin/remote
  `89680f071d4133869fa2003edec65e7c2c2382c7` joins accepted Native General
  `f3a9a21d` and the reviewed Source503 repair3d5c6881. Actual-primary six suites96
  tests/typecheck and independent NO_BLOCKER; original six dirty/full tracked/
  index/untracked bytes exact. `SOURCE_503_MAIN_INTEGRATION.json`. No deployment,
  Source/Provider authority change or execution of the pending catalog diagnostic.
- Previous PDF software integration: main/origin/remote
  `37c5e08913bacb304243100e785633cb6b4c59a0` (software code c6b15be8),
  actual-primary15 suites228 tests,
  typecheck and capture bundle PASS. PDF software remains optional/default closed;
  no DEV deployment/SQL/authority activation occurred. Original six dirty entries,
  full tracked/index/untracked bytes exact. `PDF_SOFTWARE_MAIN_INTEGRATION.json`.
- Previous Import integration `e13a95076ca08722464e7dd0ca5e210aa74b9ee1`
  contains the actual expiry/cold receipt. Actual-primary six suites262 tests and
  typecheck PASS; original six dirty entries/full diff/untracked bytes exact.
  Missing Google Sign-In16.1.5 was restored only from the locked tarball after
  SHA512 verification, without dependency/lockfile changes. Auth owns main Writer
  again at that checkpoint. Source503 repair is now integrated above, not installed.
- Earlier completed Import main push: `11c7feaa`; original primary six dirty entries,
  full tracked/index diff and untracked bytes were preserved. Auth subsequently
  integrated its local-only Source/journal work through main `72331060`.
  Root privately joined that main at `c66d968b`. Read implementation/evidence
  source `d3a5e4e0` passed actual-primary six-suite91-test Smoke and exact original
  six-dirty/full-diff preservation under a serial FF integration; verify fresh refs
  before the next main update.
  Latest main is not automatically the source of the curated DEV image.

## Remaining checkpoints

1. Expired zero-Attempt lifecycle `66498648` is NATIVE_E2E_PASS for the same
   current-run Batch f68bc4fa / Task c2704309 only. Owning claim closed it through
   existing `wait`: PENDING/revision2→FAILED/DEADLINE_EXHAUSTED/revision3, Queue
   COMPLETED, zero Attempt and independent Provider calls0; ID/policy/deadline exact.
   AD5 JS107/Native95 displays failed state, hides Analyze after the owning read,
   retains originals and restores the same state through GET and cold My Trips.
   No UNKNOWN/hold/old Batch sweep. See `UNSTARTED_TASK_DEADLINE_NATIVE_RECEIPT.json`.
   This acceptance ran on09465509 with Native8e269985 Profile/FK base; that image
   is now retained after Native81ad4fde rollout above. Preserve the new actual
   deployment, not the older acceptance image. No current Root service lease.
2. PDF/OCR Source→Task/Admission remains NOT_READY. Reuse the restored V4
   preparation/causal/storage ports, V2 proof reader and fixed qpdf/Poppler worker.
   They remain unbound/default closed. Existing V4 scope is pinned to historical
   objects and cannot be borrowed. Global PDF gate remains closed; normal scoped
   binding, legitimate ORIGINAL/DERIVED identities, exact evidence qualification
   and isolated Host execution need a precise reviewed owning packet. No evidence
   currently justifies new Schema/RLS/GRANT. Existing V4 preparation now has a
   default-closed HTTP candidate: normal parent Auth/Trip, owning generation,
   Stage/dispatch/causal-read delegation, no internal capabilities in responses.
   Eight suites121 tests/types/lint/bundle and independent NO_BLOCKER passed;
   server/serverCapture do not provide its optional port. See
   `PDF_V4_PREPARATION_HTTP_LOCAL_PASS.json`. Explicit Native transport also passed
   six suites77 tests/types/lint and independent Review, reusing normal Auth,
   immutable Capture custody and the original read quota; no caller is wired.
   `PDF_V4_NATIVE_TRANSPORT_LOCAL_PASS.json`. The same Original Source adapter also
   has an explicit default-closed PDF metadata option: only PENDING, never VERIFIED;
   same RPC/receipt verifier, no bytes/IO/Task authority. Six suites64 tests/types/
   lint and independent Review passed. `PDF_PENDING_ORIGINAL_LOCAL_PASS.json`.
   Original/derived provenance is now an additive default-closed software bridge:
   exact PDF original identity/hash/size stays separate from sealed text material;
   Task transform must match and cannot lose provenance on readback. Six suites84
   tests, types/lint and independent NO_BLOCKER passed after directed RED→GREEN.
   `PDF_SOURCE_PROVENANCE_LOCAL_PASS.json` (ef00fc8d). The owning lifecycle snapshot
   also reuses the existing V2 seal proof for exact DERIVED text: five suites75
   tests/types/lint and independent NO_BLOCKER, with ordinary ORIGINAL TEXT kept.
   `PDF_LIFECYCLE_SNAPSHOT_LOCAL_PASS.json`. Actual eligibility remains closed.
   A Source-gateway catalog-only diagnostic was rejected by auto-review as a new
   credential use; no execution/bypass occurred, and exact read-only approval is
   pending while other local work continues. No actual PDF Source/Task/Save PASS.
3. Source uncertainty classification now preserves non-closed503 as
   `SOURCE_REQUEST_UNCONFIRMED` rather than claiming dispatch was disabled. Only
   an explicit bounded Backend closed code is CLOSED. Four suites76 tests/types/
   lint and independent NO_BLOCKER; SQLite UNKNOWN/cold recovery proves one acquire,
   same operation and receipt-only completion. `SOURCE_503_UNCERTAINTY_LOCAL_PASS.json`.
   Now main-integrated on the accepted General baseline with actual-primary six
   suites96/typecheck and independent Review. Still no new Native installation or
   actual deployed failure/recovery acceptance.
4. Complete the remaining input failure/offline/Account/Document permission matrix;
   distinguish LOCAL_PASS, SERVER_VERIFIED and NATIVE_E2E_PASS. No repeated model
   benchmark or full six-slice audit. Preserve all older expired Batches, UNKNOWN
   calls, holds, originals and receipts; no blind replacement or automatic resend.

## Other lanes and resource safety

Native thread `01a17101-8b2d-7240-ab67-f4c34a5d90d9` owns its manual E2E and current
normal-account E2E. It reports `trip_sustained_dev_scope_allowed` OID66180 now
MD5 `0f3b543bab2431ee35c519ad8ce01ea9`, replacing8b7e while preserving Owner/ACL,
Source policy/guards, four other functions, policy rows and receipt counts. Root
has not queried SQL for this handoff. Never restore older allowlist functions or
images over it. Native returned its service window and uses phone108; Root has no
Host/SQL/main/GUI lease and does not inspect those users' data or copy credentials.

Auth thread `01a1803b-c5a7-7ab0-a90f-fb4f87609201` owns Guest journal v3/source
projection and the separate normal-JWT self-profile port candidate `2b2fd000`.
That Profile port is not an Import acceptance result or broad authority. Native
owns its Backend mount/DI. Do not integrate unaccepted private candidates for them.

AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A` is Import; Forms QA/phone are Native.
Use short coordinated Device Hub access, preserve My Trips root, original Native95
binary compatibility and SQLite74. Do not copy Session/Keychain, operate Production
or real-user data from this lane. Keep heavy builds serialized and bounded.

## Auth / Identity — current checkpoint, Adoption NOT_READY

Resend Inbound OTP host QA helper: first real new-user E2E PASS on source8496a994,
one OTP send, trusted Auth read, separate host-process encrypted Session restore,
Backend empty Discovery/foreign-Trip negative, refresh/local logout/revoked refresh.
Direct/independent28 tests and receipt/hash review PASS. Owner-confirmed QA-only
team is the isolation boundary; full-access key is only the new exact Keychain
item, never SMTP or Native. Reuse entry is released; every Native fresh-signup run
needs a NEW mailbox and its own App verify/cold proof. Guest publication remains
closed. See ops/auth-inbound-otp-20261030/{FIRST_USER_E2E,READINESS}.json.

Fresh-signup P0 accepted on Native Build114: Provider OTP had verified normally, but unconditional
Guest-marker rejection blocked local Session installation even with no saved data.
Strict empty-workspace qualification now freezes zero Trip/P1 registries before UI
memory clear, checks every business table/recovery record under the exact transition,
and installs through normal Account slots/index. Direct Guest writes/nonempty/unknown
still reject; no Guest cleanup/publication or full Adoption PASS. Cancellation,
index-write recovery/retry and release-before-bootstrap regressions are reviewed;
independent8s181 and direct9s217 PASS. Same registered-email normal new challenge
installed the original Account1f3d (created00:09, confirmed00:17), followed by first
Trip/P1 formal receipts and actual device cold recovery. Auth independently
validated provided database/UI artifacts and Core receipt/intent hashes; no Guest
cleanup, QA enrollment, Host Session or complete Adoption claim. See
`ops/auth-phase2-20261028/NATIVE_NEW_ACCOUNT_E2E.json`.
See ADR `2026-10-30-strict-empty-guest-session-install.md`.

Auth owns `auth-identity-delivery-20261028`; use existing Supabase Auth, per-Account
secure slots, repositories and apply-generation gate. Apple is Owner-paused. No
new Auth authority, copied Session/Keychain/SQLite, pricing, Schema/RLS/GRANT or
production access. Auth has no device/Host/SQL lease. Native owns shared mount/DI,
normal Sync and Core; all delegated Guest UI/Repo/PgStorage leases were returned.

- Email/Google login L3 accepted within Phase1 evidence: normal Provider login,
  independent Account/Session readback, cold restore, A/B isolation and current-
  login logout. Token-only eight-digit OTP uses Verified Resend `auth.xoery.art`;
  wrong403/resend429/expiry PASS; temporary expiry restored3600s. Native52 visible
  error repair accepted. `ops/auth-phase1-20261028/{GOOGLE_DEV_E2E,
  EMAIL_OTP_HOSTED_DEV_E2E}.json` records limits, not full People/Beta acceptance.
- Golden A accepted: GuestQA63/source7e35baf6, genuinely no formal Session, normal
  Native Trip Create/Edit→P1→Day→same-version cold, SQLite74 independent readback;
  no Account DB or cloud receipts. `GUEST_A_NATIVE_RECEIPT.json`. GuestQA65 then
  accepted finite unsaved-editor/old Trip+P1 cold regression, not Adoption/new
  cloud data. `GUEST_B_GUESTQA65_ARTIFACT.json` pins unchanged actual source.
- Main through72331060 includes frozen current schema74/fileless Trip/P1 source,
  full supported-table census, Trip/P1 live-draft journal and immutable journalv3
  semantic source. Other nonempty/unknown families or unqualified files block the
  whole dataset; registered-file proof is not physical-disk absence. All original
  Trip/Person/operation/Core hashes, metadata dependencies, static covers, Ledger
  initialization and timestamps retained. Source/canonical journal proof is local
  only, never authority. Actual-primary source107 and journal130 tests PASS;
  independent NO_BLOCKER, original six primary dirty files/full diff preserved.
- Reviewed default-closed Auth source bdc6c44f joined main ef5d7ea6 at26a190cf:
  checkpoint assembler b869 pins target and original freeze lease; c945 derives
  strict preflight resource facts from same source/files/drafts, not caller counts
  or unsaved Trip shells. Directed6/independent135+cancel1 and facts supplement2
  PASS/NO_BLOCKER. Initial two unchanged 5s old-test timeouts passed single-worker
  30s rerun. No production Native consumer or publication follows.
- 30 October preflight/status now require trusted NORMAL_ACCOUNT after UUID
  validation and before body/port access. Anonymous/UNKNOWN/id-only negatives
  reproduced200 before repair and now403 without owning calls; normal missing
  adapter stays503. Directed and independent4 suites88 PASS, types/scoped lint
  PASS/NO_BLOCKER. Routes remain unmounted, no server authority or DEV change.
- 30 October private composite plan/stage candidate now pins owning stage SHA to
  immutable v3 preparation plus grant/source/target/inventory. Shared pure journal
  codec retains validated P1/Trip Draft bytes in private plan/2 (saved-only stays
  plan/1), with exact grant draft count; files/unqualified photo refs still reject.
  Draft byte preservation does not qualify post-Adoption restore/publication. Existing PG lease stores exact immutable private source,
  actor collision/retry fenced; outer timeout/cleanup after COMMIT remains UNKNOWN,
  late callbacks cannot COMMIT. Direct/independent2s33 PASS, isolated network-none
  PG13 checks PASS (reviewer read report only; three newer Gateway roles absent in
  fixture). Draft supplement direct10/independent4s70 PASS, unchanged journal27
  and owning SQLite workspace101 PASS; isolated PG14 now also reads back all three
  draft types exactly. Local-only SQL has no RPC/runtime grants. Core Writer review and real
  grant issuer/publication authority remain pending; no Adoption/Hosted PASS.
  Private stage status adapter uses strict four-way binding and owning read-only
  transaction; direct/independent11 PASS after real unfinished-lease RED repair.
  It returns only IN_PROGRESS/NOT_FOUND→QUERY_SERVER_STATUS, not terminal proof;
  no runtime consumer. See ops/auth-phase1-20261028/composite-publication-candidate/REVIEW.json.
- 30 October explicit identity candidate revalidates immutable plan/source and all
  owning TripCreate initial fields, maps source Creator to the actual Owner Person,
  and retains unlinked People, operation IDs, base vectors and source/mapped hashes.
  Direct/independent identity/plan/draft3s50/types PASS, NO_BLOCKER; authority NONE. It neither proves
  caller-supplied receipts nor initializes People/Ledger, restores Drafts or publishes.
  Native reaffirmed candidate-only delegation; three-principal authority remains pending.
- Provisional metadata client7365 uses the existing secure Guest verification slot
  while launch stays Guest. Checks kind/UUID/generation around token/dispatch/
  result. 401 refresh reuses existing Supabase path with active persistence off,
  old-refresh CAS and binding/generation coalescing. Strict DTO/grant pins;
  NOT_FOUND never unlocks. Direct17/independent4suites115/types/lint PASS. Unit
  JWT-shaped fixtures, memory storage and simulated wire are not Provider/Keychain
  or Adoption L3. Backend preflight/status still unmounted/default closed.
- Native discovered verified38e/4eb accounts lack profiles, and actual Trip FK
  requires them. Auth normal-JWT self-profile port2b2 plus anonymous guardbdc6
  reads own ID→insert-if-absent `{id,display_name:""}`→readback, omits role, never
  overwrites a profile or borrows Claim. Anonymous/absent user rejects. Direct22,
  independent21+anonymous1/types/lint PASS. Auth read-only review of Native exact
  route/DI/sync preflight NO_BLOCKER (Native direct44). Native alone deploys and
  verifies normal same-operation retry; no actual profile/Trip success claimed yet.
  Failure pauses sync, never offline launch. `ACCOUNT_PROFILE_BOOTSTRAP_PORT.json`.
- Held Core/TripCreate/MetadataV2 ports db97/main ee246 retain three distinct
  session_user fences. Directed148/independent131 and disposable real-PG1 PASS
  prove leases, not composite publication authority. Do not bypass these fences.
  P1 CREATE local checkpoint restoration is accepted; EDITv1 lacks owning revision
  and remains closed. Full Native recovery route, server preflight/reservation,
  protected atomic publication/cancellation, Person/Creator mappings and authorized
  receipt readback remain missing. No real Adoption E2E or Phase3–6 completion.

Actual-primary9 suites273 PASS and joined types PASS; original six dirty files/
full diff preserved. AUTH_PREPARED_MAIN_INTEGRATION.json records source-only scope.

Next: finish Native normal-account Profile/Trip recovery readback. Continue
Golden B server authority and Native recovery through unique Writers, then actual
Guest→Account/negative/duplicate/UNKNOWN/cold E2E. Owner approval is required only
for an exact protected execution delta, not routine coding. No Owner OTP before a
runnable real scenario; no invented commercial limits.

Auth receipt directory: `docs/ops/auth-phase2-20261028/`. Start with
`GUEST_B_SOURCE_MAIN_INTEGRATION.json`, `GUEST_B_DURABLE_SOURCE_MAIN_INTEGRATION.json`,
`GUEST_B_HANDOFF_CHECKPOINT_REVIEW.json`, `GUEST_B_PROVISIONAL_TRANSPORT_REVIEW.json`
and `GUEST_B_ATOMIC_PORT_CANDIDATE.md`; prior detailed state is preserved in Git.
