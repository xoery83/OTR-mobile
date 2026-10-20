# CP-LLM-02A-R1 — Protected one-attempt admission proposal

2026-10-12 (Pacific/Auckland). **PROPOSED / SEPARATE MIGRATION APPROVAL REQUIRED.**

This is an exact schema and root-change proposal, not an applied migration or
verified implementation. No SQL in this document has been executed. Owner R1
approval authorizes preparing this proposal; its migration discipline requires a
second approval before applying it, including to a disposable PostgreSQL fixture.

## Source and allocation

Canonical main remains `741579c8bac3f898669ca331875a28efc645cfa2`. All seven
CP14/CP15 fingerprints in `CP_LLM_02A_SOURCE_FINGERPRINTS.json` still match.
Reuse isolated `codex/cp-llm-02a-closed`; no source drift in the affected paths.
W1–W5 at `ad8ca0ce35abbd743735a53f6b75bd30ec79bfdd` has uncommitted
`20261011000100_trip_core_v2_foundation.sql`,
`20261011000200_trip_core_v2_version_dispatch.sql` and SQLite54 work.
Core multi-output at `f622d24c8a4563f0a0d30b84d89b85b5dc416e1c` has a dirty
`tripCoreV2Source.test.ts`. Those branches and canonical dirty docs are preserved.

Canonical has SQLite1–53/server1–84. If W1–W5 lands first, this proposal would
follow its two Server files; that is conditional, not a reserved Server number.
The proposed file is one new forward migration with its timestamp allocated at
integration. No historical migration changes, SQLite migration, backfill, runtime
configuration, grant activation, environment kill change or accounting table.

## Exact new relation

One immutable admission record associates a logical Task with its only paid call.
It stores authorization ceilings, not consumption or billed amounts. Holds and
usage remain exclusively in existing Server83/84 tables.

Proposed DDL (part of the future single migration):

```sql
create table public.model_task_admissions (
  account_id uuid not null,
  integration_id text not null,
  task_id uuid not null,
  logical_request_id uuid not null,
  logical_idempotency_key uuid not null,
  contract_version text not null check (contract_version='otr-model-task-v1'),
  request_snapshot jsonb not null check (
    jsonb_typeof(request_snapshot)='object'
    and octet_length(request_snapshot::text) between 1 and 16384
  ),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  profile_snapshot jsonb not null check (
    jsonb_typeof(profile_snapshot)='object'
    and octet_length(profile_snapshot::text) between 1 and 4096
  ),
  profile_sha256 text not null check (profile_sha256 ~ '^[a-f0-9]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  max_cost_nanos numeric(60,0) not null check (
    max_cost_nanos > 0
    and max_cost_nanos::text not in ('NaN','Infinity','-Infinity')
  ),
  deadline timestamptz not null check (isfinite(deadline)),
  call_id uuid not null references public.external_integration_calls(call_id)
    on delete restrict,
  created_at timestamptz not null check (isfinite(created_at)),
  primary key (account_id,integration_id,task_id),
  unique (account_id,integration_id,logical_request_id),
  unique (account_id,integration_id,logical_idempotency_key),
  unique (call_id)
);
alter table public.model_task_admissions owner to postgres;
alter table public.model_task_admissions enable row level security;
alter table public.model_task_admissions force row level security;
revoke all on public.model_task_admissions from public,anon,authenticated,
  service_role,authenticator,otr_external_integration_admin_gateway,
  otr_external_integration_call_gateway,otr_external_integration_inbound_gateway,
  otr_external_integration_recovery_gateway,otr_external_integration_reporting_gateway;
grant select,insert on public.model_task_admissions
  to otr_external_integration_meter_writer;
create policy model_task_meter_read on public.model_task_admissions
  for select to otr_external_integration_meter_writer using (true);
create policy model_task_meter_insert on public.model_task_admissions
  for insert to otr_external_integration_meter_writer with check (true);
```

The migration must also install `cp_llm_guard_model_task_admissions()` and BEFORE
INSERT/UPDATE/DELETE plus BEFORE TRUNCATE triggers. Exact guard rules: reject every
UPDATE/DELETE/TRUNCATE; INSERT is allowed only when session_user is
`otr_external_integration_call_gateway` and current_user is
`otr_external_integration_meter_writer`. Reject INSERT unless referenced call has
identical Account/integration/task, environment DEV, task_class FLIGHT_IMPORT_V1,
call_kind OUTBOUND_MODEL, attempt_sequence=1 and shadow=false; its START and
Flight hold must already exist. Recompute both snapshot hashes; validate the
registered profile, request grammar and redundant projected columns described
below. All helper functions revoke PUBLIC/anon/authenticated/service_role/
authenticator execution; only the meter writer may execute them. No reader grants
on private snapshots: authorized recovery continues through existing owning seams.

Admission records never expire or disappear at deadline, cancellation, terminal
completion, usage reconciliation, day rollover or scope rotation. No cascade or
cleanup releases Task identity. Logical IDs cannot be reused for another Task
within the same Account/integration. Accounts/integrations are separate namespaces.

## Exact command extension and digests

