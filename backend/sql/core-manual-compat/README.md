# Core MANUAL compatibility for Import V3

Base source 4e46aaa3239deee4c10d21f58a248a13bc093230. Candidate for Root2's existing serialized standard DEV and invite-only Beta release.

The Core gateway sets a transaction-local compatibility marker only for validated MANUAL commands and ordinary Core graph, capabilities and receipt reads in the sustained runtime. The SQL changes the two existing owning predicates. The marked write admission uses the ordinary Trip edit contract (creator, legacy Trip member, or linked owner/group member) with bound Actor/Trip, active nonanonymous Auth, and removed-member denial. The marked graph reader retains the existing linked membership check. Existing disabled/revoked policy rows still deny access; a policy row is not required. Unmarked callers keep the original eligibility path.

The existing command/Item/Document guards, ACL/RLS, owner checks, revisions, receipts, and private custody function remain in place. A linked editor can edit their own Item and link their own PRIVATE LOCAL_ONLY metadata. The current normal Manual Item edit and document-link guards remain object-owner-only. This candidate does not add V3 P5 NEW, a P2 title command, or a new read epoch enrollment mechanism. Standard trips must already have their canonical read-state row and any required Person binding.

## Root2 inputs

- `FORWARD.sql` and `ROLLBACK.sql` are exact DEV frames. The current `CATALOG.json` records full SHA256 pre/post definitions, OIDs, owners and ACLs for both changed functions and the five pinned dependencies. Any mismatch aborts the transaction. No change to the six already installed stage-one files or their existing objects other than the two explicitly replaced predicates. No grants, new routines, tables, policy writes or data rollback.
- Execute only against the independently verified original DEV target with normal protected Writer and positive authorization. Before enabling the matching software, independently compare every catalog row to the expected postimage. Smoke using ordinary linked Owner and linked editor on synthetic standard trips with existing Core read state. Exercise own Item edit, metadata and association, scoped receipt lookup, exact replay, revision conflict and cross-object denial.
- On rollback, remove the software wiring and apply the exact inverse under Root2. Preserve accepted Items, Documents, edges and receipts. A rollback restores the prior access limits for Trips lacking the rollout receipt.

## Local qualification

The network-isolated PostgreSQL fixture uses the actual deployed scope definitions and unchanged deployed write trigger with a minimal schema. It exercises an Owner and linked editor without QA policy or historical creation receipt, each editing their own Item, writing PRIVATE LOCAL_ONLY metadata, persisting a receipt row and linking their own Document. Cross-Trip, anonymous, revoked and foreign-Item writes are rejected in the relevant owning checks. The exact rendered forward and inverse function bodies were checked by PostgreSQL definition hash. The fixture substitutes unrelated aggregate/Guest dependencies; the focused TypeScript suites exercise the real canonical mutation, receipt/revision logic and read ports. Hosted and Native readback remain Root2/Lane acceptance.
