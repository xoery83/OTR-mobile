# AUTH-C04 original-ID resume — local candidate, not authorized

One complete Golden Slice: normal A/B sessions → recover original ISSUE → at most
one original ISSUE submission if absent and expressly authorized → recover original
CLAIM → at most one original CLAIM submission if absent and expressly authorized →
confirmed receipt/idempotency → existing Core Member Read and Account isolation.
Existing receipt absence is never NoCommit; explicit new authority permits the
single idempotent original command, whose owning transaction checks receipts again.

Fixed identities are the existing QA_CASE_TEMPLATE.json; no replacement fixture.
ISSUE b3299bda-8939-4e49-8377-338f8e619869 retains digest
27da9414669e8ecd83c826d39438c09f2ad9049bfcfcb829c6b300975164e7d1.
CLAIM remains4028b673-9032-41c8-807e-c7d3592eae93, bound to that ISSUE's real invite.
No new operations, unlink, reset, invitation extension or deletion.

Client entry: resumeMemberClaimQaScenario in member-claim-qa-scenario.ts.
It requires retained ISSUE command/digest, allowOriginalIdSubmissions:true,
qualifyResumeWindow(qa), and independent readInvite(inviteId). These inputs are
composition requirements, never proof of Owner approval or server authority.
The original two-argument runMemberClaimQaScenario behavior remains available.

Auth now provides createMemberClaimQaResumeWindowQualifier in the existing
member-claim-qa-recovery-window.ts. It strictly accepts status
AUTH_C04_RESUME_WINDOW_QUALIFIED, mode ORIGINAL_ID_RESUME and
businessMutationAuthorized:true, with the independently frozen qaCase/image/CID/
config/plan pins. The old RecoveryOnly factory still requires false and its15min
bound; only resume can use the existing max30min QA envelope. The constructor
expiry remains max10min and qualification must complete before it. These are
candidate QA ceilings, not renewed authorization.

Root must deliver a separately selected ORIGINAL_ID_RESUME authority and actual
qualify-resume Controller/SSH read callback; RECOVERY_ONLY and its qualifier cannot grant this scope.
Reuse the existing fixed A/B owning authority, PG transaction and finite controller;
no new roles/SQL/GRANT/RLS. Bind mode, exact case/source, image/config/staged CID,
approved plan, real deadlines and both close commands. Do not use zero-receipt
preflight: a valid prior receipt is a recoverable state, not grounds for cleanup.

Independent readInvite returns only this strict DTO:
{id,tripId,personId,targetAccountId,status:"PENDING",expiresAt,observedAt}.
The existing createMemberClaimQaReadback now implements this readInvite method.
Supply its existing bounded read-only QA SQL transport; join the installed directed
invite and invitation by the exact selected invite/Trip/Person/B. observedAt comes
from the actual server read; missing/ambiguous/mismatched/expired rows stop. Never
recompute historical expiresAt from a fresh selector date. Historical LINKED CLAIM
can recover without making a consumed/expired invitation usable again.

One entry invocation, at most one OTP each A/B, stop on quota/delivery failures.
MemberClaim calls use90s bounded waiting; ordinary API/Core defaults are unchanged.
Each original is recovered before any submit. Initial recovery failure stops.
A submit's network/timeout/503 UNKNOWN permits one read-only recovery, never a
second execute. Still absent/mismatched receipt stops. One identical CLAIM duplicate
is permitted only after confirmed LINKED, as in the existing scenario.

The new finite Gate must explicitly list this conditional submission scope, the
confirmed duplicate and independent reads; both consumed713/e930 windows remain
closed. Native cold restore and existing-member Revoke remain outside this scope.
Local tests/mock responses are not Hosted evidence. Root alone stages/arms/starts/
restores; Auth owns the Golden Slice and actual result. No execution from this file.
