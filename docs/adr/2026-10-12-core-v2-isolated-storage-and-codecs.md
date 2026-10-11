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
