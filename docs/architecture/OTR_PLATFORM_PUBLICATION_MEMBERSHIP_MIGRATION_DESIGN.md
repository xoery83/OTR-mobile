# Publication membership migration design — gated, unallocated

Date: 2026-10-08 (Pacific/Auckland). Owner accepted the complete membership
preflight and authorized dormant code/design only. **Do not execute this DDL or
register it until SQLite52 is accepted and ancestry/numbering is verified.**
SQLite53 is a candidate, not an allocation. No migration module/registry edit exists.

Proposed name: `trip_source_publication_membership`. One nullable Run TEXT column,
four guards, no table/index/backfill or new publication identity. Historical rows
remain NULL. SQL checks storage/envelope bindings; the owning repository performs
strict parsing, canonical/hash/whole-roster/Input/provenance validation. SQL cannot
authenticate a caller's digest or the trusted private read transport.

Review-only DDL:

```sql
ALTER TABLE trip_source_runs ADD COLUMN publication_membership TEXT
  CHECK(publication_membership IS NULL OR
    (typeof(publication_membership)='text'
     AND length(CAST(publication_membership AS BLOB)) BETWEEN 1 AND 32768
     AND json_valid(publication_membership)
     AND json_type(publication_membership)='object'));

CREATE TRIGGER local_publication_membership_insert
BEFORE INSERT ON trip_source_runs WHEN NEW.publication_membership IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED'); END;

CREATE TRIGGER local_publication_membership_immutable
BEFORE UPDATE ON trip_source_runs WHEN OLD.publication_membership IS NOT NULL AND (
  NEW.publication_membership IS NOT OLD.publication_membership OR
  NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR
  NEW.trip_id IS NOT OLD.trip_id OR NEW.actor_account_id IS NOT OLD.actor_account_id OR
  NEW.operation_key IS NOT OLD.operation_key OR
  NEW.scope_source_ids IS NOT OLD.scope_source_ids OR
  NEW.scope_sha256 IS NOT OLD.scope_sha256 OR NEW.generation IS NOT OLD.generation OR
  NEW.input_sha256 IS NOT OLD.input_sha256 OR
  NEW.extractor_key IS NOT OLD.extractor_key OR
  NEW.extractor_version IS NOT OLD.extractor_version OR
  NEW.extractor_options_sha256 IS NOT OLD.extractor_options_sha256 OR
  NEW.state IS NOT OLD.state OR NEW.created_at IS NOT OLD.created_at OR
  NEW.completed_at IS NOT OLD.completed_at OR NEW.error_code IS NOT OLD.error_code
)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_IMMUTABLE'); END;

CREATE TRIGGER local_publication_membership_install
BEFORE UPDATE OF publication_membership ON trip_source_runs
WHEN OLD.publication_membership IS NULL AND NEW.publication_membership IS NOT NULL
  AND (NEW.registration_state<>'REGISTERED' OR NEW.state<>'READY' OR
    NEW.retention_state<>'RETAINED' OR NEW.cache_account_id<>NEW.actor_account_id OR
    json_extract(NEW.publication_membership,'$.body.version') IS NOT 1 OR
    json_extract(NEW.publication_membership,'$.body.run_id') IS NOT NEW.id OR
    json_extract(NEW.publication_membership,'$.body.actor_account_id') IS NOT NEW.actor_account_id OR
    json_extract(NEW.publication_membership,'$.body.trip_id') IS NOT NEW.trip_id OR
    json_extract(NEW.publication_membership,'$.body.operation_key') IS NOT NEW.operation_key OR
    json_extract(NEW.publication_membership,'$.body.generation') IS NOT NEW.generation OR
    json_extract(NEW.publication_membership,'$.body.scope_source_ids') IS NOT NEW.scope_source_ids OR
    json_extract(NEW.publication_membership,'$.body.scope_sha256') IS NOT NEW.scope_sha256 OR
    json_extract(NEW.publication_membership,'$.body.input_sha256') IS NOT NEW.input_sha256 OR
    json_extract(NEW.publication_membership,'$.body.extractor_key') IS NOT NEW.extractor_key OR
    json_extract(NEW.publication_membership,'$.body.extractor_version') IS NOT NEW.extractor_version OR
    json_extract(NEW.publication_membership,'$.body.extractor_options_sha256') IS NOT NEW.extractor_options_sha256)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_INVALID_INSTALL'); END;

CREATE TRIGGER local_publication_membership_retained
BEFORE DELETE ON trip_source_runs WHEN OLD.publication_membership IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_RETAINED'); END;
```

Run `row_revision`, registration, supersession and retention observations may change
through the existing catalog owner; they never rewrite/drop the immutable envelope.
Missing/unregistered/deleted/changed Candidate/Input siblings are rejected by whole
membership read validation even with FK OFF; this design does not add deletion
guards to every sibling table. Run/envelope deletion is protected regardless of FK
state. A populated column is not itself usable authority without owning validation.

After the migration gate clears, create the allocated migration module and use the
existing runner's single DDL/history transaction. Test fresh chain/current upgrade,
failure after ALTER/each guard/history write, safe retry, prior typed-row/history
preservation, 32768/32769-byte bounds, NULL compatibility, FK ON/OFF identity/
envelope deletion guards, and file-backed install/ACK/cold readback. This DDL has
not been parsed or executed and has no migration-test PASS claim.

Rollback disables the dormant consumer; retain populated column, guards, catalog
evidence and migration history. No destructive down migration/reset/backfill.
Coordinate with accepted SQLite52 and reverify canonical registry/ancestry rather
than append a presumed53 to an older51 branch.

## F1 correction record — owner authorized 2026-10-09

The original reviewed design above is preserved as historical text. Independent Review F1 proved that SQLite conflict replacement can delete a committed Run without invoking its DELETE guard when `recursive_triggers=OFF`; `foreign_keys=OFF` also removes the populated Input FK protection. Before correction, the four independent rejection probes fail and the three cold-file characterization probes confirm committed envelope/Run loss.

The owner authorizes correcting the uncommitted SQLite53 INSERT and UPDATE guards before Independent Recheck. Each guard must preemptively reject an incoming row that conflicts with a committed victim through any existing unique constraint: `(cache_account_id,id)`, `(cache_account_id,trip_id,actor_account_id,operation_key)`, or `(cache_account_id,trip_id,actor_account_id,scope_sha256,generation)`. UPDATE excludes its own OLD composite identity from the victim lookup, preserving permitted observation/retention updates. These checks apply before replacement deletion and do not depend on FK or recursive-trigger settings.

Only the existing INSERT and UPDATE guard predicates change; their existing error contracts remain `PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED` and `PUBLICATION_MEMBERSHIP_IMMUTABLE`. The install and retention guards, one nullable column, four-guard count, historical NULL semantics, no-backfill behavior, and all SQLite1–52 bytes/registry entries remain unchanged. The original SQL block's two collision-vulnerable predicates are superseded by this record and the corrected SQLite53 module. No new table, index, trigger, migration, Repository design, Transport or runtime activation is authorized.

Required evidence: reject INSERT/UPDATE replacement across all three constraints with FK ON/OFF and recursive triggers ON/OFF; preserve the exact committed row and envelope after close/reopen; retain legitimate NULL writes and allowed committed observation/retention updates; rerun the accepted migration, rollback/retry, accepted52 compatibility, 974-test matrix and static/preservation checks. The Builder Report correction appendix records the final SQL hash and results. Targeted Independent Recheck remains required.
