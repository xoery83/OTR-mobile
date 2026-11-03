# Auth Lane D — current handoff, 4 November 2026

Primary: **AUTH-C04 — Invite / Claim / Multi-member**. Read this first; follow only
this slice's code/evidence. Historical handoffs are preserved in Git71da1578 and
the evidence directories below. Do not repeat stable Login/Guest/Claim PG tests.

## Latest actual Golden Slice

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

## Latest continuation: first normal P1 failure

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
Next is actual failure diagnosis → minimal repair → focused validation;
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

1. **Shared/private Item + Native cold read.** Request
   AUTH-C04-NATIVE-ITEM-COLD-FIXTURE-20261104-01 asks Native for the existing normal
   OwnerA ManualP1/QA producer: one B-readable SharedItem and one A-private Item,
   same synthetic Trip. Reuse current Form/Core Save and visibility/participation
   contracts; do not build a Form or use admin SQL. First verify the existing
   Owner capability. If PRIVATE UI is unavailable, request its existing typed
   QA producer rather than add a new Form feature. No fixture has been created.
2. **Native consumption.** Native confirmed current normal Discovery/Pull ports
   `refreshAccountTripReads()` / `refreshTripFromCloud(tripId)`, verified at4bafb.
   Existing LocalTripWorkspace/scoped roster/TripMembersSheet and account fences
   are reused. Core qualification and Auth GET PASS are now satisfied. iPadQA146
   belongs to LaneC's current mixed/preview claim; wait actual release. AD5 and
   Vision D473 are not available for takeover. Record in
   `after-fix-fresh-invite-qa/NATIVE_COLD_READ_READINESS.json`.
3. **Formal Member Revoke.** Root1 gap return10e35b2e:66497/67e374 remain unmounted
   candidates, without formal v2 producer/atomic PG/receipt/access-loss delivery.
   Auth packet `docs/ops/auth-c04-member-revoke-packet-20261104/` supplies one actual
   A/B Person/Account, observed epoch4907c5b0…/revision4/accessRevision4, explicit
   cache/recovery/join-revoke requirements and independent Review. Metadata is not
   execution authority; fresh normal Owner/Core reference is mandatory before any
   submission. Current policy is valid linked role=owner only, not creator/admin/
   Organizer fallback; preserve Person/link/role/participation/history. Reuse v2
   receipt/hash domains. Do not invent after=5 or map Auth revision to Core.
   Root1 owns canonical implementation; exact protected install belongs to Root2.
   Generic404/503 is not revocation proof. Native must receive an authoritative
   B-scoped loss observation and use its own context plus actual Core revision.
4. **C03/Profile.** Local Profile/AKA and operation recovery/connection projection
   candidates are preserved; private Cloud Profile/TripNickname mutation remains
   a separate owning/permission gap. Do not substitute bootstrap/Claim authority.
   `docs/AUTH_CLIENT_INTEGRATION_GAPS.md` is the compact outstanding interface list.

Latest actual MC GET_NEXT_WORK D returned PrimaryC04, nextnull/candidates[]; no
new unrelated claim was fabricated. Send milestones with fixed evidence to MC
01a19a2c-de35-72d2-96b7-e66333286e13. Do not wait ordinary MC ACK to continue.

## Bounded support and queued Owner feedback

- MCP diagnostic support is delivered and returned to C04. Auth6b985946 reuses
  reviewed f1 four-stage write diagnostics, adding only safe GET/POST and Core
  status100..599.25tests/typecheck/lint/independent Review PASS. MCP consumed exact
  binding/test files and owns latest Runtime/logger/collector integration at
  978f0200. Do not overwrite current Create with old Notes runtime or infer eed8
  commit/expiry from new logs. Original a8c1 remains UNKNOWN; no retry/new window.
- Vision requestVISION-VA01-UX-R1-20261104-001 is queued after the current C04
  Hosted acceptance slice, **not STARTED**. Three authoritative feedback/spec
  files and four reference images were read/hashed. F02: independently reproduce
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
