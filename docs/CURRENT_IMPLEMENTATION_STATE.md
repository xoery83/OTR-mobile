# Auth Lane D — current handoff, 3 November 2026

Primary assignment: **AUTH-C04 — Invite / Claim / Multi-member**. Read this first;
follow only the evidence/owning files needed for the next failure. Earlier detailed
handoff history is preserved in Git (`2bd3de40:docs/CURRENT_IMPLEMENTATION_STATE.md`)
and the evidence directories below; do not reconstruct it or rerun stable suites.

## Actual Golden Slice

**FAIL_AT_FIRST_ISSUE_HTTP_503**, not Hosted multi-member PASS.

Owner approved exactly one finite A/B window, Gate `713a7b92…` at `d28e777f`.
Auth directly verified the original user reply in Root chat; this was not inferred
from an agent's claim. Root staged the same image, armed/read back the independent
absolute timer, then reported healthy active runtime. Auth executed only afterward.

- Runtime plan: open `2026-11-03T04:04:35Z`, invite expiry `04:14:35Z`, latest close
  `04:34:35Z`; Root **closed early after failure**, restored healthy default and
  disarmed the timer. The one-shot approval is consumed, not reusable.
- A and B each received exactly one real OTP and passed normal verify + `/user`
  identity checks. Both own temporary Sessions were locally logged out and their
  refresh credentials were rejected. No Session/Keychain/token was copied.
- Actual live ten-field preflight plus effective linked-owner/no-removal check
  passed before the first business request.
- Original A ISSUE returned HTTP503 at `04:07:49.424Z`. One read-only HTTP recovery
  of that original operation also returned503 at `04:07:50.855Z`. The process exited
  at `04:07:51.493Z`; no replay, CLAIM, confirmed duplicate or replacement ID.
- Independent SQL observation at `04:11:36Z`: ISSUE receipt absent, CLAIM count0,
  directed invite count0, target still unlinked. This is an observation, **not
  NoCommit**; retain original ISSUE and UNKNOWN until legitimately reconciled.
- Member Read, private-Item negative, Member Revoke and Native Cold Restore remain
  **NOT_RUN** for this case.

Evidence: `docs/ops/auth-c04-20261103/hosted-ab-first-attempt/ACTUAL_OUTCOME.json`,
normal A/B metadata, retained commands, post-failure readback and independent review.
`ROOT_ACTUAL_WINDOW_RECEIPT.json` is the exact Root Git blob from `f1c4410a`; it
records Root's independent Host closure/health readback, not another Auth Host test.

## Fixed identities and recovery

Use the exact QA template under
`docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json`:

- A `26876e6e-a919-457d-bc00-78d76ba08043`; B `1f3d7935-1bdc-4952-8d7f-0f72077368c1`.
- Trip `fb2f0820-e429-404a-b4dd-7adcad814e45`; target Person
  `bcd1d48e-a9f7-445a-911b-0452ff8dc55a`; Owner Person `b90c34ba…`.
- Original ISSUE `b3299bda-8939-4e49-8377-338f8e619869`; CLAIM
  `4028b673-9032-41c8-807e-c7d3592eae93` was never sent.
- Retained ISSUE digest
  `27da9414669e8ecd83c826d39438c09f2ad9049bfcfcb829c6b300975164e7d1`.

Do not reopen the old window, resend OTP, replace operations, unlink Persons,
remove receipts or reset data. Closed-window recovery requires qualified access;
SQL absence alone does not authorize execution replay. Native cold recovery is a
later coordinated device task, not proven by a Host Session.

## First failure and next code action

The current bounded client did not retain the MemberClaim business error code.
Root's stopped-candidate checks found exact host-mode/DEV URL/selector, zero
selection-closed markers, valid v3 mount and existing gateway schema/function
permissions. This does not yet distinguish missing Port from PG/authority failure.
Do not invent a permission fix, change Owner semantics or call503 a proven PG bug.

A minimal **default-closed diagnostics candidate** now changes only Auth owning
`backend/src/tripMemberClaimHttp.ts` and `tripMemberClaimPg.ts`, with their tests:

