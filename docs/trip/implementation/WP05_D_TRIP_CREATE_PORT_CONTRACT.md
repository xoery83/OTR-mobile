# WP05-D owning Trip creation port — isolated implementation contract

This packet follows the local pending container in WP05-C. The existing Trip UUID
and create operation UUID travel through one authenticated Backend request. The
Backend binds the actor from its validated bearer token, then invokes a dedicated
Trip creator PostgreSQL function. A receipt and the Trip insert commit together;
the existing Trip creator triggers supply the owner membership and linked Person.
The function returns only the persisted Trip, linked Person, and Core read epoch.
It accepts no client role, Person, financial setting, or Core certificate.

The request payload is the exact persisted local metadata: Trip UUID, name,
nullable destination/start/end calendar dates. The operation UUID is the
idempotency key. PostgreSQL stores the canonical JSON payload in a unique receipt
bound to both operation and Trip UUID. An exact retry returns the same persisted
result; changed metadata, another actor, or a reused Trip UUID fails closed. A
separate receipt read resolves an unknown HTTP acknowledgement without creating a
second Trip. An empty Core read-state row is initialized in the same transaction,
using its existing physical schema and no fabricated collection certificate.

The local queue remains dependency blocked until an explicit owning Trip sync
coordinator runs. It checks receipt first, then sends the create request, and
reconciles the returned UUID and Person under the Account apply gate in one SQLite
transaction. A stale Account generation cannot apply the result. A network or
uncertain response leaves the durable operation unresolved for receipt replay.
The generic worker excludes `CREATE_TRIP` so a later queue state change cannot
send it through the unrelated executor. Existing Core P1/P3 intents stay blocked
until their own accepted scope/capability checks permit progress.

This source package does not wire a production/Hosted connection, provision a
credential, deploy migration `20261013000500`, enable Core capabilities, initialize
Ledger currency/valuation, or claim an authenticated Native journey. Source owns
the main migration registry and serial integration; this author owns only the
isolated forward migration and finite Trip port files. `backend/src/app.ts` is an
additive isolated mount based on blob `8697da31967819ae3b225fb23a1aaec64f804a35`;
Source has leased that file for this packet and will recheck current main.

Validation must cover request/replay/collision/rollback, actor isolation and
receipt lookup, lost response retry, Account A→B→A local apply rejection, and
closed Core capability behavior. SQL acceptance is mechanical on a disposable
database only; actual Hosted and Native runtime remain separately gated.
