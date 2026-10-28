# Closed Guest whole-dataset preflight boundary

AUTH Final V1 requires server-authoritative entitlement preflight before any
Guest business contents/file upload. The first versioned request therefore carries
only adoption/source/target UUIDs, complete local inventory digest and resource
counts. It does not carry names, notes, files, Session or SQL payloads. Resource
counts are safe integers, not commercial limits or billing units.

The existing Backend authentication middleware supplies the canonical Account ID;
the body target must match it. A Guest local UUID is provenance, never the server
actor. Existing target-account confirmation remains a separate client requirement.
An owning preflight adapter must atomically issue/replay a target+adoption+digest+
count-bound grant under the approved policy. Counts must be recomputed from sealed
staging contents and entitlement revalidated at atomic publication; a client count
or this boundary cannot authorize a partial dataset. No pricing/reset/threshold
policy is defined here. Missing adapter stays closed.

This slice adds strict request/grant DTOs and a bounded, cancellable Backend
boundary only. It is not mounted in app/bootstrap and has no PG implementation,
new Role/GRANT/RLS, upload, Provider call or Session activation. The grant permits
only future authorized private staging, never Trip publication. Unknown/timed-out
responses retain Guest originals and retry the same adoption ID; a future owning
adapter must reconcile idempotently rather than allocate a new transfer.

The missing owning atomic port must retain original Actor/Creator/CAS/Receipt
semantics on one caller-held database transaction and full rollback. Existing
Trip/Core adapters each own BEGIN/COMMIT and use different Gateway guards; do not
intercept COMMIT or remove session_user checks to compose them. Core's unique
Writer reviews the exact candidate; any protected execution changes retain the
precise Owner gate. This DTO/boundary alone is not server preflight or Adoption E2E.
