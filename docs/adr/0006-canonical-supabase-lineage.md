# ADR 0006: Canonical Supabase Lineage

- Status: Accepted
- Date: 2026-09-10

## Context

The legacy OTR repository contains 76 migrations with duplicate versions,
out-of-order changes, production drift, and historical policy replacements.
Replaying that history is not a deterministic or sufficiently secure way to
create Dev and Staging environments.

A read-only production audit established the approved starting shape as 64
public application tables and 910 public columns. Production metadata, not
production row data, is the source for this one-time shape snapshot.

## Decision

Dev and Staging start a new migration lineage:

1. `20260910000100_canonical_production_baseline.sql` creates the verified
   production-shape schema in dependency-safe order.
2. `20260910000200_canonical_security_hardening.sql` records the approved
   security corrections separately for auditability.
3. The 76 legacy migrations are neither copied, replayed, nor renumbered.
4. All future schema work is expressed as forward migrations after this pair.
5. `memory_entries.parent_memory_id` and `ai_jobs.current_step` remain deferred
   and require separately approved forward migrations.
6. Production is not retargeted to this lineage. Any future production adoption
   needs its own reviewed reconciliation plan.

## Security Decisions

- A trigger blocks ordinary users from changing `profiles.account_role`.
- Every `SECURITY DEFINER` function loses default `PUBLIC` and `anon` execute;
  only approved authenticated and service paths are granted.
- Global parser and all Capture configuration writes are system-admin only.
- Live Location requires an active linked owner or group member.
- Memory Artifact mutation remains author/owner scoped.
- `trip_members` reads and `memory_entries` deletes remain RPC based.
- `daily_reports` receives no user-facing policy.
- Users may delete their own itinerary ratings.
- Face and face-embedding writes are backend/service controlled.

## Consequences

The new lineage is short, deterministic, and testable, but it intentionally
does not preserve the legacy migration ledger. Schema checksums and RLS matrix
tests are required before any new forward migration is accepted.
