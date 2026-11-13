# Auth Lane D — current handoff, 5 November 2026

## Apple sign-in candidate, 13 November 2026

Owner approved and registered `art.xoery.otr`, Team `3K49Z2Q5X7`. Native Apple
SDK 57.0.2, nonce/ID-token Adapter, explicit Account linking, optional first-name
suggestion, Settings and login entries are implemented in the Auth branch.
122 focused tests, UI guard, scoped lint, isolated native prebuild and initial
iOS JS export passed. Independent Review's unmount/confirmation finding is fixed
with three regressions. Hosted DEV Apple Provider independently reads enabled.
New-Team Release build, strict/deep signature verification, isolated iPhone 16
Pro install and first launch/exact-PID alive readback passed. Owner confirmed
first Apple login with Hide My Email and same-Account Session recovery after
exact process cold restart (74426 → 74439), without another Apple authorization.
Owner also confirmed normal logout, cancelled Apple sign-in remaining signed out,
and same-Account relogin. Source `e013bf5d`, receipts in the ops packet. Separate
fresh-Guest device and second Apple QA identity qualification are requested.
Owner confirmed the wired iPad Air 5 is available with the same Apple identity.
Nonempty Guest custody exposed the added optional name as a strict-schema and
canonical-undefined compatibility gap. Both failures reproduced RED; the minimal
local fix and 47 targeted tests plus independent Review pass. A new signed iPad
build must carry this fix before the Guest Trip/P1 Adoption attempt.
Signed iPad build `58bedc01` was installed in a new App container. Owner created
the Guest Trip/P1 normally and confirmed cold recovery. Apple Adoption's first
failure is the missing DEV client `EXPO_PUBLIC_OTR_GUEST_ADOPTION_ENABLED=true`
build opt-in, not a Hosted receipt. The scoped build-config repair and private
Apple-name projection from remembered-Account lists are ready for device update.
Build `96762acc` now has the actual packaged DEV Adoption guard independently
verified true using the standard ignored Auth-worktree public DEV environment.
The in-place update retained the Guest container. Owner reached confirmation and
submitted once, then received generic adoptionPending. Original attempt
`7da7240f…` has a local PREPARED checkpoint, no local publication marker observed;
Root2 independent read-only PG confirms policy disabled (xmin 33417), with
zero original grants, stages and terminal receipts. Existing close helper and
current runtime config pins match; a new finite timer/window is not yet
authorized or verified. AgentDeviceRunner is restored with its original Team
and can read/operate the isolated iPad App, including the original Day Feed P1.
PREPARED cold-reentry repair `237e4c66` passed 69 focused tests, independent
Review and signed iPad normal-Account-page recovery to the original target.
The in-place update preserved exact prepared checkpoint bytes. No new Apple
authorization or Adoption submission was made. One finite Hosted window packet
`f29441e7…` has Root2 static alignment and independent Review; approval, actual
negative closure drill/arm and fresh CAS remain required before activation.
Preserve this attempt, avoid retries
or new IDs, and use `ADOPTION_RESUME_CURSOR.json` in the Apple ops packet.
Existing GuestQA/native identities and data are preserved. Non-empty Guest
Adoption remains incomplete; dual-Apple-user isolation remains NOT_RUN.
Supabase automatic same-email linking policy needs acceptance verification.
New-bundle Google is unavailable until its own iOS Client exists.
Evidence and continuation are in `docs/ops/auth-apple-native-20261113/`.

Primary: **AUTH-C04 — Invite / Claim / Multi-member**.

