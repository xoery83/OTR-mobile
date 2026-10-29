# Restore Guest publication write fencing from existing checkpoints

The process-local inventory lease cannot protect a restarted Guest after publication
was requested. Reuse the existing immutable Auth recovery files: inspect every
validated attempt under the apply gate and retain a local read-through hold whenever
any attempt requires server status. Corrupt/unknown recovery remains fail-closed.
No timeout, device clock, local cancel or absent response proves non-publication.

Record an in-process hold before attempting the durable publish-request checkpoint.
Existing Guest repository getters reject held access; inventory reads keep their
original identity guard. Inventory release cannot remove a publication hold. A new
Guest scope may clear obsolete inventory tokens only if inspection found no pending
publication. Cold discovery of a hold stops normal workspace opening before any
SQLite opener or migration; dedicated server-status recovery must handle that state. Inspection and all hold updates share the existing apply gate.

This is a local safety fence, not server authority. No reset/override API, second
journal or sync engine. The actual publisher and Native adoption UX remain closed.
A future enabled flow must provide server-authoritative terminal status and a proper
read-only recovery UI before activating publication; no cloud acceptance is implied.
