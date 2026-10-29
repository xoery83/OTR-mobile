# P6 additive after P5

Use install.sql only after exact P5 deployment and fresh read-only catalog preflight. CAS checks four expected P5 definitions plus unchanged P5 service-statement witness, replacing four functions only. Old independent P6 packet correctly rejects P5 baseline.

Apply BACKEND_COMBINED_PROFILE.patch to source a89dd0a5772a20e7650b71fab5742954a5d076e7 or compatible descendant and deploy combined parser before P6 SQL. Existing profiles remain intact; PgStorage family/command/Creator fences need no changes.

Rollback returns precisely to P5, leaves its five CHECK changes and statement guard untouched, retains accepted facts, and closes future P6 writes.

56 directed tests, full typecheck, eslint, Backend build, apply-check and real network-none PostgreSQL coexistence/negative/rollback matrix passed. No DEV/shared-tree writes or Native Cloud L3 by this child. No rights beyond approved P5/P6 functional union.