**IN_PROGRESS — current checkpoint, 5 November.**
Native14752 first-launch repair is proved by parent-verified runtime receipt
`5bee6244b92cd435e2a160c9c3daf5123dd454a459c0de05c045b4a8e8f6f7d0`:
0e31/review0cbb/runtime dc91, same C0/BID, normalopen0/PID49593/MyTrips empty.
Own session/claims/daemon released02:20:17Z. Principal/Guest/unfinished-outgoing
queue census and actual B reads remain NOT_RUN. Automatic network was not observed;
this is not totalHTTP0 proof, nor a14755Keychain cause. Old window stays closed.
Native dedicated child has STARTED fresh B-only packet preparation via existing
lawful census paths; no clearing/new diagnostic layer. T/D=null; no new OTP/device authority.
Root2 requal02 SHA `ee45a2dd45fb7f874ec676a708a48a390a6006d97a3e56b4e8db79f744781694`
adds no SQL/deploy prerequisite. Saved02:01:52 health is not fresh B/runtime proof;
future Source5 execution must recheck runtime. No Root2 window is held.

C03 same-Account AKA binding/recovery narrow check is complete: **NO_NEW_DELTA**;
existing DTO/Repository/account fences/recovery evidence reused, no tests rerun.
Reconciliation `fc8776e8…e1361`:
`docs/ops/auth-c03-20261104/interface-packet/AKA_BINDING_SOURCE_RECONCILIATION_20261105.json`.
C03 Self Trip Nickname Auth consumer is now local Mock PASS at `a2ba2bec`:
4 Auth-owned Draft/Repository/test files consume Root1 exact Canonical leaf.
38 direct tests/scoped TS/lint passed; parent static Review has no local-source blocker,
without rerunning or upgrading Mock evidence. Formal Core Backend/PG port and Native
integration remain pending under request `AUTH-C03-TRIP-NICKNAME-OWNING-PORT-20261105-01`.
Handoff `docs/ops/auth-c03-self-nickname-20261105/SOURCE_HANDOFF.json` selects4 Auth
files+docs; Canonical2leaf is Root1 dependency, never whole-branch overwrite or activation.
Auth source pins are actual main: Canonical8907, Authconsumer98e1, CorePG2f53,
HTTPa36 and appoptionalhook/latest `0f43dd17` (postb6a020b6, no Startupinjection).
The nextcandidate is only2 Startupforward lines, reusing explicit startOptions;
2temporarytarget Mocktests/types/lint PASS, sharedStartup/index/env untouched.
Default remainsundefined/closed. Parentreview/Root1freshCAS pending.
Actual deploymentconstruction awaits one Core/Root2 qualifiedexistingPGconnection +
explicitcapability ABI request; existingtrip.coreConnection is HTTP, notPG.
Root2installNOT_READY: no SQL/runtime/OTP/window activation follows.
Packet: `docs/ops/auth-c03-self-nickname-20261105/startup-forward-candidate/`.
C04freshB/Native consumer engineering continues independently.

MC actual next=null/candidates=[]; no new Ready task was claimed or invented.

MCP support47a3d2ee/fad82f42 is source-only reviewed, NOT_INTEGRATED/NOT_LIVE_READY;
main/UI/credible cross-Host completion bridge remain absent. This does not replace C04.
Plan/cursor: `docs/ops/auth-c04-sync-c02-native-consume-20261105/`.
Host41e8 authority remains consumed/closed; ATTEMPT retained. No borrowed Session,
new window/OTP/write/device or protected Profile install authority follows here.
Guest data are preserved; oldf5e/4028 remain UNKNOWN and frozen.

## Latest actual Golden Slice

**PASS_HOSTED_DISTINCT_SHARED_P1_A_WRITE_RECEIPT_A_B_READ**, not whole C04 PASS.
Fixed source04bf6c90/review73578aaf/Root2 qualification1d3b9ccc were used by the sole
executor `/root/auth_distinct_p1_e2e_20261105`. Actual T18:14:37.543Z,
D18:24:37.543Z on4Nov (=5Nov07:14–07:24NZDT); completed18:16:04.129Z in86.586s.
Normal A/B each1OTP/getUser; A physicalPOST exactly1. Operation41e8f597… created
Item1a0d7aa8…; immutable FULL receipt validation passed, domainReceipt4402369b…,
receiptSHAac435311…. Independent A/B normal collections validated the exact shared
P1 fields/date/owner/Person binding and equal revision. Both own local logout and
refresh rejection PASS; execution qualifier consumed/closed, no resources held.
Source packet remains frozen; current outcome is in evidence5fee89da, not its old
NOT_SENT preparation label. ATTEMPT.json retained permanently; no replay/new IDs.

