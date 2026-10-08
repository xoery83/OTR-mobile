# P2b-B minimal Mobile C4 assessment observation store

Date: 2026-10-08 (Pacific/Auckland). Status: **ACCEPTED IN PRINCIPLE / CORRECTED PROPOSAL — FINAL OWNER ACCEPTANCE REQUIRED**.
Base: `06adea85fc5d5d7b24f7e15a598e28cb86ae4671`.

## Context

Canonical SQLite51 C2 retains existing distinct Batch/Job identity and complete
ordered intake. Accepted C4a is a dormant, strict, pure read-only assessment with
caller-supplied pins. It has no persistence or owning-data adapter. Owner authorized
only documentation revision and a minimum Builder plan at this checkpoint;
no migration/repository implementation. The one-table append-only architecture
is accepted in principle, with the corrections below pending final acceptance.

## Proposed decision

Add one Account/Batch-scoped observation table after separate implementation
approval. Primary key is Account/Batch/assessment revision; reuse the C2 Job.
Retain complete canonical manifest, processing snapshot and assessment envelope,
with separate verified C2 declaration and C4 manifest hashes, snapshot hash and a
domain-separated complete-body hash linked to the preceding body hash.

Context Digest must be
`importDigest('otr-capture-context-v1', validatedContext, sha256)`, after strict
validation of the retained original C2 context with `submissionContextSchema`.
Bind it as body.contextSha256=manifest.contextSha256; do not use a raw context-JSON
hash. Preserve original C2 context JSON bytes and existing C2 request/manifest
hashes unchanged; independently verify them using the original C2 rules.

Derive head from highest fully validated contiguous prefix starting at 1. A damaged
chain blocks NEW appends and cannot present its prefix as healthy current state.
Immutable rows never replace/delete predecessors. Atomic append compares exact
expected revision+digest, validates current owning pins, and inserts only head+1
under existing Account apply gate and serialized SQLite transaction.
Exact body/revision replay recovers lost ACK and cold restart without a new UUID,
head/mapping table, scheduler, reassessment or authority. Fresh Account generation
is required for disclosure; persisted generation is not a restart credential.

Retain the provisional 2 MiB inclusive UTF-8 complete-body limit. **Some
C4a-valid requests may exceed it** and must return `RECORD_TOO_LARGE` without
partial persistence, truncation, compression, omitted evidence or fabricated Batch
splitting. Near-limit serialization fixtures are not a universal size proof.
Retain all Beta history with no pruning or new aggregate quota. FULL/uncertain
commit preserves history and uses exact readback; no success or absence is inferred
from a storage/read exception.

## Consequences and limits

Existing SQLite/auth/repository/hash conventions and installed dependencies suffice.
History read verification grows with retained revisions; no persisted cache/head is
added for hypothetical scale. Large C2 rosters outside C4a 64-Input/UUID grammar are
unsupported intact, never truncated or renamed. Owning publication/current pins
still require a separately approved integrated-C4 adapter; stored observations
provide no Review, preparation, retry, C5/C9/Provider or canonical admission
authority. Account fencing and current owning-data freshness checks remain
mandatory for every NEW append. Exact historical replay grants no freshness.
No new Head, Mapping, Job or Scheduler table is authorized; corrupt latest history
blocks NEW append and Beta retains all observations without pruning.

Hashes are consistency checks, not signatures or protection from privileged DDL.
Tail-only removal/backup rollback has no external anchor. Unlimited Beta retention
can exhaust storage; admission fails safely. Unknown schema versions and corruption
need Owner-directed recovery, not automatic rewriting. Post-install application
rollback preserves populated table/migration history; no destructive down migration.

## Review and next gate

Exact schema/index/transaction/body/capacity contract, audit, test plan and Owner
choices: [P2b-B contract](../architecture/OTR_PLATFORM_P2BB_SNAPSHOT_PERSISTENCE_CONTRACT.md).
The corrected Contract and
[minimum Builder plan](../architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_PLAN.md)
require final Owner acceptance. Current owning-data composition and implementation
require separate explicit authorization; independent review must precede closure. Migration ID is unassigned;
SQLite52 is not reserved. No runtime activation, Hosted/device/provider access,
commit or push is authorized here.

**STOP — P2b-B CONTRACT REVISION / FINAL OWNER ACCEPTANCE REQUIRED.**

## Owner-authorized dormant Builder status — 2026-10-08

Owner gave final acceptance of the corrected documents and conditionally authorized
SQLite52 after source/registry/concurrent-reservation checks. The gate passed at
current main `f7115dc288aff7f0a252bf80f53b0f2b626a7534`; the fresh Builder worktree
implements only the dormant store and minimum validation seams. This addendum
supersedes prior implementation-pending/unassigned-SQLite52 stop statements above,
which remain historical design evidence. Accepted body/hash/CAS/retention/authority
rules are unchanged. No production Integrated C4 composition is installed.

Actual paths, migration preservation, tests and remaining limitations are in
[the Builder report](../architecture/OTR_PLATFORM_P2BB_SQLITE_PERSISTENCE_BUILDER_REPORT.md).
All C4/C5/C9/Provider runtime gates remain CLOSED; no Hosted/device/provider operation,
commit or push. Independent review is the next gate.

**STOP — P2b-B SQLITE PERSISTENCE BUILDER / INDEPENDENT REVIEW REQUIRED.**
