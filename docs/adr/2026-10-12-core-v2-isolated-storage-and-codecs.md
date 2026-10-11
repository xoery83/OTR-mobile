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