Evidence/cursor: `docs/ops/auth-c04-distinct-p1-e2e-20261105/`.
No private fixture existed, so private isolation is NOT_PASS. No Native/device,
Owner UX or Member Revoke acceptance. Old f5e/4028 remain UNKNOWN and untouched.
Historical Host case intentionally stopped after its one approved execution; that authority
is closed. Current Lane work continues only through separately qualified legal slices.

### Prior qualified membership read baseline

**PASS_NORMAL_A_B_MEMBER_READ_ONLY**, not whole C04 PASS.

- Normal A26876e6e… and B1f3d7935… each used exactly one real Email OTP, passed
  normal `/user` verification and read the same Tripfb2f0820… through Core.
- A collection200/13.635s/request140f0edf…; B200/21.046s/request4b549679….
  Existing schema/hash/actor/Trip/account-generation validation passed; B's unique
  active binding is Personbcd1d48e…. Both collections contain only2Person records.
- Both own temporary Sessions were locally logged out and refresh rejected at
  2026-11-03T22:29:17.586Z (4 November11:29 NZDT). No Session/token was copied.
  B mailbox was returned to Native for its independent OWNTrip2a70… D2 read;
  Native subsequently confirmed taking and cleaning that one normal OTP slot;
  its cleanup was independently reported PASS_LOCAL_SCOPE_REFRESH_REVOKED. No Auth Session remains active.
- No SharedItem or qualified A-private Item fixture exists in this observation:
  `NO_QUALIFIED_PRIVATE_FIXTURE` is **not isolation PASS**. Native cold restore and
  member revoke remain NOT_RUN. B's measured21s exceeds ordinary15s; Native was
  informed. This is not a claim that normal Reader latency has been fixed.

Fixed evidence71da1578:
`docs/ops/auth-c04-20261103/normal-member-read-20261104/ACTUAL_OUTCOME.json`,
normal Auth logs, exact HTTP metadata, operator Review and Root2 readback.

## Historical first normal P1 failure and repaired guard

Candidate d5839d73 adds DEV-only existing normal Owner Core transport fixture runner,
6 focused tests/typecheck/lint and independent Review PASS. A used one normal OTP,
validated `/user`, normal CREATE_ITEM/P1/MANUAL capabilities and exact Owner Person.
The one shared P1 POST returned503 CORE_EXECUTION_UNAVAILABLE at23:08:47Z,
requestee6c661a…/13.095s. Original opf5e13639… remains UNKNOWN: its following
receipt404 is not NoCommit. No retry/newOperation; private op12161d34… NOT_SENT,
B OTP0, both Item isolation and Native cold remain NOT_RUN. A own-local logout and
refresh rejection PASS. Root2 stable coordination released after cleanup.