- HTTP distinguishes closed Port from owning-authority unavailable.
- PG records lease/setup/scope/RPC/work/commit stage, internal method and only
  five-character SQLSTATE or null. No raw message, SQL, body, credentials or IDs.
- Diagnostics are best effort: logger/code-getter failures preserve the original
  response/error, rollback/retire and COMMIT UNKNOWN behavior.
- Two focused suites26PASS; independent new5+3PASS; full Auth-worktree typecheck and
  changed-file eslint PASS. No old isolated-PG/deployment tests repeated.
- It is not deployed and is **not a demonstrated repair**. Hand the exact four-file
  candidate to Root without interrupting MCP's shared window. Continue from the
  next actual safe diagnostic; any new runtime/business window needs its own scope.

## Reused baseline and integration

- PG Adapter `7734f3b0` isolated transaction/permission/concurrency/recovery PASS.
- Owner-approved installation/compatibility `7c3250ef…` is installed; SQL hash
  `3bbe7fbf…`. No reapproval/reinstallation needed. Keep ordinary runtime closed.
- Scenario `a0245ba2`: fixed A/B original operations, retained intent, UNKNOWN
  recovery-only, hash-validated Core Reader; eight focused+independent checks.
- Readback/normal callback wiring `eb884c67`:12 focused readback and3 normal Auth
  checks plus independent review. Normal callbacks use validated immutable DEV
  config and noop persistence; existing registered-QA/no-new-account behavior.
- Root integrated the exact eleven-file allowlist into main `3c74f358`; Auth
  compared11/11 Git hashes. Root reported62 focused/scopedlint/changedTS PASS.
  Root full-repo types had an existing missing React DOM types error, not full PASS.
- Last closed Host: `3def…`, image `fbc245…`, healthy/selector absent per Root
  receipt. Treat as observed identity, never permanent current state; fresh CAS
  belongs to Root before another approved activation.

## Other lane scope retained

Email OTP, Google, Guest Trip/P1 Adoption and local Profile/Settings historical
real acceptance remain scoped evidence, not repeated here. Apple remains paused.
C03 Profile Cloud/private AKA and Trip Nickname cloud mutation are candidates,
not live Cloud PASS. Account/Trip/Person remain distinct; never link by names/email.
Native owns shared Navigation/Settings/SQLite and cache consumption; Core owns
actual membership mutations and Reader authority. Root owns shared Backend/SQL.

Formal Member Revoke remains separate, default closed. Owner's effective linked
`journey_members.role=owner` clarification applies to the new Revoke work; do not
use this503 to rewrite existing Invite/Claim permissions or add Ownership Transfer.
Private Realtime is Post-Beta, not a prerequisite. No pricing, free credits or
payment policy is approved; do not enable entitlement denial/billing.

## Resources, credentials and continuation

Use own stable Auth worktree/branch. Do not touch other worktrees' uncommitted
files, other devices' Sessions/Keychains, Production or real user data. Coordinate
shared deployment/main with Root; MCP/Import work is not Auth's primary assignment.

Approved public Auth config source is the runbook's two variables only from
`/Users/xoery/Project/otr-mobile/.env.local`; never copy the whole file. Dedicated
QA inbound Keychain: service `OTR_QA_RESEND_API_KEY`, account `resend`, label
`OTR-QA-Inbound`; no SMTP-key fallback. A sandbox-only item-not-found result did
not prove absence: authorized canonical metadata and Receiving GET succeeded.
Secrets stayed in memory. Receiving GET at `03:28:17Z` proved permission, not daily
sending allowance/reset; quota rejection stops, never repeated sends.

MC's last actual supported Next Work result after revision45 had no candidate;
C03/C02/C01/C05/C06 and approved other Lane-D LOCAL_PREP slices were completed only
as local preparation/PENDING_VERIFICATION, not whole-package acceptance. Re-query
actual MC instructions after each meaningful slice; do not wait for ACK or invent
work. Current priority is the C04 first-failure diagnostic/repair. Use precise
Evidence and preserve UNKNOWN. Do not stop at a report if another approved slice
is genuinely ready, but do not fabricate tasks or bypass gates to stay active.
