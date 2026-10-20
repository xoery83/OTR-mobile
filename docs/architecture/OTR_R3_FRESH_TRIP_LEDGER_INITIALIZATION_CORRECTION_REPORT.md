# R3 Fresh-Trip Ledger Initialization — Forward Correction Report

## Final Owner Acceptance PASS — 2026-10-08

Owner explicitly accepted the R3 Hosted DEV rebuild, committed forward Ledger
initialization and bounded seed/smoke: 36 Hosted checks, lineage/catalog/function,
historical68/Auth/Storage preservation, Backend health, synthetic financial/receipt
fixtures, Account isolation and CLOSED gates PASS; provider calls zero.

This acceptance supersedes earlier approval-required and stopped-stage status
statements below, which remain intact as historical evidence. Rebuild and forward
transactions each committed once; no rerun is authorized. No Hosted operation was
performed for this documentation closure. Old device outboxes remain quarantined;
device first-sync/re-enable is a separate unaccepted gate. No replay, wipe, reset,
logout or Account rebinding.

Current main is `c2f1524aa492ecf32982de6a52c7166bf45715e0`, incorporating accepted
P4a/C4a. R3 SQL origin/rebuild canonical/forward-base provenance remains unchanged.
See [closure proposal](OTR_R3_DOCUMENTATION_CLOSURE_PROPOSAL.md) and
[installed forward record](../../supabase/dev-forward/r3-v1/README.md).
Documentation is ready for scoped commit review; no commit/push has occurred.

STOP — R3 DOCUMENTATION CLOSURE / OWNER REVIEW REQUIRED.

## Hosted forward committed — verification PASS / seed stopped at missing Profiles

2026-10-08T13:51:06.397344+13:00. Owner authorized resumption through the verified existing
Supabase CLI mechanism. Immediate read-only prechecks passed. Executed the exact
approved forward transaction **once**, CLI exit0, with an exclusive local attempt
marker. No retry, repair or original destructive cutover rerun.

- DEV: `tuqigdxrvrerfewsxqgm`.
- Forward SQL SHA-256: `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`.
- Resulting OTR catalog: `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
- New function definition: `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
- Post-commit read-only PASS: function owner postgres, original EXECUTE ACL,
  SECURITY DEFINER and `search_path=public`, FORCE RLS, restricted roles and
  protected boundaries, parent R3 lineage and historical68 full-row hash unchanged.
- Across the forward transaction, Auth users/sessions and Storage object/bucket
  hashes remained unchanged. Managed inventories and all CLOSED gates PASS.

### Bounded seed actual result — STOP, not acceptance PASS

Existing DEV Backend health passed; the first approved synthetic Account signed
in with its existing credentials. The first ordinary authenticated
`POST /rest/v1/trips` for Trip `b3a30000-0000-4000-8000-000000000001` returned
**HTTP409 / PostgreSQL23503**. Stopped immediately; no retry or privileged bypass.
The HTTP error code was retained; the original response's exact constraint-name
field was not retained. Subsequent read-only evidence confirms both approved
Accounts lack `public.profiles` rows (total profiles0); `trips_created_by_fkey`
requires `created_by` to reference a Profile. Journey-member user and Ledger
settings attribution also reference Profiles. The prerequisite is missing before
fresh-Trip initialization can be accepted through the Hosted creation contract.