Extend `flight_activation_reserve_call`'s strict command grammar with one required
`model_task_binding` object with exactly these keys:

```text
version: 1
request: ModelTaskRequest projection
request_sha256: lowercase SHA256
profile: RegisteredConsumerProfile projection
profile_sha256: lowercase SHA256
```

`request` has exactly contract_version, task_id, logical_request_id,
logical_idempotency_key, consumer_id, consumer_version, input, schema,
policy_snapshot, policy_sha256. Input is a private UUID reference, SHA256 and
positive byte_count bounded by existing custody (4,194,304). Schema contains id,
version,dialect,sha256; registered-only, no caller JSON Schema or validators.
Use existing UUID/label/digest/version grammar; reject null/unknown fields.

The policy is existing Task policy v1: version/privacy/network_required/region/
budget_currency/budget_nanos/route/max_attempts/deadline. For this paid path require
REMOTE_ALLOWED, network_required=true, max_attempts=1, positive bounded decimal
budget_nanos, currency and finite deadline. Region must equal the selected immutable provider configuration's data_region,
route its routing_class; provider privacy_policy must be REMOTE_ALLOWED and its
modalities/capabilities/schema_contracts must admit this registered profile.
The installed owning Flight profile must agree with these executing facts. The
binding alone never grants authority.

The first profile is a fixed registered Flight Interpretation projection with
consumer identity/version and prompt/envelope/output-schema/minimizer/privacy
version/digest pins plus permitted TEXT modality, capability and execution scope.
Compare each executing pin to the existing CP15 scope and compiled Flight profile;
no arbitrary registration, executable validation or caller-selected provider.
The proposed registered profile has exactly: version=1, consumer_id="import",
consumer_version=1, boundary_version="otr-flight-remote-v2", capability="EXTRACT",
modality="TEXT", execution_scope="FLIGHT_IMPORT_V1", prompt_sha256,
envelope_version="FLIGHT_REMOTE_TEXT_V1", envelope_sha256,
output_schema_version="FLIGHT_REMOTE_OUTPUT_V1", output_schema_sha256,
minimizer_version="OTR_FLIGHT_WHITELIST_UTF8_V1", minimizer_sha256,
privacy_profile="REMOTE_ALLOWED_MINIMIZED_TEXT_V1", privacy_sha256.
Hashes are the existing compiled CP15 hashes from remoteFlightText.ts: prompt
UTF8 bytes, envelope-version UTF8 bytes, the exact existing structural-schema
fingerprint, minimizer-version UTF8 bytes and privacy-profile UTF8 bytes.
No price/config/policy/call identity enters the profile hash. Freeze this exact
serialization in cross-language vectors during approved implementation; its hash
is not an arbitrary label accepted from the caller. Historical Task schema identity and CP15 structural output schema
identity are mapped explicitly by that profile, not equated by field name.

Hash domains remain distinct:

- request_sha256 in the new binding is SHA256 of existing canonical JSON bytes of
  the complete neutral request projection; SQL uses `cp14_hash(request)`.
- profile_sha256 is `cp14_hash(profile)` for the immutable registered projection.
- policy_sha256 is `cp14_hash(request.policy_snapshot)` and must equal the request
  policy pin and existing execution-pins policy digest.
- outer command request_sha256 is the unchanged Server83 command digest over the
  entire command, now including the binding. No stripping fields or re-signing.
- Existing call/request/input/envelope/interpretation/private-byte digest meanings
  remain unchanged. The neutral input pin binds retained prepared-package bytes;
  trusted host verifies custody and digest before reservation. SQL does not pretend
  a digest establishes possession of private bytes.

Request task_id must equal row.task_id. Account/integration come exclusively from
verified context and row, never from a caller identity assertion in request JSON.
Store the complete request/profile snapshots, digest projections, ceiling/deadline
and existing call ID. Attempt/request/key stay on the immutable existing call.

## Reserve root replacement (same signature, new forward definition)

Replace only `flight_activation_reserve_call(jsonb,jsonb)` and
`external_integration_mark_dispatch(jsonb,jsonb)` in the new migration. Keep their
existing owner, SECURITY DEFINER/search_path, finite context allowlists and grants.
Do not rename/export a legacy reserve root which bypasses binding.

Reservation order is normative:

1. Validate the extended bounded grammar, versions, hashes, registered profile and
   policy. Run original `cp14_context` on the complete command; acquire existing
   environment/integration lock. Preserve original row/context equality checks.
2. Acquire existing Trip authority locks and check current Trip access before
   returning any call, including replay. Check current nonrevoked Account grant
   for that integration and retained scope identity; deny foreign Account/Trip.
   Never expose private snapshots in error text.
3. Look up `(verified Account,integration,request.task_id)` in the immutable new
   relation. If present, compare both full snapshots/digests and every retained
   call identity and original admission command digest. Any new call, Attempt,
   request or key fails `MODEL_TASK_ALREADY_ADMITTED`; changed body/profile/policy
   fails `MODEL_TASK_CHANGED_BINDING`. Never silently return an original call for
   a mismatching caller. Exact identical replay returns the original call's current
   disposition, without INSERT, START, new hold, send or retry. This metadata replay
   need not reopen an expired deadline or rotated execution scope. Current
   authorization/grant remains required; mark retains stricter current checks.