Evidence: `docs/ops/auth-c04-item-fixture-20261104/actual-first-submit/`.
Auth READ ONLY management query failed; Root2 later returned exact metadata:
no two fixed Item/receipt rows at that observation, still not NoCommit. Existing
safe server COMMAND event adjacent to exact request is OTHER/42501; function/phase
not logged. Core request AUTH-C04-NORMAL-P1-42501-20261104-01 asks for exact guard/ACL
diagnosis and minimal isolated reproduction boundary, no blind GRANT or replay.
Core pure-local probe validated the original intent and applied it for synthetic
canManageShared false/true; no schema/date/WHOLE_GROUP error reproduced. This is
not a Hosted Actor snapshot or PG admission proof. Actual SQL-stage diagnosis
remains pending; no request-field change or original POST replay is justified.
Actual guard65713 local Gateway LOGIN→SET writer→INSERT ON CONFLICT now reproduces
42501 on private trip_member_claim_read_state_allowed at guard IF line5. Root1
minimal nested-role IF avoids premature helper privilege checking without GRANT;
existing finite=false still denies, helper EXEC remainsfalse. Independent guard and CAS source Review PASS; fixed Root1 candidate0f230995 has
real-predicate read_state upsert/foreign denial, generated install+exact reverse,
wrong-preimage transaction abort and unchanged metadata/state evidence. Auth verified
HEAD+8 manifest files and consumer boundary; no repeated tests. Full Item+Receipt
Save remains unproven. Root1 integrated main1e563567; Auth independently verified
all8 manifest artifacts from that Git object, source lock released. Root2 request
AUTH-C04-READ-STATE-ONE-FUNCTION-INSTALL-PREP-20261104-01 prepares one-function
protected Gate d136 was directly approved and installed at01:47:36Z; Auth now
verified the returned approval/install/lock/catalog hashes. Last catalog06:34:42Z
retains guard15fb and helper e2b8. No reinstall needed; this is not new runtime
or login/write authority. Evidence original-recovery/INSTALL_RETURN_VERIFIED.json.
This is a proven current blocker, not proof of the original Hosted unique phase.
Auth runner and original operation stay unchanged; no automatic resubmit.
Actual07:24:23–07:24:55Z normal A oneOTP/getUser/read-only recovery completed.
Original receipt404/NOT_VISIBLE, collection200 qualified Owner binding and no original
Item; f5e remains UNKNOWN_NO_REPLAY. Own local logout+refresh rejection PASS.
No businessPOST/window/Revoke. Persistent original-recovery/RECONCILIATION_EVIDENCE.json.
Next is separate current new-intent/write qualification; never relabel old intent;
never blindly replay the original operation. Native has released its earlier B
normalOTP slot; no QA Session is borrowed or kept by Auth.

## Installed Core / actual deployed source

- Claim read-state repair a16af0af/main59a5415d was approved by direct Gate4c718,
  installed and independently verified. It uses temporary transaction proof;
  Gateway roles, existing RLS and other write functions were retained.
- Later approved member READ Gate7c1f14c4 installed exactly one new helper and one
  narrow Gateway EXECUTE. Root2cb34214d independently verified body882997ee…,
  postgres ownership/pg_catalog, owner+Gateway-only EXECUTE and unchanged original
  three functions/roles/graph31 ACL-RLS. No repeated installation approval needed.
- Caller main5bb59e6a integrates sustained collection/item READ qualification;
  commands/write capabilities and legacy finite paths remain unchanged.
  Auth independently matched all13 package artifacts and exact SQL helper body.
- Actual deployed source5936318992c4d903db1985656f1ba4d8db134ae8 contains that caller.
  Root2b5b50539 independently verified container22ba62b1… / image0e7586fc…,
  compiled helper call, health,18+5files, no protected timers and unchanged closed
  feature configuration. Fresh readback at22:27:28Z was consumed before real GET.
  PDF/PNG flags remain disabled; no C04 selector/write window was opened.
- Main/Hosted may advance: use actual Root2 readback, not a permanent image pin.
  Root2 thread01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232 is the Hosted sole Writer;
  Root1 thread01a1753a-2837-7d20-89c8-d8c1476b0ed8 owns Core/shared main.

Core proof copies: `auth-c04-20261103/after-fix-fresh-invite-qa/CORE_*`.
Exact final package567576cd is retained under `docs/ops/core-member-read-20261104`
in main. Its original preapproval flags are historical, not current install state.

## Prior real Invite / Claim preserved

