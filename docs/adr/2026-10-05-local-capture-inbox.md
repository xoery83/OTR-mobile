# Local Capture / Import Inbox — Checkpoint 11

Status: Checkpoint 11 integrated candidate; owner review pending.

## Decision

SQLite48 `local_capture_inbox` is registered after real SQLite47 `trip_day_read_model`.
Store original content in Account-scoped immutable SQLite BLOBs, separate from
Capture identity and mutable local association. Capture is not Source, admission,
Representation, upload, parser execution or verification. No runtime/UI is wired.

FILE/IMAGE preserve supplied bytes. TEXT strings use standard UTF-8 encoding
(including U+FFFD for unpaired UTF-16 surrogates); TEXT byte/reader input must be
valid UTF-8 and is stored verbatim, including BOM and line endings. Empty input
is rejected. A future Share adapter supplies bounded readers, never durable URLs.
Readers must respect the requested maximum chunk size; the consumer checks it,
copies chunks immediately and closes the reader on success or failure.

Hard limits: binary 10 MiB; TEXT 1 MiB; Account 100 MiB unique payload bytes and
1000 Capture references; device 500 MiB unique payload bytes. Intake captures the
existing Account context before reading/hashing, then acquires the existing apply
gate and uses the serialized database transaction. Context/Trip admission and all
quotas are checked before inserts; context is checked again before commit/return.
Dedup candidates are Account/hash/size scoped, but reuse requires exact bytes.
Matching candidate metadata with different bytes is an integrity error, not reuse
or automatic repair. Shared bytes count once; each Capture counts toward row quota.

Only INBOX (null Trip) and ASSIGNED (non-null Trip) exist. Revision starts at 1;
assignment and deletion require the caller's observed revision. Assignment only
changes Trip/state/revision, preserves identity/original metadata and validates
cached ledger_actor_context for the current Account and target Trip. Trip absence
never cascades into payload deletion. Deletion removes a Capture then deletes its
payload only after checking no remaining references, in the same transaction.

Schema CHECKs, composite Account/payload foreign keys and guard triggers enforce
bounds, association consistency, identity immutability and reference-safe deletion,
even when foreign-key enforcement is accidentally disabled. Hash correctness is
verified by the repository rather than a SQLite hash extension. Ordinary reads
fail closed on malformed durable facts and verify payload size/hash before exposing
metadata or bytes. No ordinary read repairs corruption. Reads remain Account-only
even after Trip access disappears; mutation of an assigned Capture requires cached
access to its existing Trip, and assignment also requires access to its target.
Lost Trip admission preserves rows/bytes and blocks mutation until access returns.

A read-only getForSourceHandoff returns exact Capture facts and a verified copy of
payload bytes. It has no Source dependencies or lifecycle transition capability.
The default factory is dormant until Integration registers SQLite48; it never
self-migrates. No network, filesystem storage, global payload cache, queue, receipt
lifecycle or new dependency is introduced. Persistent SQLite rows survive cold
reopen and remain available with the existing offline local Account session.

Errors carry content-free stable Capture codes: INVALID_INPUT, EMPTY_PAYLOAD,
PAYLOAD_TOO_LARGE, READER_FAILURE, INVALID_UTF8, HASH_FAILURE, ROW_QUOTA,
ACCOUNT_BYTE_QUOTA, DEVICE_BYTE_QUOTA, TRIP_ACCESS, NOT_FOUND, STALE_REVISION,
INTEGRITY. Existing Account-context rejection is preserved; SQLite/I/O failures
propagate and transactions roll back. Nothing is logged. Account-retained data is
not automatically deleted on logout/switch. Encryption/retention and real Share
adapters remain future decisions.
