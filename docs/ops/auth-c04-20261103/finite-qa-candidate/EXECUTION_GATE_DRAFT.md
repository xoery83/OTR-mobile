# AUTH-C04 — one finite A/B execution window (DRAFT, NOT AUTHORIZED)

This is preparation for the Owner-only runtime activation decision. It is not an
approval request yet and cannot be used to open a window. Root controller
`66b99173` has 13 local fixture tests and an independently verified
NO_BLOCKER_DEFAULT_CLOSED review (`ROOT_CONTROLLER_INDEPENDENT_REVIEW.json`,
SHA `72ff43ea668b828a09752a49dc936dfbcf6f26974bd3a709350a069bfb04beb3`).
Actual Host/timer qualification and fresh original Host readback remain required. Auth scenario `a0245ba2` has eight focused and
eight independent tests, types/lint PASS. Those tests are not Hosted E2E.

## Existing approval retained

The Owner-approved `3edebba4…` installation and `7c3250ef…` compatibility supplement
are already installed. Exact SQL SHA:
`3bbe7fbf47ae40d18dfcb91d98d1aa8da1cf3839853320f1e4733fc61490d565`.
See `../hosted-install-receipt/AUTH_ACCEPTANCE.json`. No reinstallation, new
Schema/RLS/GRANT/role or permission semantic change is requested here. Ordinary
default-closed software delivery remains covered by standing authorization.

## Proposed additional authorization

One synthetic DEV window on project `tuqigdxrvrerfewsxqgm`, normal API origin
`https://api-dev.xoery.art`, limited to the existing owning Invite/Claim path:

| Scope | Fixed identity |
|---|---|
| Owner Account A | `26876e6e-a919-457d-bc00-78d76ba08043` |
| Claimant Account B | `1f3d7935-1bdc-4952-8d7f-0f72077368c1` |
| Trip | `fb2f0820-e429-404a-b4dd-7adcad814e45` |
| Original Owner Person | `b90c34ba-96d7-4b64-874a-b4f5525d64d8` |
| Never-connected Claim target Person | `bcd1d48e-a9f7-445a-911b-0452ff8dc55a` |
| ISSUE operation | `b3299bda-8939-4e49-8377-338f8e619869` |
| CLAIM operation | `4028b673-9032-41c8-807e-c7d3592eae93` |

Proposed runtime duration is at most 1,800 seconds; invitation expiry is at most
600 seconds after opening and no later than runtime close. These are QA bounds,
not production invitation policy. Do not fill future timestamps in this draft or
treat any current container as a permanent approved baseline. The final Gate must
state how one future execution plan is sealed against the approved scope, actual
server UTC, fresh Host identity and Owner approval receipt. No renewal or second
window is implicit.

The final request must explicitly cover:

1. Normal, separate Auth for A and B, using each registered QA identity and its own
   session only; verify actual Account/Trip before mutation. Check receiving/quota
   readiness first; bounded existing OTP receiver, no repeated sends or credentials
   in output. No service-role Auth, borrowed Session, password fallback or JWT fabrication.
2. A issues one directed invite to B for the fixed Person with the original ISSUE
   operation. Retain command/digest before transmission, then independently read
   its actual receipt. Sending the invite does not prove membership.
3. B explicitly consents to Claim that exact server-returned invitation, using the
   fixed CLAIM operation. Independently bind receipt to actor/Trip/Person/invite/
   operation/digest and prove current access through existing Core Reader.
4. Only after confirmed Claim receipt: one explicit same-operation/same-digest
   idempotency submission, then read-only recovery. This is not another logical
   Claim. UNKNOWN instead permits one original-operation recovery query and stops
   unconfirmed mutation; never replay UNKNOWN, allocate another ID or extend time.
5. Read A/B collections through the existing authorized Reader and verify B's own
   Person binding. A-private Item absence is a negative only if a qualified existing
   private fixture was actually visible to A; otherwise record NOT_VERIFIED.
