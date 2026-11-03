# AUTH-C05 local ACL / revoke preparation

MC Plan2 AUTH-C05:LOCAL_PREP was actually claimed rev7 and started rev8.
C04 remains primary. No Hosted, Core owning-code or shared-device change occurred.

## Actual current-main contract failure

Pinned main f15ff0ab Core mutation source equals Auth's complete module,
SHA53e0d6ab46023b3eca396f7c1113fd73cc0bf5d58b3bdb249daee5a001af7b7f.
CORE_NON_EVERYONE_REPRO.test.ts.txt is an explicit red regression handoff, not a
passing suite or a default CI test. A temporary Auth-owned test copy was executed
and removed: 2 contract failures, 2 control passes. Output and receipt retained.

For another creator's SELF/non-Everyone Item, a managing Actor can read GROUP or
selected-person visibility, then coreCanManage incorrectly returns true. Own
creator editing and other-owned PRIVATE denial controls pass. This reproduces
the registered PeopleV1 gap on a fixed source; it is not a new global audit or
proof of a Hosted command exploit. Core's unique Writer must fix using the owning
Everyone/Creator semantics and prove server negatives. GROUP visibility must not
be substituted for Everyone participation. No permissions code was changed here.

## Joined-member revoke typed interface consumed read-only

Read Root's exact64f3a196 candidate and carrier findings in its owning checkout.
It is an unpublished default-closed Authority contract, not a PG/route/deny port.
It references existing PERSON_BINDING kind/id/revision/body plus expectedEpoch
and actual accessRevision CAS. Participation revision is only a snapshot pin;
no fabricated membership UUID/counter is introduced. Own immutable REVOKED receipt
binds full command/Actor/digest and accessRevisionAfter; UNKNOWN recovery is read-only.
The current C04 Invite receipt is incompatible and must not be reused by inventing
an INVITE_REVOKED outcome for an existing member removal.

Consumer gaps to close before Native integration:

1. Formal revoke target preparation: Auth's People display reader deliberately
   omits other Account UUIDs and raw binding revision/body, so it cannot manufacture
   this command from a connection badge. The owning Core/Native layer must supply
   the exact authorized binding + epoch/access revision via its existing Reader or
   a minimal preparation port. UI names, selected IDs and canManageShared are not
   server Owner proof. Do not add a duplicate membership reader in Auth.
2. Native no-crypto wire schema: the current Backend candidate combines schemas
   with node:crypto. Before a real Native transport imports them, Core Writer should
   expose its command/receipt schema in a platform-neutral owning contract and
   retain Backend digest implementation. Do not fork a guessed matching schema.
3. Existing Core repository revoke(ctx,accessRevision) is a local deny mechanism;
   its existence is not an authoritative current server-denial producer. Binding
   a formal denied read to current Account/Trip/generation/epoch/access revision
   and triggering the existing downstream/cache path still needs qualification.
   Owner A's removal receipt does not authorize writing directly into B's cache.
4. Preserve private ownership independently. Membership denial must reach existing
   gateway/list/Core Actor and applicable owning RLS paths; removing a linked row,
   a pending invitation or adding a marker alone cannot prove this. Native cold
   denial/regrant requires an actual qualified server observation, not ordinary404,
   a known Trip UUID or expired lease. Private Realtime remains outside the Beta
   prerequisite unless its actual channel is enabled.

The original offline cached-session launch rule stays intact. Only actual known
denial invalidates access; network failure is not revocation. No local Session is
copied and no regrant is inferred from old Claim/removal receipts.

This completes local fixture/port preparation only. Business ACL remains FAIL at
the recorded helper and formal member revoke remains blocked on Core PG/deny ports.