4. If no binding exists, reject if any historical paid Flight call exists for the
   same Account/integration/task, regardless of terminal/UNKNOWN/attempt sequence,
   with `MODEL_TASK_LEGACY_UNBOUND`. Also reject collision of logical request/key
   with a different Task. No invented migration/backfill of absent historical pins.
5. Require sequence=1/no shadow, unexpired deadline, and every original Server84
   current scope/config/grant/Trip/privacy/price admission predicate. Compute the
   original conservative `worst` hold from original price units. Require currency
   to equal both task currency and scope currency; require worst <= task max AND
   original call/day ceilings. Deadline is checked against server clock again
   immediately before admission. Never replace a task budget with a larger scope
   limit or infer usage/cost zero.
6. Insert the original call, original START, original Flight hold, then the new
   immutable binding, all in the same transaction. The new PK/unique constraints
   and existing scope lock arbitrate independent callers; transaction failure
   rolls back every insertion and request audit binding. No extra journal/ledger.

Fresh identities for a bound Task are denied before a new hold, regardless of
its first call being RESERVED, MAY_HAVE_STARTED, UNKNOWN or TERMINAL. Day rollover
and scope rotation do not affect the lifetime PK. Exact replay differs from resend.

## Mark, cancellation, recovery and historical compatibility

After existing environment/integration and Trip locks, load call and its binding.
Require exact Account/integration/task/call linkage, valid snapshots/profile,
sequence=1 and current server time < retained deadline. Require original durable
START/hold and hold.currency=task.currency, hold.worst_cost_nanos<=task ceiling.
Then preserve ALL existing row revision/fence, runtime kill, current scope/grant/
executing pins/configuration/Trip checks before the existing durable mark.

No binding means mark fails `MODEL_TASK_BINDING_REQUIRED`, including historical
RESERVED calls. Historical MAY_HAVE_STARTED/UNKNOWN/TERMINAL calls remain exactly
recoverable and billable through unchanged recovery/usage/custody paths; no
fabricated binding, outcome rewrite or resend. Historical requests lacking the new
reserve field fail closed. This intentional caller compatibility break must be
accepted with the migration: the currently CLOSED host/fixture loaders must supply
the binding, and old callers cannot dispatch after integration.

Cancellation never deletes binding or implies nonexecution. Existing publication
fence/cancellation/auth-generation checks and protected mark remain authoritative;
Host cancellation races retain current CP15 responsibility semantics. No new
cancellation root or stronger promise to stop a previously marked call. Restart
recovers retained call and binding; pending metering reconciles the same call.

Do not offer rollback by dropping the binding table or restoring unguarded roots:
that reopens the invariant. Recovery from a faulty migration keeps gates CLOSED
and uses a separately reviewed forward correction, preserving admission records.

## Approval and validation plan

Migration approval must cover the new relation/guards and two root replacements,
fail-closed historical behavior, caller changes and frozen profile serialization.
Allocation is rechecked at that time. No activation, Hosted application or Core
change follows from migration approval.

After approval, use the existing pinned network-none CP15 PostgreSQL fixture in a
new task-owned container; never execute existing hardcoded container scripts against
another builder's fixture. Required actual-root tests:

| Case                                                                        | Required durable oracle                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Independent callers, different Attempts, both sequence1                     | One successful reserve, other denied; one call/START/hold/binding                         |
| Concurrent reserve, commit or rollback winner                               | Wait/serialize; loser denied after commit, may admit after full rollback                  |
| TERMINAL or UNKNOWN first call                                              | Fresh identity denied; original binding and hold unchanged                                |
| Exact replay before/after restart and scope rotation                        | Original call returned only with current authorization; row counts and hold sum unchanged |
| Changed request/profile/policy, logical key/body, ceiling/currency/deadline | Rejected; no new audit/call/START/hold/binding                                            |
| Missing/invalid binding or historical same-Task call                        | Reserve/mark denied; historical exact recovery still available                            |
| Deadline expires between reserve and mark                                   | Mark denied; lifetime binding/hold retained                                               |
| Hold above task ceiling, exactly at/beyond daily ceiling                    | New admission fails or succeeds at exact boundary; original day accounting authoritative  |
| Cancellation/fence and Account/Trip/grant loss                              | Mark/disclosure denied by existing boundaries; no released Task identity                  |
| Direct role writes, mutate/delete/truncate, forged association              | Protected/RLS/trigger denial; independent-call invariant survives                         |
| Account or integration differs                                              | Namespace isolation plus authorization; no cross-account recovery                         |

Run existing START/mark/lost-ACK/UNKNOWN, custody, pending-meter and continuation
regressions, plus new pure codec/profile/hash tests, typecheck and Backend build.
No independent-caller/concurrency invariant is certified by the current TS mocks.
Disposable PostgreSQL tests are **NOT RUN** because applying this new migration
requires the separate approval requested by the Owner.

**STOP — CP-LLM-02A-R1 MIGRATION PROPOSAL OWNER REVIEW.** Protected boundary and
original facade/profile/witness implementation remain pending.
