# Directed Invite / Claim — original receipt recovery candidate

Golden Slice: Organizer issues a directed invitation for an explicit existing
unconnected Trip Person; the exact registered Account explicitly claims it through
the existing `executeMemberClaim` serialized authority. A lost response must recover
the same operation's receipt without issuing another invite or connecting again.

Owner-approved sources: People Product Delta and UI Blueprint24October2026,
`docs/people/design-v1-20261024/INTAKE_AND_GAPS.md`, AUTH06 invitation direction.
Name/Email/AKA matching confers no identity or access. Claim/revoke/connection
changes are online-only. Unknown outcomes need authoritative receipt reconciliation.
The existing Invite implementation is dormant: no app port or Hosted install exists.

The first bounded code delta is `recoverMemberClaimReceipt(originalCommand, actor,
port)`. It reuses `MemberClaimAuthorityPort.atomic`, current owning effective access,
original operation lookup and the same canonical intent digest as command execution.
It performs no issue/link/revoke/save call. Changed intent, scope, actor, Person,
operation or claimed invite is rejected; malformed/incompatible receipts fail closed.
The actor must come from existing normal authentication, not a request body or JWT
claim supplied by a caller. No HTTP route or authentication replacement is added.

Recovered status is historical operation disposition plus *current* access. An old
LINKED result with NONE access remains NONE; it is not a fresh membership grant,
claim acceptance for another Person or permission to read private data. A null
receipt is ABSENT_UNCONFIRMED, never NoCommit or permission for replay/new IDs.
Unavailable authority/network/read outcomes remain UNAVAILABLE without mutation.

Local headless tests cover committed Invite and Claim with a lost response, then
one read-only original-operation recovery; both write counts remain one. Foreign
receipts, altered payloads, malformed receipts and current unavailable authority
fail closed. Synthetic transactions are not real DEV authorization/persistence proof.

Next owning gap remains the actual serialized server adapter behind
MemberClaimAuthorityPort: exact Organizer authority, explicit directed target,
current Person connection, one-account/one-person constraints, immutable receipt,
real expiry and atomic link plus applicable owning access. No policy duration or
new capability is invented here. Formal ACCEPT/Reject/Choose Another/Create New,
cutoff/Owner restrictions, two-account readback, permissions negatives and real
Native/Backend E2E are not completed by this recovery candidate. Keep it unmounted.
No Backend/bootstrap, SQL/RLS/GRANT, Session, OAuth, device or Hosted change.
