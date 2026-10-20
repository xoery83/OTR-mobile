# Dormant authenticated Publication Catalog transport

Date: 2026-10-09 (Pacific/Auckland).
Status: Owner accepted preflight with implementation conditions; dormant Builder,
independent security review required. No provisioning or activation authorization.

Use one versioned authenticated GET over the existing protected Track C complete
Actor/Trip catalog, retaining SQLite53's accepted local membership model. Backend
verifies Supabase bearer Auth and derives actor itself. A single injected leased
primary session checks actual session_user and calls the fixed parameterized
read-only SQL root under bounded READ COMMITTED observation. Missing dedicated
principal/connection withholds; no service-role/public RPC authority is added.

Transport returns the complete canonical13-family schema or error, bounded at64
rows/family and4MiB. No new completeness token, publication identity, pagination,
filtering or publisher exists. Network hashes check integrity, not authentication.
Current SQL authorization authenticates an observation, not a perpetual lease.

Reuse context-bound Auth/coalesced refresh, one401 replay and existing apply gates.
An explicit bounded request path adds cancellation, full-operation deadline and
streamed byte admission before parse while ordinary API callers remain unchanged.
No default/native Publication fetch is installed; trusted streaming capability must
be separately injected and certified. Unknown Auth/network failure never implies
credential revocation or deletes historical local evidence.

The CLOSED reader's optional signal follows the original request through provenance
validation and onto the admitted handle. Installation rechecks it at final owning
transaction admission; this small extension prevents canceled/superseded reads from
regaining installation authority after HTTP completion. The original Account/Trip/
generation, WeakMap and complete membership/provenance guards remain authoritative.
Cancellation after commit admission does not undo an already committed observation.

No live connection/credential, schema/grant change, scheduler, provider/C5/C9 authority
or runtime factory is installed. Rollback withholds the injected transport/consumer
and retains all SQLite53 evidence and responsibility. Hosted principal/contract,
native streaming and Integrated C4 acceptance require separate Owner gates.