6. Revoke only each test's own temporary login session during cleanup under normal
   Auth semantics; preserve original business receipts and data. Failure to prove
   cleanup is unresolved, not a clean PASS. No global logout of other App sessions.

Member Revoke, pending-invite Revoke, role grants, another Person, another Trip,
public invitation links, Native device access and Native cold restoration are
outside this proposed window. Revoke/Native Cold Restore remain separate C04 work.

## Before an Owner request is ready

Bind the final Gate/manifest to these actual artifacts, never just Boolean claims:

- Fixed selector source `a403549f` as integrated into the actual current main/image;
  reuse its existing 30-test independent review, do not rerun it mechanically.
- Final Root controller source, template and retained-phase2 helper hashes;
  completed independent review and local bounded close/failure/restore tests;
  non-activating Host prerequisites (helper paths, systemd capability, common lock)
  checked. Actual QA staging/arming is permitted only after the exact approval.
- Original dated, sanitized Host preflight: full CID/image/main, Config/HostConfig/
  Env/mount/file hashes, healthy baseline and absent QA selector. Prefixes from
  chat are insufficient. No Secret values in the packet.
- Fresh exact Trip created_by=A, target never linked, B has no existing same-Trip
  Person, original ISSUE/CLAIM receipts absent and old directed invites absent.
- Exact target's linked Personal Settlement Payment history count and existing
  related-grant scope. Root currently reports zero matching payment records; do
  not infer unrelated grants, read financial text or disable owning triggers.
- Normal A/B Auth/receiver readiness, independent receipt readback port and safe
  retention callback. The source scenario is injected orchestration, not proof
  these operator inputs already exist.
- Non-conflicting shared resource qualification and an approved-scope-bound plan
  sealing specification. The actual executable plan is sealed only after approval,
  with permitted time/baseline substitutions and the actual approval receipt;
  any scope/software change requires renewed qualification, not silent substitution.

Any changed identity, linked target, nonzero original receipt, nonzero unexpected
history or other preimage drift stops activation for read-only reconciliation.
Do not create replacement fixtures/operations silently. Immediately before actual
activation, Root repeats the approved preimage/CAS; a preparation snapshot is not
an open-window snapshot.

## Controller / close / rollback contract

Root is the sole Host Writer. Use the existing common short lock and same-image
staged container; change only `OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG`. Keep the exact
healthy default container, image, mounts and config for restoration. Arm and verify
the independent absolute-deadline systemd close timer before starting QA runtime.
Actual stage/arm/timer readback follows Owner approval and precedes start; failure
to qualify it stops before start and triggers bounded reconciliation/cleanup.
No actual QA stage or timer activation is a prerequisite for requesting approval.
Gate and Owner-receipt hashes, qualified preflight, controller hash and fixed plan
must be bound by the operator; flags in a JSON plan are not authorization proof.

Early completion or failure closes promptly. The independent timer remains the
backstop. Close must restore and independently inspect the healthy retained default
with selector absent. Unknown stage/arm/start/close requires reconciliation, never
blind repeated container creation. Foreign current deployment or CAS drift must
not be overwritten. Report unconfirmed closure immediately; no new business calls.

Runtime rollback is not business rollback or NoCommit: do not unlink a successfully
claimed Person, delete receipts/invites or reset data. Preserve original operation
and digest after UNKNOWN. Closed-window recovery needs separately qualified access;
this Gate does not silently reopen or extend the window.

## Evidence and completion boundary

Retain actual A/B Auth identity verification without tokens; fixed command/digest;
normal HTTP disposition; independent ISSUE/CLAIM receipts; authorized Core readback;
idempotency/recovery observations; own-session cleanup; timer/start/close and final
default restoration. No private Item contents, OTP, refresh token or Secret in logs.

Report only the range proved. This can qualify Hosted directed Invite/Claim and
member read; it cannot close the entire AUTH-C04 package without formal Member
Revoke, cache invalidation and Native Cold Restore evidence.
