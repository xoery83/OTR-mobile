# AUTH-C04 execution handoff — 3 November 2026

Single DRI: Auth. This is preparation, not runtime authority or an E2E receipt.
Reuse PG7734f3b0, installed7c3250ef/SQL3bbe7fbf and wiring51fa7d66; no repeated PG suite.

## Golden Slice and qualification

Account A opens its existing synthetic Trip, targets registered B and the exact
never-linked Person; B signs in normally, explicitly confirms that Person, then
reads the Trip through the existing Core Reader. Restart B and verify the same
binding. Names, email equality, AKA and known Trip UUID never establish identity.
Full closure also requires a formal member-revocation path; see the distinct gap below.

| Object | Fixed QA identity |
| --- | --- |
| DEV | tuqigdxrvrerfewsxqgm |
| A / original Owner | 26876e6e-a919-457d-bc00-78d76ba08043 |
| B / registered claimant | 1f3d7935-1bdc-4952-8d7f-0f72077368c1 |
| Trip | fb2f0820-e429-404a-b4dd-7adcad814e45 |
| Owner Person | b90c34ba-96d7-4b64-874a-b4f5525d64d8 |
| Claim target Person | bcd1d48e-a9f7-445a-911b-0452ff8dc55a |

The installed metadata receipt is historical, not a live qualification. Before
writing, independently recheck original Owner, A's binding, target's null user_id
and linked_at, B's registration and absence of another Trip Person link. Any drift
stops this case. Do not reset an already-linked Person for convenience.
Use each Account's own normal OTP/Google Session, getUser identity and non-resource
token classification; no copied App/Keychain Session or administrator substitute.
Reuse scripts/auth/registered-qa-host-session.ts with the explicit registered case;
do not assume its fixed convenience wrapper selects A. Check Resend quota first;
bounded receiving retries must not trigger repeated OTP sends. No secrets in evidence.

## Root's default-closed integration

Consume backend-wiring/PACKAGE_MANIFEST.json and its four Auth leaves; apply only
the import, optional dependency, destructuring and route anchors from its patch.
Base app e89dfddf/SHA434b8612… is fixed. On fresh main drift, Root rebases those
anchors and validates changed routing, preserving unrelated work. Record actual
unified SHA, image digest and config identity; no deployment is claimed by51fa.

Expected POST routes: /v2/trips/:tripId/member-claim-operations and /recovery.
Normal Auth precedes the boundary; B must not pass a prior Trip Reader gate.
Missing memberClaimPort returns503 MEMBER_CLAIM_CLOSED. No bootstrap injection,
new env, pool, credential or runtime activation belongs to this code handoff.

Before any later enablement: qualify exact runtime authorization, QA scope, server
expiry, existing Reader/access gates, shared-resource lock and cleanup. Reuse the
existing raw CorePgConnection.withLease lifecycle, not CoreHttpConnection. Record
the exact executable/config and rollback identity before any QA write.
Stop/close on identity drift, unexpected ACL/config/image, wrong scope, invalid
receipt or UNKNOWN. Root restores the captured prior runtime/image/config if
integration or health fails; keep installed metadata intact, never DROP tables or
undo a possibly committed Claim. Independent readback checks route closed with no
port, normal/resource separation and unchanged unrelated mounts/permissions.

## Auth-owned execution checklist

Allocate one operation ID per intended command once, retain the parsed original
command and memberClaimIntentDigest before submission. Bind URL tripId and header
Idempotency-Key to that command; never accept a client-supplied actor identity.

| Step | Expected evidence / failure handling |
| --- | --- |
| B before Claim | Existing authorized Reader rejects; a bare404 alone is insufficient |
| A ISSUE_TARGETED_INVITE | Exact REGISTERED_ACCOUNT B and target Person; ISSUED plus immutable receipt; sending is not acceptance |
| B CLAIM_PERSON | Explicit consent true, same invite/Trip/Person; LINKED and currentAccess READ; independent canonical Person + receipt readback |
| Duplicate original Claim | Same command/operation/digest, one receipt and one binding; no new mutation ID |
| Wrong Account / target / Trip | Rejected before link; independent binding and receipt unchanged; do not touch a third real user's data |
| Changed body, same operation | CONFLICT; never overwrite original receipt |
| Expired / revoked unclaimed invite | Denied using trusted server time; use separately qualified spare never-linked synthetic objects, never reset the Golden Slice target |
| Lost response /503 | UNKNOWN: POST original command only to /recovery; no execute retry or new operation |
| Recovery | Original actor/Trip/Person/invite/digest match; ABSENT_UNCONFIRMED remains unknown; historical LINKED with currentAccess NONE cannot regrant |
| B after Claim | Existing normal Member/Core Reader succeeds; private Item access still follows its owning visibility contract |

Success evidence includes fixed runtime/config identity, normal actor IDs, original
operation/digest, formal receipt, independent authorized readback and unchanged
negative objects. Never include OTP, JWT, refresh token or SMTP/Receiving credentials.

## Native minimal handoff

After formal Claim, trigger existing refreshAccountTripReads() for discovery and
listed Trip pulls, or refreshTripFromCloud(tripId) for a known Trip. Never insert
fake accepted snapshots or fabricate a roster from the command response.
Use AccountRequestContext accountId/tripId/generation and stable personId.
People Reader returns null or {certificate,people:[{personId,connected,isCurrentActor}]};
Native qualifies its accepted version/access revision/deny state within its own
AccountApplyGate transaction. Missing/inactive/pending becomes UNKNOWN. Reader
errors propagate. Do not nest a public gate-taking read inside an already-held gate.

Cold path: B normal login → authorized pull → roster target connected/self → app
terminate/relaunch → same B/Trip/Person readback. Switch to A and verify B's private
Profile/drafts/Session never appear; switch back through normal login. Old in-flight
responses must fail the generation fence. Native owns device booking and unified
build/SQLite evidence; no shared device reset or copied tokens.

## Formal member revoke: separate unresolved authority

REVOKE_UNCLAIMED_INVITE only cancels a pending invitation. It does not remove an
already-linked member. Current installed package deliberately grants no generic
member-removal, Reset/Switch or Organizer-expulsion authority. The isolated PG
administrative unlink was only a historical-receipt/current-access negative.

Full revoke acceptance needs an approved owning membership transition and its
atomic access-revision/cache-denial result. Do not invent one, directly unlink a
Hosted member or label an invite revoke as member revocation. Once supplied:
verify B's held and fresh authorized reads denied, stale responses fenced, accepted
cache purged/denied through existing Native invalidation, app restart remains denied;
historical Claim receipt must not restore access. Private Realtime is not a prerequisite.
Until then mark MEMBER_REVOKE_AUTHORITY_MISSING and leave full C04 incomplete;
the separately qualified Invite/Claim/Member Read slice can still proceed.