Current verified data: **Trips0, members0, Ledger settings0, Expenses0,
receipts0, provider calls0**. Auth users12; sessions592 (one approved synthetic
sign-in added a session; prior591 sessions' full-row hash remains unchanged).
Storage objects42 and bucket/object hashes unchanged. First Trip failed atomically;
no business fixture remains. Backend HTTPS health after the stop is development/ok.

Hosted positive Trip/Member/Ledger/Receipt/Storage and cross-Account smoke tests
were **not reached**. Local correction tests remain valid, but do not substitute
for Hosted seed acceptance. Final read-only catalog/security/CLOSED checks still
PASS. A multi-SELECT diagnostic wrapper initially assumed multiple result sets;
the CLI returns only its last SELECT. Saved diagnostic data was read and the
unchanged read-only state query was run separately. No database repair occurred.

### Minimum next decision

Separately authorize ordinary self-Profile initialization for just the two
approved synthetic Accounts through existing authenticated RLS-bound contracts,
then resume the same bounded seed. The retained ordinary policy is
`Users can insert their own profile`, WITH CHECK `id = auth.uid()`; no privilege
escalation, financial-table bypass or new SQL/schema is proposed. No Profile was
created during this stopped run. Do not rerun the now-committed forward SQL.

Actual evidence is retained in `/private/tmp/otr-r3-forward-execution-20261008`:
`hosted-pre-state.json`, `hosted-forward-attempt.json`, `hosted-forward-response.json`,
`hosted-post-state.json`, `seed-progress.json`, `final-database-state.json`,
`final-diagnosis.json`, `final-backend-health.json`, `execution-final-state.json`.
Old R3 worktree and private backup artifacts untouched. Old device outboxes remain
quarantined; no replay, wipe, logout or Account rebinding. No Production, provider
call/activation, new credential, deployment, commit/push or cloud upload.

STOP — R3 HOSTED DEV FORWARD CORRECTION / FINAL OWNER ACCEPTANCE REQUIRED.

## Operator access recovery — PASS / read-only checkpoint complete

2026-10-08T13:35:45.984035+13:00. The previously successful Supabase CLI2.117.0 mechanism
remains accessible in the current Codex environment. Reused the installed CLI's
existing Management API authentication resolver, explicit DEV project ref
`tuqigdxrvrerfewsxqgm`, and the previously approved nonsecret DB-password placeholder
that avoids temporary PostgreSQL-login initialization. No credential value was
retrieved into our helper, printed, copied, exported or exposed. No login, token
rotation, role creation, permission change or alternate privileged path.

The prior Python helper's manual generic-password lookups returned item-not-found
for its assumed `default` and `access-token` references. The native CLI nonetheless
resolved existing authentication and completed the approved READ ONLY/ROLLBACK
query successfully (exit0). Those failed manual lookups do not establish that the
CLI's existing credential is missing or expired; no credential recovery/reset is
required from Owner. The exact private entry value was deliberately not inspected.

Read-only results, against the explicit approved DEV target:

- Existing R3 lineage is unchanged, including installed timestamp, artifact-origin
  source commit and original baseline SHA.
- Original full OTR catalog/role/security verifier PASS:
  `59757774873268ad85c4ea5a5c23a4af37b19c38c96fb964d6d75c850d3d9b47`.
- Original function hash PASS:
  `6aff434d161f063678984d1f7df712c9706e52bf81d79be1ac71b0baae8ba746`.
- History68/tail `20261004000300` and full history hash unchanged.
- CLOSED gates and protected boundaries PASS; provider calls0.
- Database postgres / operator postgres / transaction_read_only on.
- Trips0, Ledger settings0. No Backend operation or seed attempt.

**Forward SQL executions: 0. Seed requests: 0.** New Owner checkpoint expressly
prohibits either operation here. Evidence:
`/private/tmp/otr-r3-forward-execution-20261008/access-recovery-state.json` and
`access-recovery-read-only-result.json`. The forward apply-attempt marker remains
absent. Prior private backups, old execution worktree and old outbox quarantine
remain untouched. No Production, Hosted mutation, provider, deployment, commit,
push or cloud upload.

STOP — R3 OPERATOR ACCESS RECOVERY / OWNER REVIEW REQUIRED.

## Latest Hosted forward attempt — stopped before any request

2026-10-08T13:32:26.215501+13:00. Owner approved the exact forward SQL and later bounded
ordinary-contract seed. **Forward transactions submitted: 0. Seed requests: 0.
Hosted identity/catalog/lineage/CLOSED verification: not run.**

The first permission review timed out before the process started. One permitted
retry exited during discovery of the existing Supabase operator credential:
`BLOCKED: existing Supabase operator credential unavailable; no credential created`.
No request reached DEV; no SQL, schema, Auth, Storage, seed or Backend operation
occurred. No alternate access path, repair, new credential, deployment, provider,
Production, commit or push.

Local forward SHA-256 reconfirmed: `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`. Expected post-catalog remains
`c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
No apply-attempt marker exists. Evidence:
`/private/tmp/otr-r3-forward-execution-20261008/stopped-state.json`.

Last accepted Hosted state: R3 committed, Backend healthy, two synthetic Auth
Accounts, empty Trips/Ledger/receipts. This is prior evidence, not freshly verified.
Old outboxes remain quarantined; no replay, wipe, logout or rebind. Restore access
to the existing operator credential before resuming approved read-only prechecks.
No cloud report update, per Owner.

Automatic review rejected writing the old R3 execution-worktree report because
of the earlier no-modification restriction. That operation did not run. This copy
of the execution report records the current stop in the isolated correction
worktree; the original report/source/private backups remain unchanged.

STOP — R3 HOSTED DEV FORWARD CORRECTION / FINAL OWNER ACCEPTANCE REQUIRED.

## Latest result — local validation PASS, Hosted approval required

2026-10-08, Pacific/Auckland. Owner approved local implementation of the minimal
existing-function correction. Implemented in the isolated current-main worktree
at `4f97bb6f96daaab7f96f19d192683f63846a413b`; no commit or push.

- Forward version: `otr-r3-dev-v1-ledger-init-1`.
- Exact SQL: `supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql`.
- **Transaction file SHA-256: `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`**.
- Only `public.add_trip_creator_as_journey_member()` is replaced. Its original
  linked owner/member logic remains; eight added SQL lines initialize the unique
  settings row with NZD / ISO scale 2 / REFERENCE_RATE and owner attribution.
  `ON CONFLICT DO NOTHING` preserves existing settings. No protected-table seed,
  Stage9 import, service-role initialization bypass or lazy read-path write.
- postgres ownership, SECURITY DEFINER, `search_path=public`, postgres-only EXECUTE
  ACL, table RLS/FORCE RLS and restricted roles are preserved. No new endpoint,
  role, scheduler, table, trigger identity or unrelated function.
- Versioned lineage is recorded only by a comment on the approved function.
  The original R3 lineage row, source provenance, frozen SQL and Server1–84 remain
  unchanged. The transaction checks parent lineage, original OTR function hash and
  FORCE RLS before replacement; drift aborts and a second application is rejected.
  No platform-managed function hash pin is introduced.

## Actual validation

| Check                                                                                              | Actual result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two fresh PostgreSQL17 installs, network none                                                      | PASS; exact starting frozen R3 catalog on each                                                                                                        |
| Fresh/repeated initialization, nondefault settings, rollback, cross-Account and owner/member logic | 29 SQL assertions PASS on each; FORCE RLS enabled throughout                                                                                          |
| Existing owner currency contract                                                                   | PASS; EUR configured through existing preview/commit RPC, preserved byte-for-byte by repeated initialization                                          |
| CLOSED boundaries                                                                                  | 24 assertions PASS on each; unchanged role/security verifier PASS with only reviewed new OTR catalog hash                                             |
| Catalog/schema scope                                                                               | Exactly one OTR function definition changes; owner/ACL/search_path unchanged; only approved function lineage comment added                            |
| Auth/Storage/managed preservation                                                                  | Full local managed schema dumps and fixture data unchanged across correction; historical68 full rows and parent lineage unchanged                     |
| Existing authenticated Trip contract                                                               | Real local PostgREST `POST /rest/v1/trips`, authenticated JWT, owner-bound RLS: 201; no invented Backend POST /trips                                  |
| Authorized Ledger bootstrap                                                                        | Real existing Backend handler/gateway + local PostgREST/SQL: owner 200, foreign Account 403, invalid identity 401; protected direct settings REST 403 |
| Focused regressions                                                                                | 2 existing Backend suites /78 tests PASS; outbound network denied                                                                                     |
| Typecheck, lint/UI guard, Backend build, whitespace                                                | PASS                                                                                                                                                  |
| Historical source inputs                                                                           | 89 files match accepted b6 bytes exactly: Server1–84 and SQLite migration inputs                                                                      |

Bootstrap integration uses a fixture Auth identity seam; real authorization and
Ledger queries execute through unchanged Backend code and PostgREST against the
local database. This is not live Hosted/Auth API acceptance. Managed preservation
uses disposable schema and synthetic data, not Production or old DEV business data.

Both installs yield OTR catalog SHA-256
`c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906` and changed function
definition SHA-256 `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
Frozen original catalog remains `59757774873268ad85c4ea5a5c23a4af37b19c38c96fb964d6d75c850d3d9b47`.

Runnable checks: `scripts/supabase/test-r3-ledger-initialization.py` (requires two
new empty task-owned network-none containers) and
`scripts/supabase/test-r3-ledger-bootstrap.ts` (requires the corrected local DB and
PostgREST; use the existing network-denial preload). Evidence:
`supabase/dev-forward/r3-v1/local-validation.json` and `local-bootstrap-validation.json`.
Test setup issues involving platform-schema restore, CR text normalization and
replay-table defaults were corrected before the final two clean runs; no frozen
SQL or protected production contract was changed to accommodate a test.

## Separate Hosted rollout requirements

The forward SQL has **not** been applied to Hosted DEV. A new explicit Owner
approval must bind DEV `tuqigdxrvrerfewsxqgm`, the exact forward transaction SHA,
parent R3 lineage/original catalog and expected post-correction catalog above.
Perform read-only identity/catalog/history/CLOSED prechecks before that bounded
transaction. Reconfirm managed preservation and CLOSED gates afterward; stop on
unexpected drift rather than repair or rerun SQL. No Backend source rebuild or
deployment is needed for this database-only correction.

Later seed approval must explicitly cover the existing authenticated PostgREST
Trip-creation contract; Backend `POST /trips` remains unimplemented. Settings are
created by the ordinary trigger, never a direct protected INSERT. Use stable Trip
IDs and reconcile authorized existing rows after an ambiguous response; settings
initialization is idempotent, while duplicate ordinary Trip INSERT reports a conflict.
No existing Trip backfill or old Ledger migration is included.

Last accepted Hosted state remains unchanged and was not queried in this task:
R3 committed, existing DEV Backend healthy, two synthetic Auth Accounts, empty
Trips/Ledger/receipts. Old device outboxes stay quarantined. Existing R3 execution
worktree and private backups/seed data untouched; no Production, provider call,
credential change, destructive cutover, Hosted schema execution or deployment.

STOP — R3 LEDGER INITIALIZATION FORWARD CORRECTION / HOSTED OWNER APPROVAL REQUIRED.

## Archived initial proposal — superseded by local implementation above

Date: 2026-10-08, Pacific/Auckland. **STOP: database change required; proposal only.**

## Outcome and scope

The missing initialization belongs to normal Trip creation. Owner instruction 8 requires stopping before applying a database function/migration change. No executable migration, application correction, SQL execution, Hosted access or seed mutation occurred. This report contains the exact proposed function replacement for review, not an approved rollout artifact.

Isolated worktree: `/Users/xoery/.codex/worktrees/r3-fresh-trip-ledger-init/otr-mobile-canonical`. Local main, origin/main and remote main were verified at `4f97bb6f96daaab7f96f19d192683f63846a413b`. The committed R3 source remains `b6daffecedab1616b173fde3f5e2de5d54770eff`. Existing R3 execution worktree and private backup/seed artifacts were left untouched. No commit or push.

## Trace and initialization boundary

- `src/data/repositories/tripRepository.ts` has read stubs only. `docs/API_CONTRACT.md` marks `POST /trips` NEEDS_CHANGE. There is no implemented Backend Trip creation endpoint to extend.
- The existing database creation contract is an authenticated `public.trips` insertion with RLS requiring `created_by = auth.uid()`. AFTER INSERT triggers create legacy owner membership and linked owner Journey membership. None creates `ledger_settings`.
- `backend/src/supabaseGateway.ts`, `readLedgerBootstrap`, requires a settings row via `.single()` before returning a bootstrap. Missing settings raises `Supabase Dev settings read failed.` Existing owner currency preview/commit contracts also require the row; neither initializes it.
- `ledger_settings.journey_id` is already the primary key and Trip foreign key. The protected table uses FORCE RLS. The legacy Stage9 import initializer is unsuitable and excluded.

Extend existing OTR-owned `public.add_trip_creator_as_journey_member()` at the same Trip transaction boundary. Its existing SECURITY DEFINER owner is postgres; the frozen R3 function ACL permits only postgres execution. Keep that owner, ACL, search_path and existing member logic. No new role, privilege, function identity, trigger, table, endpoint or queue. Do not repurpose restricted OTR domain roles or use a service-role application INSERT. Effective insert authority under FORCE RLS must be verified in disposable installs after approval.

Lazy initialization would add writes to a read-authorized Ledger bootstrap and require new owner/transaction authority plumbing. Atomic Trip creation is the smaller normal boundary and introduces no mobile network requirement.

## Exact minimal database proposal — not applied

Replace only this existing function body in a separately reviewed forward migration. Preserve ownership and ACL; no GRANT statement or historical migration edit is proposed.

```sql
CREATE OR REPLACE FUNCTION public.add_trip_creator_as_journey_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  creator_name text;
  creator_avatar text;
begin
  select display_name, avatar_url
    into creator_name, creator_avatar
  from public.profiles
  where id = new.created_by;

  insert into public.journey_members (
    trip_id,
    user_id,
    display_name,
    avatar_url,
    role,
    status,
    linked_at
  )
  values (
    new.id,
    new.created_by,
    coalesce(creator_name, 'Owner'),
    creator_avatar,
    'owner',
    'linked',
    now()
  )
  on conflict (trip_id, user_id) do nothing;

  insert into public.ledger_settings (
    journey_id, settlement_currency, settlement_scale, valuation_policy, updated_by
  )
  values (
    new.id, 'NZD', public.ledger_currency_scale('NZD'), 'REFERENCE_RATE', new.created_by
  )
  on conflict (journey_id) do nothing;

  return new;
end;
$function$;
```

NZD, scale 2 and REFERENCE_RATE match the existing Ledger bootstrap defaults; `ledger_currency_scale('NZD')` reuses ISO scale validation. `trips` has no currency column. This initializes a fresh owned Trip only, without copying legacy Ledger data or deriving financial currency from Account display preferences. Existing owner-authorized currency commands remain authoritative. Column defaults retain revision 1 and stale-after 72 hours. Initialization does not fetch FX or call providers.

`ON CONFLICT (journey_id) DO NOTHING` preserves every existing setting, revision and timestamp. The Trip primary key and settings primary key enforce same-Trip uniqueness. All trigger writes roll back with failed Trip creation. A retry must reuse the same Trip ID and reconcile an existing Trip through its normal authorized read; this proposal does not add idempotency to a nonexistent Backend Trip command. It neither backfills existing Trips nor changes existing device data.

## Actual local validation

- Existing focused Backend suites: **2 files, 78 tests PASS**, with outbound network denied.
- **Typecheck, lint, UI guard and Backend build PASS**. UI guard examined 79 representative files; no UI changes.
- **89 migration source files PASS exact-byte comparison** against accepted b6 source: Server1–84 and five SQLite migration source files (including SQLite1–50 definitions).
- Relevant Backend application/gateway and dependency inputs are unchanged from b6. Current main has accepted local database-connection changes; migration inputs remain unchanged.
- Frozen R3 baseline, cleanup and verifier SHA-256 independently matched retained values: `f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52`, `5e643ea1597914f7adcdaeff86134a0a02357c4569efd42d3c4c1fa4dc90a170`, `45444aba16ef6ae7c26f9a06799244be0a103a7fb20dfa964a24fafdedcc6561`.
- CLOSED gates, schema and role definitions are preserved by unchanged source/artifact bytes. No live gate verification, SQL rehearsal or corrected initialization test is claimed. The proposed function has not been compiled or exercised.

## Required validation after separate approval

Use two clean disposable R3 installs. Test ordinary authenticated owner Trip creation produces both memberships and exactly one settings row; transaction failure leaves no partial rows; stable-ID retry/concurrency produces no duplicates; existing nondefault settings remain unchanged; anonymous and forged cross-Account creation fail; unrelated Trip Ledger access fails. Exercise unchanged owner currency authorization, Ledger bootstrap, same-currency expense/immutable audit and receipt/storage contracts. Check effective trigger authority under FORCE RLS, exact role/ACL preservation, and all CLOSED gates. Only the reviewed function definition may differ in the catalog.

## Hosted rollout requirements and exact environment state

Owner must first approve this database-function proposal for local implementation and rehearsal. A later, separate Hosted approval must cover the new forward migration, its lineage and revised catalog/hash expectations. Do not edit the frozen `otr-r3-dev-v1` baseline or its historical Server1–68 records, rewrite Server1–84 bytes, repair history, or rerun the approved destructive transaction `c65d5c2c5b0b21eb22f82da96654c0254714496f5535fd23cb22b8f4062878c2`. The existing internal function definition is the only intended catalog change; its current frozen definition hash is `6aff434d161f063678984d1f7df712c9706e52bf81d79be1ac71b0baae8ba746`. No platform-managed hash pin is introduced.

A reviewed acceptance-seed procedure also needs to acknowledge that Backend `POST /trips` is not implemented. The existing authenticated database Trip-creation contract could be explicitly approved for bounded fixtures; a new Backend command is outside this minimum proposal. Do not silently bypass or broaden the approved seed contracts.

Last accepted Owner state, **not freshly queried in this task**: DEV `tuqigdxrvrerfewsxqgm` has committed R3 with database verification PASS; existing Backend RUNNING HEALTHY; two synthetic Auth Accounts exist; Trips, Ledger and receipts are empty. This task leaves that state untouched. Old device outboxes remain quarantined; no replay, wipe, reset or rebind is authorized. No Production, provider, credential or deployment action occurred.

STOP — FRESH-TRIP LEDGER INITIALIZATION CORRECTION / OWNER REVIEW REQUIRED.
