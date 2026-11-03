# Core member READ-only owning installation Gate

Candidate only: not approved or installed. Root2 is the sole Hosted/PG Writer.

DEV project: `tuqigdxrvrerfewsxqgm`.
Install SHA256: `ff8143ba2c5a55a9009f3093e3c2a83c0c302c307b5fa029dbceb194e1dfe844`.
Rollback SHA256: `37831ebb99409ee09481ed58c2baa623470dd48de300ef96f31e1fdfe47beab7`.

The actual C885 failure is a linked member rejected by the Owner/write scope.
Install exactly one new SECURITY DEFINER predicate
`public.trip_sustained_core_read_scope_allowed(uuid,uuid)`, postgres owned,
`pg_catalog` search path, with one EXECUTE grant to existing
`otr_trip_core_v2_gateway`. No table, column, RLS, role, membership edge or other
GRANT change. Unknown default function grantees abort the full transaction.
The three existing finite/sustained/write capability functions remain unchanged.

This adds sustained DEV **read** qualification for normal, current linked members
of existing v2-receipted Trips. The Create Receipt is Trip rollout provenance; the
reading member need not be its creator or Owner. Exact server Actor/Trip, normal
Account status, existing per-Actor policy/denial, removed-member denial and existing
Gateway role safety remain mandatory. The current actor-visible projection and
independent PRIVATE Item, Source, Document and Ledger rights remain unchanged.
It does not authorize writes, Admission, new invitations, Claim, new data, Provider,
new authentication/OTP, Production or cross-Trip access. Original4028 UNKNOWN and
all historical receipts remain untouched. Concurrent Revoke E2E is not claimed.

## Execution order and verification

1. Root2 independently verifies actual DEV/service, the three fixed function
   preimages and unchanged roles/ACL/policy/RLS; capture current healthy image and
   exact restore configuration. Drift aborts; do not rebase this SQL silently.
2. Under the precise approved protected install, run this transaction once with
   project marker and `otr.core.member_read_gate=OTR_CORE_MEMBER_READ_SCOPE_V1`.
   Lock timeout3s/statement timeout20s; on ambiguous transport read metadata first.
3. Independently read the new helper definition, owner/search path and owner/Gateway
   only EXECUTE; confirm the original three functions and table ACL/RLS unchanged.
   Installation performs no business DML and adds no temporary administrator power.
4. Only after SQL verification may Root1 integrate the Reader caller onto the then
   latest main. Root2 builds/deploys that reviewed latest main under standing DEV
   software authorization. Do not deploy an older Core branch image or call an
   absent helper. Other Lane source/deployment work can continue before this Gate.
5. Auth owns separately lawful normal A/B read/isolation verification, bounded90s,
   with no C04 write window/selector or Claim replay. This Gate itself grants no OTP.

The SQL helper is persistent ordinary DEV read qualification, not a temporary QA
administrator window. Existing Actor policy disable/revoke and membership removal
continue to deny access. No fixed clock, renewal, paid budget or secret scope changes.

## Exact rollback

First restore the captured compatible old Reader software and drain active reads.
Only then run the fixed rollback under the same approved DEV/operator boundary.
It checks helper body `882997ee273bded9f32e7b70868e2afb`, owner/ACL and original write hashes, then drops
only the new function (no CASCADE). No invitation/member/Item/receipt/read-state
row is deleted or rewritten. Drift/dependencies/timeouts stop rollback rather than
improvise. Retain installed compatibility if software cannot be safely restored.

Evidence: actualRoot2C885, scopedReader22PASS after actual baseline3RED/19PASS,
independent source Review and55 owned network-none actual PG negative/ACL/rollback checks.
See the final manifest and validation receipts; local evidence is not Hosted PASS.
