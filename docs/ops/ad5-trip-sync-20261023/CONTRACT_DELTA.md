# AD5 new Trip structured destination closure — local candidate

Owner requests new QA Trip only. Existing scalar Phase C receipts remain unchanged;
no old Trip/outbox migration, permission activation, DEV query/write or deployment.

- Cloud-shared destination value reuses approved local fields: destinationId,
  displayLabel, source, and Apple provider/providerPlaceId. Array position is order;
  at most20, stable IDs and manual/place claims unique. No coordinates, geocoder
  response, photo/local URI or new fields.
- Create V2 and Metadata V3 are explicit new operations. V1 Create and V1/V2
  Metadata strict payloads/pending bytes remain unchanged. V3 uses existing
  metadata_revision CAS over scalar fields plus structured list; no Core revision.
- Proposed SQL adds nullable trips.destinations JSONB. NULL identifies the scalar
  legacy contract; old rows stay NULL without backfill. Structured new Trip uses
  scalar destination=NULL and explicit array (including empty array).
- Extend the existing command, receipt, snapshot, revision trigger and finite gate
  contracts; reuse owning roles/receipts, not a new table/queue/authority. Old scalar
  Edit must fail closed for a structured Trip. Original Create receipt retains its
  original list even after subsequent Edit.
- Separate exact Owner installation/deployment/activation Gate is required for
  reviewed column/function/constraint/trigger/ACL deltas and fresh newQA Native
  execution. Existing finite payload and runtime file limits must become bounded
  version-aware limits (old versions retain prior caps). No such Gate executes here.

Data Path Checklist: ownership Cloud-shared list, Local-private covers unchanged;
local existing SQLite destinations+operation JSON; same queue/transport/Backend;
CAS and idempotent replay with old clients fail closed; required L1 Native plus L2
contract/isolatedPG plus newly authorized L3; remaining delta is candidate delivery,
independent Review, precise Owner SQL/deploy/write approval and Native acceptance.