Gate2fad/window1bf81c2c was consumed and independently closed. New ISSUE0b8927c2…
and CLAIMba97129d… have matching independent ISSUED/LINKED receipts. New invitation
35c4163e… is CLAIMED/used1; temporary proof cleared, target Person linked to B.
Confirmed Claim duplicate and original receipt recovery passed. The initial
collection15s timeout was followed by the normal read PASS above, without Claim
replay. Old4028… Claim remains UNKNOWN and old invitationeb671… expiry unchanged.
Missing its old receipt is not NoCommit. Never reuse consumed windows or tokens.

Evidence: `auth-c04-20261103/after-fix-fresh-invite-qa/actual-1bf81/`, Root2efc73352.
Earlier actual42501 and budget failures remain in `hosted-original-resume-20261104`
and `recovery-timeout-20261103`; do not rerun them without a changed failure.

## Next approved slices / concrete dependencies

1. **Normal Native B read/cold.** Shared Item1a0d7aa8… already exists from
   approved41e8 APPLIED, receipt4402369b…; do not create/replay fixtures. Native
   normal My Trips discovery must prove entry before known-Trip collection pull.
   Source supports linked member discovery and original accepted Repository;
   actual Native discovery/cold remains NOT_RUN. Use the local plan above.
2. **Current Native qualification.** Native solely owns downstream/reader/UI/
   Startup/SQLite; Auth has no shared-file write handoff. Fixed full B-target
   build/device/initialprincipal/assets/current normal read eligibility is missing.
   Guest-only planned14750 is excluded. No clearing GuestP3, skipping handoff,
   Session/DB copying or new device. Same-B cold is first; A/B switch execution
   and private fixture negatives need their own current scope, not new code.
3. **Formal Member Revoke.** Core main29d77, Auth e315 and Native32722 are source
   integrated. Hosted protected install/runtime/real revoke acceptance remains
   separate; not a normal positive read prerequisite. Generic404/503 is not loss
   proof; actual B-self observation and actual accessRevision remain mandatory.
4. **C03/Profile.** Exact contract packet2394b935 accepted by Root1. Auth now
   has a reviewed default-closed Runtime + exact optional Profile route candidate
   (8 changed tests/typecheck/lint and independent8/8 PASS). Only16 shared app
   insertions; reference-main43280495 patch replay/result verified independently.
   Five Auth-owned Profile dependencies absent from that main are pinned for exact
   blob integration, never whole old app replacement. No Startup/config/port
   injection, SQL installation or Cloud save. Runtime package is in
   `docs/ops/auth-c03-20261104/runtime-candidate/`. Source integrated main82eb70d0;
   Auth independently checked11 module/test hashes plus exact patched app. Root1
   new8tests/lint/local bundle PASS; full typecheck blocked by missing react-dom
   types in an unchanged browser/auth-consent entry. Its exclusion-only compiler
   check passed, not a full typecheck PASS. No Hosted activation follows source
   integration.
   Private storage c84671f4 still needs separate protected qualification; Nickname
   self-Person CAS Port and AKA lifecycle remain explicit gaps. Bootstrap/Claim
   authority is not Profile update. Member Revoke source implementation is integrated; its Hosted
   qualification remains separate and is not this read slice's prerequisite.
   `docs/AUTH_CLIENT_INTEGRATION_GAPS.md` is the compact outstanding interface list.

Latest actual MC GET_NEXT_WORK D returned PrimaryC04, nextnull/candidates[]; no
new unrelated claim was fabricated. Send milestones with fixed evidence to MC
01a19a2c-de35-72d2-96b7-e66333286e13. Do not wait ordinary MC ACK to continue.

## V-A01 F02 local continuation / Native handoff

Owner-approved VISION-VA01-UX-R1 has actually started while C04 awaits its external
protected Gate; C04 remains Primary. One new headless Auth-branch Workspace + real
MyTripsList reproduction fails (65 stable skipped): initial unknown empty cache
shows first-Trip empty UI, later the same synthetic Account shows history. Main6ec
static path remains, but Native's newer skeleton/error-cache preservation must be
reused; this is not a latest-main or device reproduction.

