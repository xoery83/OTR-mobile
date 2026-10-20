# Capture C2 local durable intake

Date: 2026-10-08 (Pacific/Auckland). Status: authorized implementation; owner review pending.

Implement the accepted P1/C2 Revision 1 at exact canonical
`b6daffecedab1616b173fde3f5e2de5d54770eff`. SQLite51 adds only the
immutable Batch/Job header and ordered Input manifest. Header JSON uses the
accepted contract technical bound of 64 KiB, never truncation. Original quotas
and bounded readers remain CP11-owned. No server migration.

Factor CP11 insertion/verification into a transaction-local data repository seam.
Register the complete frozen request before reader I/O; pin verified content
before acceptance; atomically commit original and Input binding. Uncertain
writes require exact scoped readback. Accepted bindings protect original bytes.

Explicit same-Account continuation is immutable lineage to an older registered
Input, never byte equality or authority. Native handles remain transient.
Authenticated offline sessions and existing generation/apply gates govern every
operation. Trip context is passive; all C2 originals start INBOX.

C3 Activity, processing, providers, canonical commands and destructive cleanup
remain deferred. No scheduler, dependency, upload, remote service or activation.
