# Auth private Realtime port V1 — local candidate

Golden Slice: an existing committed Account opens a Trip; Native injects Auth's
private subscribe adapter into its existing Realtime trigger. Only a currently
qualified subscription can request existing Downstream invalidation. Missing ports
remain closed. This document does not declare a Hosted endpoint or permission.

The owning server port must atomically authorize the normal session's Account,
linked Trip Actor and current Trip access when opening the private channel. It
returns an opaque lease/channel, Actor Person ID, monotonic Account/Trip access
revision and server-policy expiry. This access revision is not a Trip content
version/cursor; ordinary content edits must not manufacture regrant authority. A successful socket join or Trip UUID alone is
insufficient. No local name, Person, roster or cached role confers qualification.
The transport must enforce the same admission and expiry server-side; a client
timer is defense in depth, not server access control. No client-selected TTL.

Only post-commit Core invalidation hints may flow; no Item/private data in hints.
Auth validates matching lease/access revision and current Account generation before
passing a hint to Native. Native owns debounce, version read, Pull, retry and apply.
Disconnect/expiry closes this lease and schedules only Native lifecycle recovery;
reconnect obtains a fresh authorization, never reuses the previous lease.

A qualified server revocation must include an immutable owning receipt and a newer
access revision. After synchronous generation/scope checks, the adapter closes immediately and gives the receipt to the
owning cache visibility callback. That callback must persist the authoritative
access fence before displaying the Trip again; keep Pending/UNKNOWN/drafts for
recovery, never delete them. Generic failure, timeout, discovery omission or404
must not purge or revoke cached access. Account logout/switch closes the old lease.
A pending or failed cache fence keeps further subscription attempts closed in this
adapter. An older concurrent acknowledgement cannot clear a newer revision fence;
the cache owner must repair/verify its durable denied state before replacing the
adapter. The revision map is process-only defense in depth, not a second permission
ledger; every server open rechecks the authoritative persistent access fence.
Regrant requires a fresh server authorization strictly newer than that revocation;
the adapter refuses an older/equal access revision. Full access may resume only
through the normal owning regrant/read/apply path, not merely a socket join.

Missing owning ports before activation: atomic private channel admission/current
Actor and access revision; server-side expiration and forced revoke; immutable
revocation/regrant reader and cache visibility fence; post-commit publisher; cheap
qualified Trip revision reader. No Schema/RLS/GRANT, subscription transport, cache
migration or Backend deployment is installed here. Server permission negatives and
actual revoke/regrant E2E remain required. Local fixtures prove adapter behavior.