Auth pure accountTripRestorePresentation candidate has5 focused/independent PASS,
Auth-worktree typecheck/scopedlint/ui:guard PASS. Qualified cached Trips always show;
only matching Account/generation actual discovery+cache success can confirm empty.
No producer/caller/timer is added here; Native sole Writer ACKed shared UI/coordinator
mount after its Source QA tail. Hand-off: docs/ops/auth-va01-ux-r1-20261104/f02-local-candidate.
No OTP/Host/device/Owner data. Actual UI repair and Vision retest remain NOT_READY.

Formal Member Revoke is source integrated at main29d77b31. Auth B-self access-loss
consumer adapter is implemented with6 focused tests PASS, scoped lint and full typecheck PASS;
Root1 independent Review and source integration PASS at maine3154b9f; Auth
independently matched both consumed files. Native lifecycle caller is source integrated at main32722f7a; Auth matched both
caller/test plus unchanged adapter/repository hashes against independent Review.
Only real403/404 triggers formal self-loss read; it never itself proves revocation.
It reuses canonical Core DTO
and existing Repository.revoke, with no Startup caller or Hosted enablement. Root2
owns exact protected install qualification; Hosted revoke/cold restore NOT_RUN.
Recovery evidence: docs/ops/auth-c04-member-access-consumer-20261104.

## Bounded support and active Owner feedback

- MCP diagnostic support is delivered and returned to C04. Auth6b985946 reuses
  reviewed f1 four-stage write diagnostics, adding only safe GET/POST and Core
  status100..599.25tests/typecheck/lint/independent Review PASS. MCP consumed exact
  binding/test files and owns latest Runtime/logger/collector integration at
  978f0200. Do not overwrite current Create with old Notes runtime or infer eed8
  commit/expiry from new logs. Original a8c1 remains UNKNOWN; no retry/new window.
- Vision requestVISION-VA01-UX-R1-20261104-001 is actually STARTED locally while
  C04 waits its external protected Gate. F02 Authhelperf808 is delivered; Native
  caller81bde5ec fixes both remote-only and mixed local+remote cache loss; Auth
  incremental identity/private-cache/generation review is NO_BLOCKER. Native final Review and Root1 source integration are complete at main3c20ad0c;
  Auth independently matched all five consumed source/test artifacts. Actual
  device cold restore and Owner UX acceptance remain NOT_RUN.
  A01-2 eight-digit input leafb068/e846 is source integrated at maine851bcae;
  Auth independently matched the exact component and test blobs;
  no actual OTP or complete new Email UX acceptance. F01 remains pending shared
  Account UI delivery. Three feedback/spec files and four references were read.
  F02: independently reproduce
  returning-account false-empty My Trips; UNKNOWN/restoring must not mean empty,
  while valid cached sessions retain offline access. F01: Guest-first Beta
  single-account UI, separate Email/8digitOTP steps, truthful Provider/Sync/AI,
  existing Adoption/contextual return and safe current-session signout.
  Native owns shared UI/nav. Single-account UX does not enable Hosted single-user
  session policy. Apple remains gated by actual qualification. V-A01 is
  CHANGES_REQUESTED, not Owner Accepted; use independent synthetic fixtures.
  Intake: `docs/ops/auth-va01-ux-r1-20261104/INTAKE_AND_SCHEDULE.json`.

## Critical execution boundaries

Use normal QA OTP/OAuth, no copied Sessions/Keychain/tokens/admin login. Receiving
credentials stay in process memory using the dedicated QA Keychain helper; do not
read/reuse SMTP keys or print codes. Dedicated QA team is the receiving boundary,
not mailbox prefix. One attempt, bounded receiving, rate-limit stop, own local
logout and refresh rejection. Keep receipts/UNKNOWN immutable. No Production or
real-user data operations. Root1 unique shared source/SQL contract; Root2 actual
Hosted Writer. Protected changes need exact scope approval; ordinary local
coding/tests/review/commits and existing normal QA continue autonomously.
