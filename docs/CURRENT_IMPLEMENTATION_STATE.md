# Current implementation state — 29 October 2026

## Active delivery

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
- Last Import-verified DEV image:
  `sha256:c8f9dbce0b15c13ab46a921d7fed4a467812606a59d84d56672a423714df7f9a`,
  container `d32e8370295c0d3622bcf3c8be76e234c6eb1574f612fd7617ccd09452a852af`.
  Server bundle1098…, capture9c0915…, Configc91f…, HostConfige89…, Envab5…,
  original six mounts/four config hashes, health200/unauth401 independently passed.
  Previous750a/4847 is stopped/retained rollback. No SQL or permission change.
  Native now owns its next diagnostic deployment: always obtain its newest actual
  image/config before deployment or rollback; do not restore an older image over it.
- Root read receipt uses only Synthetic QA Account
  `f4b059c5-8241-4ffb-aa15-37fa25474543` / Trip
  `825f79b2-4a9d-4535-a62e-43000ca50c4a`. Source sustained scope and Provider
  budget/expiry have not been enlarged. Fresh-check actual gates before mutations;
  no Root temporary admin or Provider window is open.
- Last completed Import main push: `11c7feaa`; original primary six dirty entries,
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
   Actual DEV09465509 retains Native8e269985 Profile/FK base; server9b13037
   unchanged, capture6cb771…, same Env/HostConfig/6mounts/4files, 200/401 PASS.
   Prior8e269985/c92b9 stopped/retained. Native has Host/SQL Writer back; always
   obtain its newest actual image before deploying or rolling back.
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
   `PDF_V4_NATIVE_TRANSPORT_LOCAL_PASS.json`. No actual PDF Source/Task/Save PASS.
3. Complete the remaining input failure/offline/Account/Document permission matrix;
   distinguish LOCAL_PASS, SERVER_VERIFIED and NATIVE_E2E_PASS. No repeated model
   benchmark or full six-slice audit. Preserve all older expired Batches, UNKNOWN
   calls, holds, originals and receipts; no blind replacement or automatic resend.

## Other lanes and resource safety

Native thread `01a17101-8b2d-7240-ab67-f4c34a5d90d9` owns its manual E2E and current
normal TripCreate diagnostics. Its separately approved two-account rollout updated
`trip_sustained_dev_scope_allowed` OID66180 to MD5
`8b7e35a4e6f8512f1aa90c5cb98f9ed7`, preserving Owner/ACL and Source scope. Never
reverse it to the former account literal. Its next software image must retain the
Import read change. Root does not inspect those users' data or copy credentials.

Auth thread `01a1803b-c5a7-7ab0-a90f-fb4f87609201` owns Guest journal v3/source
projection and the separate normal-JWT self-profile port candidate `2b2fd000`.
That Profile port is not an Import acceptance result or broad authority. Native
owns its Backend mount/DI. Do not integrate unaccepted private candidates for them.

AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A` is Import; Forms QA/phone are Native.
Use short coordinated Device Hub access, preserve My Trips root, original Native95
binary compatibility and SQLite74. Do not copy Session/Keychain, operate Production
or real-user data from this lane. Keep heavy builds serialized and bounded.

## Auth / Identity — current checkpoint, Adoption NOT_READY

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
