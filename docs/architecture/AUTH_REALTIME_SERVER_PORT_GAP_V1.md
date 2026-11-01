# Private Realtime server qualification — exact owning gap

Status: **BLOCKED_BY_OWNING_INTERFACE** for server admission and real revoke/regrant.
This is a source-level assessment, not a Hosted configuration or database readback.
The local Auth adapter at82b93537 remains default closed; no new Backend wrapper
is added merely to rename an existing boolean as an authorization certificate.

## Reuse available now

| Existing port | What it proves | What it does not prove |
| --- | --- | --- |
| `supabaseGateway.validateAccessToken` + `authAccountQualification.isNormalAccount` | Trusted Supabase `getUser`, valid normal Account, rejects resource tokens | Trip/Person authority or private channel admission |
| `supabaseGateway.canReadTrip` | Three existing creator/legacy-member/linked-member lookups authorize a normal business read | Atomic join, current Actor Person, expiry, access revision or terminal revocation; lookup errors throw |
| `tripCoreV2PgStorage.lockCorePgActor` | Existing `trip_core_lock_actor_scope(account,trip)` on the owning lease; exact Account/Trip match | Channel lease or durable revocation receipt |
| `tripCoreV2PgRead.snapshot` (internal) | Repeatable-read scope/principal/finite gates, active Actor, `trip_core_read_state` epoch/revision/access_revision, qualified complete collection | Dedicated cheap observation, server subscription expiry/force-close, explicit Account/Trip loss/regrant |
| `CoreHttpConnection.read` | Existing collection/item and optional capabilities | No authorization/revocation/subscription method exists in this port |
| `MemberClaimAuthorityPort.atomic` | Dormant server-serialized invite/link/unclaimed-invite revoke contract | Implemented general membership revoke/regrant reader or publisher |

`coreHttpBoundary` returns404 for denied/unknown reads. This cannot distinguish
never-visible from formerly revoked. Native must not purge or claim revocation.
The read-state guard's normal Core UPDATE preserves `access_revision`; content
`revision+1` is not an access transition. Do not manufacture access revisions from
Item/Core revision, current clock, channel join, boolean reads or receipt counts.

## Smallest owning differences to unblock

1. Core Writer exposes a narrow current Account/Trip qualification observation,
   reusing the exact principal/finite gate + actor lock transaction above. It must
   distinguish readable linked Actor from explicit terminal loss using owning
   evidence. A boolean or generic404 remains UNCONFIRMED, not a revoked receipt.
2. Auth/Core define a durable monotonic access transition and immutable receipt,
   including epoch/version relationship to accepted collection manifests. This is
   the existing membership authority's extension, not a parallel client ledger.
   Permission changes need their exact reviewed Gate before installation.
3. Subscription owner atomically binds the trusted normal Session, current Actor,
   Trip and access qualification to a private join/opaque lease; policy supplies
   expiry. The same owner enforces expiry and revocation on the server and forces
   disconnect. `canReadTrip` followed by an independent socket join is insufficient.
4. Core emits only a minimal invalidation after successful APPLIED commit. It needs
   a current qualified version reader; rollback, failed save or socket join cannot
   emit an accepted change or grant private data access.

The minimal implementation seam is an optional owning read/admission port injected
by the existing Backend composition, not a new public endpoint, credential store,
transport, queue or permission table defined by Auth's client adapter. Its absence
keeps `createTripPrivateRealtimeAuthorization.open` absent/default closed.

## Native fence compatibility

Existing `tripCoreV2Repository.revoke(context, accessRevision)` withholds projection
and blocks unfinished Core operations without deleting bytes. Existing refresh
fences retain a revoked scope; no qualified server regrant operation is delivered.
Auth candidate `authorizationRevision` cannot be blindly passed as that repository's
`accessRevision`: the latter is compared with full Core collection manifests. Core
and Native must qualify their epoch/version relationship before mounting cache
callbacks. Regrant needs both a new authoritative grant and a coherent complete
collection through the existing apply path. A join success cannot clear revocation.

Root/Core confirmed no additional private admission/revoke/regrant port exists.
Native consumed the local Auth candidate82b93537 as64038e6b with10 tests PASS,
unmounted. Native confirmed authorizationRevision is not passed to Core revoke;
the full Core manifest/accessRevision tuple remains independent. No mapping or
shared interface change has been silently introduced.

Root/Core and Native were sent these exact interface questions on2 November2026.
No deployment, SQL/ACL/RLS/GRANT, Session, OAuth, device, Provider or business write
was performed for this assessment. Server/E2E negatives remain outstanding.
