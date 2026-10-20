# Core v2 storage dispatch and finite JSON codecs

Status: accepted technical implementation binding of Owner-approved W0; activation CLOSED.

Core v2 shares existing Event/Reservation identities. Server85 adds finite child tables
and conditional v2 columns; Server86 dispatches guards by the existing row version.
Historical migration and function bytes remain unchanged. Nullable additive fields
preserve v1 rows; explicit v2 constraints enforce the accepted complete typed schema.
Reserved non-login gateway/writer roles and an empty, closed capability gate prevent
normal business use before an owning authenticated transaction adapter is verified.
The additive migrations have only been applied in an owned network-isolated clone.
Old activation inventory fingerprints are not reinterpreted as a v2 attestation.

SQLite54 uses account-partitioned finite mirror tables and the existing durable queue.
A verified complete read2 snapshot atomically replaces only its actor/Trip partition;
person bindings are retained with that snapshot. Pending prediction is marked PENDING
and has no accepted certificate generation. Revocation persists even before first read.
No v1 completeness certificate or Source workflow is promoted to version2.

The v1 integer-only JSON codec is retained byte-for-byte. Core v2 uses a separate
bounded canonical JSON codec because accepted coordinates and document regions are
finite fractional values. It rejects duplicate keys, invalid Unicode, unsafe or lossy
numbers, non-JSON values, excessive size/depth and prototype keys. Hash domains include
version2 and operate on that codec; number rendering follows JavaScript JSON encoding.

The internal command transaction port authenticates actor/Trip, locks operation and
base roots, checks prior receipts before fresh admission, and atomically commits facts
with one immutable exact receipt. Source verification stays in the owning transaction;
public commands cannot assert authority with a flag. Revoked replay may return only
status and digest. Parser/fact violations become terminal rejected receipts; storage
or unexpected errors propagate without fabricated success or hidden retries.

No route, hosted connection, provider, custody, native device or business activation
is established by this ADR. Those integrations require their scoped acceptance proof.

The next owning PostgreSQL adapter leases a dedicated gateway session, verifies its
principal, and uses parameterized finite-table SQL only. It locks actor/Trip membership,
operation identity and the sorted affected roots before loading the final read set.
It never adopts a legacy root on a v2 create. Source, resolver, original custody and
Ledger admission are verified by explicit owning ports; absent ports remain closed.
Business deltas, immutable exact receipt and read-state bump commit together. A lease
must retire on uncertain rollback/cleanup. No generic SQL or credentials are exposed
through HTTP, repositories or feature modules; the existing read-only Catalog driver
is not repurposed as a writer.

Actor read2 Person bindings distinguish current binding validity (`active`) from
current travel participation (`participating`). Leaving the participating roster does
not revoke a still-linked Person's private/selected access. The participating hash
uses only active participating Persons. Instruction read mirrors may retain an opaque
predecessor UUID whose body is excluded by independent ACL; full server graph validation
and FK enforcement remain strict. Authorized collection validation checks any visible
predecessor, without requiring an unauthorized predecessor body or widening access.
Canonical child sets use the same UTF-16 key ordering as the finite JSON/hash contract.
Participation and holder edits retain inactive historical rows rather than deleting them.

Owning read2 holds one primary transaction snapshot and the same actor/Trip membership
locks. A complete inline collection returns all bounded pages from that snapshot;
there is no multi-request pagination token in this atomic bundle. Current Person
participation/binding material is supplied by a scoped security-definer read function,
without exposing raw Person tables to the dedicated gateway. Membership/participation
changes bump an existing Core read state's access generation through additive triggers.
Item supplemental projection consumes this verified roster and independent original/
Ledger read authorities; absent custody/Ledger ports filter those associations. The
HTTP/read transport and repository install still inherit account and refresh fencing.

Existing Person participation material revisions begin at zero. PERSON_BINDING record
revisions therefore accept zero and preserve that exact v1 value; Core root/relationship
and collection revisions remain positive. No synthetic increment or v1 rewrite is used.

Core Source transactions join the existing C/Source serialization locks before actor/
Trip row locks. A new scoped definer locks retained Source ownership and claim inputs;
it never impersonates a legacy gateway. Read-only legacy Source grants are bounded by
current actor/Trip ownership and run/confirmation ancestry, with no legacy writer or
admission function grants. Missing sealed qualified airport/relationship authority
remains Review; transient extractor observations are not promoted to evidence.

Normal gateway raw SELECT excludes operational storage keys and legacy Source tables.
The authenticated owning read transaction temporarily assumes the dedicated writer
role for its internal complete graph and returns to gateway before material binding
reads; independent original/ACL filtering precedes any outward projection. Source
storage similarly reads its private legacy catalog only under that owning role.
Legacy business1 Event reads explicitly exclude business2 rows. Before the additive
business-version column exists, only an exact undefined-column response permits the
historical query; permission/transport errors never enable a permissive fallback.

Actor collection hashing redacts unauthorized Source evidence references before hashing
and retains admitted business facts. Immutable full receipts whose audit contains
private Source pointers require a separate owning audit read check; absent authority
returns STATUS_ONLY. A group root permission does not grant another owner's Source
provenance, and audit redaction never rewrites the immutable exact receipt digest.

Owner direction on2026-10-12 assigns v2 publication authority to Core/Source; Capture
supplies interpretation/evidence/preparation only. Publication re-reads retained source
bytes and reuses the deterministic extractor, rather than trusting client normalized
values or qualification flags. Airport purpose identities use IATA_AIRPORT:<code> only
after an owning, date-bound registry assignment is uniquely verified. Regex/code presence
is not qualification. Private registry rows pin an immutable registry version/digest;
ambiguous/absent/revoked assignments remain REVIEW. Existing accepted_place_id stays NULL
unless an independent verified places UUID exists. No airport lookup creates a Place,
route capability, civil-time resolver, provider call or Hosted activation. Isolated SQL
fixtures explicitly seed synthetic registry authority and cannot prove deployed authority.

Legacy v1 admission cannot inspect v2 purpose certificates. An additive trigger therefore
fences fresh/reopened legacy CREATE claims for an actor/Trip/Source with active v2 slots.
It takes the established C scope lock before reading the v2 claim catalog; existing
legacy CREATE recovery updates are preserved. Publication without a prepared v2 slot
is not an active domain claim. This is a conservative cross-version admission fence,
not a rewrite of historical functions, new Capture authority or activation permission.

Certified physical v2 slots in REVIEW can still represent uncertain or known domain
outputs. REVIEW state alone does not release their claims. The additive legacy fence
therefore remains conservative across all physical v2 slots until a bounded exact
NO_COMMIT release authority is available; unqualified pre-seal REVIEW has no physical
slot. Existing legacy recovery updates remain permitted, while fresh/reopened CREATE
cannot bypass a retained v2 claim by changing its state label.

Fresh publication/admission rechecks current Source revision/run/pins and airport authority.
Already committed evidence finalization uses exact retained historical revision/run/pins,
immutable Candidate field evidence and exact slot/receipt/target vector, with current
Source ownership/retention and Trip access. A later material update or run supersession
cannot silently rebase or permanently prevent lineage for an accepted receipt. Source
removal/access loss still denies. The association-specific additive guard separates
historical finalization from the unchanged current-publication guard; it writes metadata
only and never changes Canonical facts or grants fresh dispatch authority.
