# Trip Canonical A1-I2A-SPEC — Participation Persistence Schema & Compatibility Contract

- Status: **A1-I2A-SPEC COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Branch: `integration/ledger-polish-canonical`.
- Baseline HEAD: `9a37f3571de390c8be1d78c766e538c07fb54907`,
  `docs(trip): define Trip Person participation persistence`.
- Workspace clean before work. Only this specification is added.
- No SQL, migration identifier, application/test/configuration changes, database
  connection, Hosted Dev/Production access, deployment or device build.

DECIDED means supplied approved semantics. PROVISIONAL means an exact recommended
choice awaiting review, not permission to create/apply a migration. UNKNOWN means
unverified evidence. BLOCKED means a stop condition. There is no BLOCKED decision
in this source-based specification. Acceptance PASS means the specification
question is answered; implementation and deployment checks remain unexecuted.

Repository instructions and mandatory foundation documents, A0, A1-D, A1-I1,
A1-I2-P and the glossary are the context. Current-state/A1-I1 historical “no commit
yet” language is superseded by Git: A1-I1 is committed at `3c43572`; the accepted
preflight is HEAD. Historical documents and the current-state handoff remain
unchanged because this task permits only this specification. No legacy Web
checkout was reopened. Public PostgreSQL documentation was consulted for trigger
and privilege behavior; no project environment was accessed.

## A. Executive decision

Recommend the following exact contract, with **PROVISIONAL** adoption status:

| Choice           | Recommendation                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Person authority | Existing `journey_members.id` and `trip_id`; DECIDED                                                                                |
| Server state     | `journey_members.participation_active`, Boolean, non-null, default true                                                             |
| Server version   | `journey_members.participation_revision`, bigint, non-null, default 0, range 0–9,007,199,254,740,991                                |
| Backfill         | Every existing server row true/0; DECIDED ACTIVE policy                                                                             |
| Write owner      | Dedicated future lifecycle command only; invoker trigger protects the two new fields from every existing writer                     |
| Local projection | Existing `ledger_members`; nullable `participation_active` integer and nullable `participation_revision` integer, both default null |
| Wire Member      | Paired additive `isParticipating` Boolean and `participationRevision` safe integer                                                  |
| Domain           | `participation: { isParticipating: boolean; revision: number } \| null`; null is unobserved metadata                                |
| Trip counter     | **NO** additional persisted Trip-level revision; derive a complete Person ID/revision snapshot when I2B needs it                    |
| Receipt/audit    | One dedicated immutable `trip_person_participation_receipts` table in I2C; APPLIED rows also provide transition audit evidence      |
| Next slice       | I2A persistence, protection and passive bootstrap hydration; no lifecycle commands, filtering, UI or remote deployment              |

ACTIVE/INACTIVE are the only business states. A nullable local observation is not
a third state. Participation answers ordinary NEW Trip selection only. Linked
Accounts, inactive Organizers, financial counterparties and historical references
retain their existing meaning and authority. Reactivation preserves the Member ID.
No new Person root, link registry or lifecycle authority table is needed.

## B. Existing write-path inventory

This inventory covers checked-in SQL mutations, seed/tests and TS writers to the
exact `journey_members` table, including multiline client chains. Reads, FKs and
locks are distinguished from writes. It does not certify external writers or
live grants. SQL basenames below resolve under `supabase/migrations/`.

| Current writer                              | Source/effect                                                                                                                                                                   | Future participation / revision behavior                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Creator trigger                             | `20260910000100_canonical_production_baseline.sql`, `add_trip_creator_as_journey_member`, lines 1843–1880: inserts linked owner; conflict does nothing                          | New true/0; existing conflict unchanged                                                                |
| Invite acceptance                           | Same baseline, `accept_journey_invite`, updates matched unlinked/invite_pending row or inserts linked group_member, lines 1960–2028                                             | Same ID on claim; preserve pair on update, true/0 on insert                                            |
| Email auto-claim                            | Same baseline, `claim_email_invited_journeys`, lines 2085–2125: user/name/avatar/status/linked_at and legacy membership                                                         | Preserve pair even if INACTIVE                                                                         |
| Explicit claim                              | Same baseline, `claim_journey_member`, lines 2150–2205: user/status/linked_at and legacy membership                                                                             | Preserve pair; no reactivation or revision advance                                                     |
| Own notes RPC                               | Same baseline, `update_own_journey_member_notes`, lines 2525–2551                                                                                                               | Preserve pair; generic timestamp may change                                                            |
| Owner/admin table writes                    | Same baseline RLS, lines 3178–3201: existing insert/update/delete policies; general Member read RPC is read-only                                                                | Insert true/0; update restores existing pair, including old upsert; old-column access unchanged        |
| Removal RPC / direct delete                 | Same baseline, `remove_journey_member`, lines 2333–2412: old last-owner guard, legacy membership/removed marker/invite effects, physical deletion                               | Deletion remains existing deletion, not deactivation; no lifecycle transition or new FK that blocks it |
| Stage 9 SQL import                          | `20260913000500_ledger_stage_9_import.sql`, lines 69–98: relabels newly trigger-created owner ID, then inserts explicit Member IDs                                              | Preserve pair on owner metadata update; new true/0; no new ID rewrite introduced by this phase         |
| UI Polish SQL fixture                       | `20260914000100_ledger_ui_polish_fixture.sql`, lines 74–106: equivalent fresh-Journey owner relabel/insert                                                                      | Same preservation/default rules                                                                        |
| Local seed                                  | `supabase/seed.sql`, lines 127–157: explicit old columns, conflict does nothing                                                                                                 | New true/0; conflict unchanged; omit lifecycle fields                                                  |
| Hosted validation inserts                   | Scripts listed below; service/admin insertion of linked/unlinked synthetic members                                                                                              | New true/0; explicit lifecycle columns unnecessary                                                     |
| Hosted validation upserts                   | `validate-stage7-2b-hosted.mjs`, `validate-settlement-participation-hosted.mjs`                                                                                                 | Preserve existing pair on conflict regardless of generated insert defaults                             |
| Hosted validation status updates            | `validate-settlement-2-phase-1a-hosted.sql`, `validate-settlement-2-phase-1b-hosted.mjs`, `validate-settlement-2-phase-1c-hosted.ts`, `validate-settlement-2-phase-2-hosted.ts` | Preserve pair when setting status unlinked                                                             |
| pgTAP setup / status/role changes / cleanup | Exact test inventory below: old-column insert/update and physical delete                                                                                                        | New true/0, update preserves, cleanup delete unchanged                                                 |
| Service-role arbitrary table writes         | Same table, not a lifecycle capability simply because RLS is bypassed                                                                                                           | Insert true/0, update preserves through trigger; no lifecycle bypass for service_role                  |
| Future lifecycle command                    | I2C only; current repository has none                                                                                                                                           | Changes Boolean and revision atomically under CAS, receipt and audit requirements                      |

Hosted insert scripts under `scripts/supabase/`:
`validate-settlement-2-phase-1a-hosted.sql`,
`validate-settlement-2-phase-1b-hosted.mjs`,
`validate-settlement-2-phase-1c-hosted.ts`,
`validate-settlement-2-phase-2-hosted.ts`,
`validate-settlement-2-phase-3a-hosted.ts`,
`validate-settlement-2-phase-3b-hosted.ts`,
`validate-settlement-2-phase-4-hosted.ts`,
`validate-settlement-final-versions-hosted.ts`,
`validate-latest-state-rate-acceptance-hosted.ts`,
`validate-expense-consistency-v2-hosted.ts`,
`validate-personal-payment-fx-projections-hosted.mjs`, and the two upsert scripts
above. `validate-stage7-3-hosted.mjs` reads the trigger-created owner; it is not
an additional direct Member writer.

Member-mutating test files under `supabase/tests/`:
`expense_attachment_limit.test.sql`, `expense_attachment_tombstones.test.sql`,
`expense_consistency_v2.test.sql`, `latest_state_rate_acceptance.test.sql`,
`legacy_expense_equivalent_resolution.test.sql`, `ledger4b_mutations.test.sql`,
`ledger4c_conflicts.test.sql`, `ledger7_1_settlements.test.sql`,
`ledger7_2a_payments.test.sql`, `ledger7_2b_adjustments.test.sql`,
`ledger_d_journey_currency.test.sql`, `ledger_economic_date_completion.test.sql`,
`personal_payment_fx_bounded_backfill.test.sql`,
`personal_payment_fx_projections.test.sql`, `review_v2_personal.test.sql`,
`settlement_2_phase_1a_personal_payments.test.sql`,
`settlement_2_phase_3a_human_findings.test.sql`,
`settlement_2_phase_3b_checkpoints.test.sql`,
`settlement_2_phase_4a_corrections.test.sql`.
`settlement_current_source_contract.test.sql` reads Members to construct financial
fixtures; its relevant Member references are not Member mutations.

`backend/src/supabaseGateway.ts` Member chains are SELECTs for admission,
validation, bootstrap, reporting and labels; it has no direct Member lifecycle
write. `backend/src/stage9Import.ts`, `backend/src/uiPolishFixture.ts`,
`scripts/stage9/load-hosted-dev.ts`, `synthetic-dry-run.ts`, and
`scripts/dev/create-ui-polish-journey.ts` use import/fixture machinery above.
`scripts/dev/create-expense-conflict-ui-fixture.ts` reads the trigger-created
Member. `scripts/dev/enable-settlement-test-fixture.ts` validates the fixture
mapping. Stage 9 extractor/synthetic dataset code is not a live Member writer.
Backend test doubles describe reads/fixtures, not independent database writers.

No other direct Member INSERT/UPDATE/UPSERT/DELETE writer was located in the
scoped checked-in source. Current timestamp trigger touches every update.
`journey_members_personal_payment_history_grant` fires on user_id/status updates,
not participation, in `20260922000100_settlement_2_phase_1a_personal_payments.sql`.
Neither trigger is a lifecycle version source.

## C. Exact server field contract

**PROVISIONAL** naming comparison:

| Name                    | Assessment                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `is_participating`      | Concise but sounds like an actual ongoing activity, missing the selection-policy qualification                             |
| `is_active_participant` | Risks conflation with Expense Participant and an “active member” authorization label                                       |
| `participation_active`  | Recommended: explicit independent participation dimension, separate from existing link status, role and invite `is_active` |

`participation_active` is SQL Boolean, NOT NULL, default true. Its column
meaning must explicitly say “eligible for ordinary new Trip participation
selection; not Account linkage, access, role, financial validity or deletion.”
true = ACTIVE; false = INACTIVE. No nullable server business state or string enum.
No additional activity timestamp is required.

Every existing server Person becomes true; new ordinary rows become true.
Backfill never infers from guest/unlinked, trip dates, payment history, removed
Account markers, names or lack of Expenses. Imports/fixtures omit the new fields
and rely on defaults; an explicit true/0 fixture is acceptable but unnecessary.
They cannot import an existing Person's lifecycle through a generic Member upsert.
Future intentional creation as INACTIVE requires a separately approved create
command; current deactivate/reactivate commands do not create Persons.

Claim/link, invite acceptance, notes/profile/role edits and all other Member
updates preserve participation and revision. Their success must not depend on
whether the Person is ACTIVE. Existing role/status constraints remain exactly
owner/group_member/guest and linked/unlinked/invite_pending. No ID/FK rewrite.

## D. Lifecycle revision contract

**PROVISIONAL:** `participation_revision` is bigint, NOT NULL, default **0**, with
inclusive range **0–9,007,199,254,740,991**. The upper bound is JavaScript's exact
integer ceiling, stricter than PostgreSQL bigint, so API/SQLite bindings use
numbers without losing precision. This is a lifecycle ordering token, not an
Expense version, clock, global sequence or business state.

| Alternative                      | Decision                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Lifecycle integer on Member      | Recommended: row-locked CAS, ABA detection, ordering and monotonic reconciliation   |
| Dedicated timestamp              | Reject: equal-time transitions/clock precision and CAS ordering need more machinery |
| Generic updated_at               | Reject: notes/link/role updates already touch it; false lifecycle versions          |
| Separate lifecycle/version table | Reject: existing row is sufficient; extra authority/join without evidence           |

Initial server true/0 means migration baseline, not a fabricated historical
transition. A genuine state change at revision r commits the opposite Boolean
and r+1. Two transitions return to the same Boolean at r+2, detecting ABA.
Only participation changes advance this revision; claim/link/notes/role do not.
No-op with desired state already current and observed revision equal current:
UNCHANGED receipt, same revision, no UPDATE and no transition audit. A stale
observed revision is REVISION_CONFLICT **even if desired state equals current**.
No silent refresh-and-retry; a fresh user intent uses a fresh key.

At the ceiling, a state-changing command fails atomically with
PARTICIPATION_REVISION_EXHAUSTED; never wraps, resets or converts imprecisely.
An exact-revision no-op remains allowed. Invalid/negative/fractional/unsafe
observations are validation errors, not defaults. Local INTEGER and API/domain
number have the same bounded exact representation. No migrations reset revision
following feature disable or subsequent backfills.

## E. Write protection

**PROVISIONAL:** combine a dedicated future transaction RPC, a private command
execution role, and a Member row trigger. Service-layer discipline alone fails
because existing RLS and service-role upserts can write the table. Revoking
only column privileges also fails while table-level UPDATE remains granted.
Replacing all old grants/policies is unnecessary and could break old writers.

Exact behavioral contract for the new **SECURITY INVOKER BEFORE INSERT/UPDATE**
row guard:

- Ordinary INSERT: normalize the new pair to true/0 before constraints. This
  applies to explicit stale/null lifecycle values as well as omitted fields.
- Ordinary UPDATE: restore both fields from OLD before constraints, regardless
  of payload presence/defaults. Do not skip the row or reject an otherwise
  authorized old-column update. Direct table lifecycle writes have no effect.
- ON CONFLICT UPDATE: the UPDATE branch restores OLD even if the INSERT branch
  supplied true/0. Thus upserts cannot reset known false/r>0.
- Dedicated command UPDATE: allow only unchanged pair or state flip with exact
  old revision +1; target ID/trip and every old business column remain unchanged.
  Exclude generic updated_at from that old-column equality check: its existing
  timestamp trigger may touch it. A future deferred integrity check requires matching immutable APPLIED receipt
  evidence in the same transaction. No standalone revision bump.
- No DELETE interception or authorization redefinition. Existing physical
  deletion is not a lifecycle command. UUID reuse after deletion is prohibited
  for future lifecycle flows; preservation is not claimed for an arbitrary
  privileged delete-and-recreate operation.

Proposed role: `otr_trip_person_lifecycle_writer`, NOLOGIN, no superuser,
CREATEROLE, BYPASSRLS or role membership granted to API/ordinary/service roles.
It owns only the future lifecycle SECURITY DEFINER command routine; ordinary
baseline RPC owners are not allow-listed. Guard authority is the actual
`current_user` execution role, **not** a client-settable GUC, JWT role string,
trigger depth or service_role flag. The guard must remain invoker, otherwise
its own owner could make all writes appear privileged.

The role receives only necessary Member SELECT and lifecycle-column UPDATE,
plus dedicated receipt privileges in I2C. Add narrowly role-specific RLS policies
for that internal function execution; existing authenticated Member policies,
old grants and old RPC ownership stay unchanged. Internal role access is not
end-user admission: the command must perform the linked-owner checks below.
Fixed trusted search_path, qualified relations, no dynamic SQL, revoked default
PUBLIC EXECUTE and service-only future RPC execution are required. Backend supplies
a verified Actor UUID from authentication; callers cannot nominate another Actor.
Define the guard trigger as `journey_members_participation_guard`; its name
orders it before existing `journey_members_touch_updated_at`. No SECURITY DEFINER
command exists or is exposed in I2A. Prefer no executable
writer privilege at all until I2C installs its validated transaction.

Guard creation/ownership/grants are privileged migration work; verify support
in an isolated local migration replay before later environment authorization.
If the migration role cannot create this narrow boundary, STOP; do not replace
it with a spoofable bypass or rewrite all Member authorization.

PostgreSQL supports modifying NEW in BEFORE triggers, executes invoker triggers
under the triggering execution role, and runs both INSERT and UPDATE trigger
paths for conflict updates. These facts underpin the guard design, not runtime
proof: [trigger behavior](https://www.postgresql.org/docs/current/trigger-definition.html).
Table grants subsume column privileges:
[GRANT](https://www.postgresql.org/docs/current/sql-grant.html).
Future definer safety follows
[CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html).

### Future command preconditions

I2C `deactivateTripPerson` and `reactivateTripPerson` normalize to one desired-state
transaction. Required inputs: exact `tripId`, exact `personId`,
`isParticipating` false/true, `observedParticipationRevision` bounded integer,
`idempotencyKey` UUID and server-verified `actorUserId` UUID. Optional
`actorMemberId` UUID is contextual evidence; when supplied it must equal the
server-resolved Actor Member in this Trip. It never grants authority. Optional
reason has the bounded contract in F. Request contract version = 1.

Target must exist in the exact Trip, never resolved by name/email/User ID.
Current authenticated Actor must have a Member in that Trip with
user_id = Actor, status linked, role owner. Recheck under transaction locks;
Actor may be INACTIVE. Lock Actor/target in consistent Member-ID order (same row
once) and verify current facts after locking. Creator-only, legacy admin,
group_member and viewer are not substitutes. No last-ACTIVE or last-owner
participation restriction; role is not changing.

Authorize first, then serialize the actor/key scope and look up the receipt.
Matching replay returns its immutable outcome before CAS or mutation; conflicting
binding fails. For new intent, verify target and observed revision before desired
state/no-op evaluation. Permission loss forbids both replay disclosure and new
write; restoring permission permits the same stored replay, never a new effect.
I2C must not reapply an old receipt after an opposite transition.

## F. Idempotency / audit requirements

**PROVISIONAL:** one dedicated immutable table
`trip_person_participation_receipts` supplies two logical purposes:
**A. durable command outcome** for every accepted success or stale-CAS outcome;
**B. transition audit** only for APPLIED rows. No separate audit table is necessary
until distinct retention/read requirements exist. This is evidence, not a second
Person state source; current state is exclusively the Member row.

| Existing pattern                                    | Assessment                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ledger_idempotency_keys`                           | Useful unique-key/hash/atomic replay pattern; finance-scoped, Expense evidence triggers and financial cleanup/semantics make reuse inappropriate |
| Expense operation receipts/conflict outcomes        | Useful immutable normalized evidence pattern, but Expense identity and causal contracts must not absorb Person lifecycle                         |
| Expense / Personal Payment audit                    | Useful actor/revision/immutable timestamp pattern; wrong entity and financial permission/retention boundary                                      |
| Dedicated lifecycle receipt with transition columns | Recommended smallest persistence; no generic command framework or financial-table coupling                                                       |

Exact conceptual receipt columns (all required unless nullable stated):

| Field                                                              | Type / meaning                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `id`                                                               | UUID generated receipt identity                                           |
| `trip_id`, `person_id`                                             | UUID immutable scope/target evidence                                      |
| `actor_user_id`                                                    | UUID verified Actor evidence                                              |
| `actor_member_id`                                                  | Nullable UUID contextual evidence; current commands resolve and record it |
| `idempotency_key`                                                  | UUID client command identity                                              |
| `contract_version`                                                 | Small integer, exactly 1 for this contract                                |
| `desired_participation_active`                                     | Boolean normalized intent                                                 |
| `observed_participation_revision`                                  | Bounded bigint submitted CAS                                              |
| `reason`                                                           | Nullable text, trimmed, empty normalized null, maximum 2,000 characters   |
| `request_hash`                                                     | Non-null text, canonical normalized request SHA-256 hex                   |
| `outcome`                                                          | Text constrained to APPLIED / UNCHANGED / REVISION_CONFLICT               |
| `prior_participation_active`, `resulting_participation_active`     | Boolean state observed before and after evaluation                        |
| `prior_participation_revision`, `resulting_participation_revision` | Bounded bigint before/after evaluation                                    |
| `committed_at`                                                     | Non-null timestamptz, server transaction timestamp                        |

Unique key = **(actor_user_id, idempotency_key)** across all Trips and both actions.
This rejects same key/different target, Trip or desired state. Do not include
action/Person in the unique key, which would permit opposing reuse. Hash covers
contract version, Actor, Trip, Person, desired state, observed revision,
validated contextual Actor Member input and normalized reason. Explicitly bind
optional input presence/normalization deterministically before hashing.

APPLIED requires state flip, resulting revision = prior+1, desired = resulting
and observed = prior. UNCHANGED requires same prior/result pair, desired = current
and observed = prior. REVISION_CONFLICT requires observed != prior, unchanged
state/revision and HTTP 409 when returned. Store these outcomes atomically; auth,
malformed input, missing target and transaction/internal failures are not retained
as committed business outcomes. Rejected-CAS receipt replay still returns that
original rejection; a new attempt needs new observation/key.

Receipts are append-only with update/delete denial; no direct API/service-role
INSERT. Serialize concurrent same-key commands with a transaction-scoped lock
and unique-key enforcement; competing different bodies conflict before effects.
Member change and receipt insert commit or roll back together. Before I2C allows
changes, install a deferred consistency check that each changed Member version
has matching same-transaction APPLIED evidence; exactly one transition receipt
per (trip_id, person_id, resulting_participation_revision). No committed pending
receipt or financial queue required. Response loss retries the original key.

Replay returns the historical outcome/revision/timestamp, never executes its
transition again. A separately read current canonical pair may be newer and
must be identified separately; it is not part of the immutable receipt. If it
cannot be refreshed, do not fabricate a current value from the old receipt.
Both server and local reconciliation use monotonic versions.

Transition audit contains Trip/Person, Actor/context Member, prior/new state,
prior/result version, operation key and timestamp through APPLIED receipt fields.
Human reason is **optional**, not a product requirement. Backfill, claim, no-op
and rejection are not travel transitions. Initial actor/privacy-controlled audit
reads can remain internal; no new public audit UI is specified.

Evidence UUIDs intentionally have **no new FK to Member/Profile/Trip** that could
restrict old removals, cascade-delete audit, or null out immutable attribution.
The command validates all identities in its transaction; immutable receipt IDs
survive later deletion as historical evidence, not a readable Person registry.
RLS enabled; ordinary users have no direct receipt access; internal writer has
only required SELECT/INSERT. No cleanup/expiry introduced: retain receipts for
all replayable operations and transition evidence, including after feature off.
Future retention/account deletion policy requires separate review.

## G. Server migration plan

**PROVISIONAL conceptual order; no SQL or migration created:**

1. Record a local before-state manifest of Member IDs/old columns, role/status
   constraints/grants, financial digests and trigger definitions. Rehearse on
   synthetic isolated local data; no remote inspection is part of this phase.
2. In one PostgreSQL DDL transaction, take the required table lock. Add both
   non-null columns with constant true/0 defaults and bounded revision constraint
   as one atomic schema expansion. Existing rows obtain true/0 through defaults;
   no per-row UPDATE backfill and no claim/private-history/timestamp effects.
3. Create the private role and invoker guard function/trigger before committing;
   at I2A no command can exercise a privileged lifecycle update. Preserve current
   RLS/grants/RPCs and existing timestamp trigger. No intermediate exposed state
   where new fields are writable through ordinary access.
4. Validate the exact schema/guard/defaults and old-column/financial before-after
   equality inside local acceptance. Any error rolls the migration back; no
   partially completed field/protection deployment.
5. Only after schema succeeds may the compatible backend explicitly SELECT/map
   the new fields and Mobile hydrate the nullable projection. Retained old
   backend may continue to omit fields without changing persisted state.
6. In separately approved I2C, add the dedicated receipt persistence/immutable
   protection, role-specific privileges/policies and deferred evidence check,
   then install the guarded command function in the same transaction. Revoke
   PUBLIC execution before commit. Endpoints remain off until I2B convergence
   and command acceptance are complete.

Schema deployment precedes backend projection requiring its columns. No catches
that reinterpret permission/network/schema errors as legacy data. An old backend
and new server schema coexist; a new backend targeting an unmigrated schema is
an ordering error, not permission to drop fields. No migration number is assigned.

PostgreSQL constant-default ADD COLUMN can establish baseline data without
issuing business UPDATEs; local tests must verify repository-version behavior.
Large-table lock duration and environment role provisioning remain rollout
checks. Do not weaken atomic protection to reduce the lock window.

## H. Local SQLite contract

**PROVISIONAL**, exactly two new columns on existing `ledger_members`:

| Column                   | SQLite contract                                                           |
| ------------------------ | ------------------------------------------------------------------------- |
| `participation_active`   | INTEGER, nullable, default null; non-null values exactly 0/1              |
| `participation_revision` | INTEGER, nullable, default null; non-null integer 0–9,007,199,254,740,991 |

Pair invariant: either both NULL or both non-NULL and within the stated type/range.
No TEXT enum, Account link column, new Person table, observation timestamp or
support marker. Nullable pair is sufficient: NULL/NULL is unobserved; 1/r is
observed ACTIVE; 0/r is observed INACTIVE. Revision 0 is authoritative only when
received, not locally defaulted. Enforce actual integer storage/range, not
SQLite's permissive affinity alone. Add columns and pair validation atomically
through the existing local migration runner; column/trigger constraints may be
used as required by SQLite ALTER limitations without rebuilding Person identity.

Compare: nullable Boolean with separate marker adds redundant support state;
Boolean default true plus nullable revision invites accidental truth claims;
nullable pair keeps absence explicit and simple. Reject mixed pairs.

Only repository hydration writes this projection. `applyJourney` currently uses
INSERT OR REPLACE (lines 499–514 of `ledgerReadRepository.ts`); replace that Member
statement with a preserving conflict update/read-merge, not a delete/reinsert.
Other entities' hydration is outside scope. Normal Ledger `listMembers`, history,
financial joins and calculations remain complete and unchanged.

## I. Local upgrade / observation semantics

Existing cache rows upgrade to NULL/NULL, regardless of role/status/user history.
No network required and no local claim of migrated server true/0. The existing
Account-scoped Journey gate, account generation rejection and offline launch
continue. Observation persists across restart and account switches for authorized
shared Trip data; Person observation itself never grants access.

Exact reconciliation per original Person ID and exact Trip:

| Incoming pair                             | Existing pair              | Required lifecycle result                                           |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Both fields absent                        | None/unobserved            | Keep NULL/NULL; legacy compatibility only                           |
| Both absent                               | Observed true/r or false/r | Preserve both known values; do not reset/support-downgrade          |
| Valid pair                                | Unobserved                 | Store authoritative pair                                            |
| Greater revision                          | Observed                   | Replace pair                                                        |
| Equal revision, equal Boolean             | Observed                   | Keep same pair; metadata may hydrate normally                       |
| Lower revision                            | Observed                   | Preserve newer pair; do not treat old snapshot as current           |
| Equal revision, opposing Boolean          | Observed                   | Reject inconsistent lifecycle evidence and retain cached pair       |
| Partial/null/wrong-type/out-of-range pair | Any                        | Reject response before atomic application; never manufacture ACTIVE |

A new response with a lower revision can still contain separately valid legacy
metadata; lifecycle freshness is not claimed by serverTime/updatedAt. No financial
rollback occurs. Validation contradictions cannot advance the scoped bootstrap
cursor as a successful lifecycle observation. Omission never removes known Persons
or their financial references; authoritative deletion handling remains a separate
existing/future sync responsibility.

Before observation, complete TripPerson reads return `participation: null`.
Future ordinary candidate reads may temporarily include unobserved Persons for
compatibility, alongside observed ACTIVE Persons, and exclude only observed
INACTIVE. This is an effective candidate policy, not canonical ACTIVE. Lifecycle
commands require an observed revision (and current server authority); null cannot
be sent as 0. I2A does not enable any candidate filter or command.

## J. TripPerson domain/API contract

**PROVISIONAL future exact domain shape:**

```text
TripPerson {
  tripId: TripId
  personId: TripPersonId
  displayName: string
  participation: { isParticipating: boolean; revision: number } | null
}
```

Both revision and Boolean occur together. No optional standalone Boolean that
implicitly becomes true. `null` describes absence of observation only; no UNKNOWN
participation enum. Role/status/user link remain outside this minimal Person type.
Storage column names and cache migration version are hidden by the repository.

`listTripPersons(tripId)` remains complete and account-isolated. A separate
future `listTripParticipationCandidates(tripId)` returns known true plus unobserved
compatibility candidates; each retains its observation object/null. Do not call
this a strict “verified active” list. Candidate query belongs to I2D, not I2A.
Existing referenced/draft/historical IDs resolve through the complete list even
when false. Selection adapters may keep explicit historic financial choices;
this spec neither redesigns those pickers nor filters Ledger reads.

Future command inputs use the names in E. Receipts distinguish committed outcome
from separately refreshed current canonical participation. No optimistic local
lifecycle mutation or new queue is introduced by this persistence specification.

## K. Bootstrap compatibility

**PROVISIONAL Member DTO additions:** `isParticipating: boolean` and
`participationRevision: number` (bounded nonnegative integer). In the compatibility
parser both are optional **as one pair**: absent/absent is legacy; present/present
is validated; all mixed/null/malformed forms are invalid. A migrated compatible
backend always emits both for every Member, including false and revision 0.
It must never use truthiness or `value || default` conversions.

Current `ledgerMemberSchema` is a non-strict `z.object` in
`src/data/api/ledgerReadContracts.ts` (lines 160–167); old clients strip unknown
additive keys. No existing id/displayName/role/status/capability semantics change.
Future schema must preserve this compatibility while refining paired presence.
Backend `readLedgerBootstrap` SELECT/map at lines 6224–6227 and 6328–6338 becomes
explicit about both columns. Unknown field stripping is safe for server truth,
but old UI may continue to offer INACTIVE Persons.

Old server/rolled-back backend omission is not an error and follows I. A server
schema rollback by dropping fields is prohibited. New schema without compatible
backend still accepts old writes safely. No lifecycle data is inferred from generic
Member updatedAt. Do not use the existing opaque cursor/version to imply lifecycle
support. No incremental Member entity, cursor format or private-payment cursor
change is part of I2A.

Bootstrap coherent observation requirement: each returned Person pair comes from
one Member row observation, and the returned Member lifecycle snapshot must be
coherent across the entire list. I2A's existing single Member SELECT is sufficient
while commands are disabled. Before I2C enablement, I2B must either read a single
consistent snapshot or verify a complete lifecycle ID/revision vector before and
after bootstrap with bounded retry. Existing finance sequence/settings checks
must remain; they do not currently detect Member transitions. Never advertise
“current lifecycle synced” merely because those financial checks succeeded.

## L. Trip-level revision decision

**PROVISIONAL recommendation: NO persisted Trip-level lifecycle counter.**

| Persistence option                             | Benefit                                                                                    | Cost / correctness obligation                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-Person revision only, derive Trip snapshot | Smallest state, row-local CAS, ABA evidence, complete membership set detects insert/delete | O(Person count) metadata scan; I2B must compare complete vectors and prove coherent observation                                                       |
| Per-Person + Trip counter                      | O(1) comparison; inexpensive bootstrap before/after guard                                  | Shared counter/lock contention, extra grants/trigger/backfill, every old insert/delete/import must increment it or membership snapshots can be missed |
| No counter, later digest of complete vector    | Same persistence as first option; compact comparison token possible                        | Hash encoding/cursor transport is an I2B design choice; not adopted here                                                                              |

A lifecycle-only Trip counter that ignores new/deleted Members is not a complete
Person snapshot version. Expanding it to all membership changes would pull old
writers and Trip storage into the contract unnecessarily. Small travel-group
Person sets justify a bounded complete metadata read; no measured scale requires
a second persisted revision source. No trips.updated_at/settings revision reuse.

Exact persistence hooks for I2B: query all `(id, participation_revision,
participation_active)` for exact Trip, deterministic ID order, one statement/MVCC
snapshot; include complete set, including INACTIVE. Query returns raw bounded
values; it is internal authorized metadata, not a public Person roster expansion.
ABA raises a Person revision. Set changes are detectable. No identity recycling
in lifecycle flows. Guarded writes provide committed versions, not allocated
sequence positions that can be skipped by concurrent commits.

I2B must choose freshness checking cadence/transport, omission support handling,
bootstrap consistency and atomic account-scoped application/cursor rules. No
fingerprint algorithm, cursor version/binding, new endpoint or polling timer is
finalized here. The preflight fingerprint was a proposal, not approved protocol.
If measured Person volume later makes vector reads impractical, review a counter
with all relevant writers covered; do not invent it in I2A.

## M. Old-client safety

Guarantees derive from E's server guard rather than client awareness:

- Old notes/name/profile/status/role updates continue; lifecycle pair is restored
  from OLD. No new end-user role admission rule is applied to those old operations.
- Claim/invite preserves same Person participation even when INACTIVE; a genuinely
  new invited Person obtains true/0. No implicit reactivation on linking.
- Old inserts/upserts/fixtures missing fields cannot overwrite known lifecycle;
  even insert defaults on conflict are repaired from OLD on UPDATE.
- service_role's RLS bypass alone cannot bypass an ordinary row trigger. Existing
  SECURITY DEFINER RPC owners do not equal the private lifecycle writer role.
- Old DTO/cursor clients may ignore state and show INACTIVE in pickers. That UI
  limitation is acceptable; false→true/r→0 on the server is not.
- A lifecycle request accidentally sent to general Member editing does not change
  lifecycle; compatible command callers use only the dedicated transaction RPC.
- An old response received by the new hydrator preserves known local pair; a lower
  revision cannot undo a later opposite state.

Representative proof trace: existing false/7 + old upsert defaults true/0 →
BEFORE UPDATE restores false/7; old claim alters user/status and leaves false/7;
new true command observed 7 → true/8 with receipt; replay old false command receipt
at 7 → historical outcome only, current stays true/8. Equal-state stale observed
6 → conflict, no mutation. These are conceptual traces; executable proof is the
next approved implementation's responsibility.

The protection boundary does not defeat database superusers disabling triggers,
restore tooling, arbitrary privileged deletion/recreation or malicious schema
changes. Those are administrative actions, not old-client field omission. No
new deletion/access redesign is claimed.

## N. Rollback

**DECIDED data preservation; PROVISIONAL operational boundary:** disable commands
and participation-aware selection/UI while retaining server columns/defaults,
revision guard, receipts/audit and nullable local projection. No resets, drops,
ID remapping or “everyone ACTIVE” rewrite. Retained schema must keep old-column
writers safe. Prefer continuing additive bootstrap fields; older backend omission
is tolerated by the compatible hydrator without erasing known values.

Feature-off can stop commands or revoke only the new RPC execute grant. It must
not alter old Member access or disable the ordinary-write guard. I2B freshness
may pause; cached observations remain observations, not a claim of current
server equality. Restart/offline reads continue.

Mobile rollback must retain the compatible preserving Member hydrator/migration.
An arbitrary downgrade to the old binary's INSERT OR REPLACE is **not** a safe
local-data rollback: it can null the newly observed columns. Use a compatible
feature-disabled build; do not remove the hydrator to restore old UI behavior.
Server lifecycle truth and immutable evidence survive even if an older client
cannot display them. Restoring commands resumes from retained current versions,
not baseline 0. New keys/observations remain necessary after conflict.

## O. Financial non-interference

**DECIDED exclusion contract**, supported by current explicit projections:

| Financial truth                     | Current evidence / required exclusion                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expense revision/aggregate validity | Financial commands operate Expense revisions; validation checks complete Journey Member IDs. Participation fields/revision must not change aggregate inputs or increment Expense revision                                      |
| Settlement source digest            | `20260912000700_ledger_2_stage_7_1_settlements.sql`, `ledger_settlement_source_7_1`: Member source emits ID/displayName; lifecycle pair and generic Member updated_at remain excluded                                          |
| Finalized inputs / Adjustment       | Frozen Expense/valuation revisions, Member snapshots and current-source functions in `20260925000300_settlement_adjustment_current_source.sql`; no new lifecycle field in source equality/digest                               |
| FX valuation                        | Money, date, rate and policy sources remain unchanged; lifecycle cannot invalidate quote/valuation or write rate tables                                                                                                        |
| Journey currency revision           | `20260917000600_ledger_journey_currency.sql` settings revision is independent; no increments or settings.updated_at changes                                                                                                    |
| Review financial fingerprint        | Personal checkpoint source in `20260923000300_settlement_2_phase_3b_personal_review_checkpoints.sql` projects explicit financial Member/Expense/payment evidence; no lifecycle activity or generic Member timestamp enters it  |
| Personal Payment identity/privacy   | Existing Person FKs and linked-account read grants, `20260922000100_settlement_2_phase_1a_personal_payments.sql`; command updates only two lifecycle columns, never user_id/status, so linking-history trigger is not targeted |
| Financial Member validity           | Complete ID membership retained in bootstrap, Ledger repositories and aggregate validation; no global active predicate                                                                                                         |

Future lifecycle command may naturally touch Member generic updated_at through
its existing timestamp trigger. This is harmless metadata only if financial
source projections remain explicit; never spread a full new Member DTO/row into
Settlement/Review hashes. Inspect and compare those source outputs in I2A tests,
then again with actual transitions in I2C. Source locks may serialize briefly;
lock contention is not a financial revision.

Lifecycle-only change must leave Expense revisions, financial rows, finalized
inputs, valuations, source digests, Review financial resolution and private grants
identical. It cannot alone make Settlement stale, Expense conflicted or FX stale.
Future activity-dependent Review requires separate approval. No financial trigger,
change-feed enum or business calculation is extended by this spec.

## P. Exact future migration/change plan

All items here are **PROVISIONAL**, no migration creation authorization:

| Layer                        | Exact future change                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Member migration, I2A | Boolean participation_active true/NOT NULL; bounded bigint participation_revision 0/NOT NULL; atomic constant-default baseline; private invoker insert/update guard           |
| Internal role, I2A           | Reserve isolated NOLOGIN execution identity; no command function or ordinary/service membership; fail closed until I2C                                                        |
| Extra persistence, I2C       | One trip_person_participation_receipts table with F's exact fields, uniqueness, immutable/RLS protection and transition-evidence check; no separate audit/current-state table |
| Trip counter                 | None; no trips column or currency/feed revision coupling                                                                                                                      |
| SQLite migration, I2A        | Two nullable INTEGER columns, null defaults, pair/type/range validation; legacy rows stay null; use existing migration runner/next available ID only at implementation        |
| API Member schema, I2A       | Optional-paired isParticipating/participationRevision with validation; old non-strict Member contract remains compatible                                                      |
| Backend bootstrap, I2A       | Extend explicit Member SELECT/map; emit authoritative pair; no role/status/capability change                                                                                  |
| Local hydration, I2A         | Replace only Member REPLACE with preserving upsert/reconciliation in ledgerReadRepository applyJourney; omission and monotonic comparison from I                              |
| Domain/repository, I2A       | Future TripPerson participation object/null through current Account/Trip read gate; complete list preserved                                                                   |
| Freshness, I2B               | Complete-vector scoped observation/convergence design and tests, retaining financial bootstrap guards and private cursor isolation; protocol not chosen here                  |
| Commands, I2C                | Protected desired-state CAS/idempotent transaction, receipt/audit and authority checks; no unlink/remove/role changes                                                         |
| Selection, I2D               | Separate candidate repository query and approved consumer integration; no financial/history filtering                                                                         |

Future tests must include default/backfill old-column equality, ordinary/service
upsert preservation, claim/invite/notes behavior, guard authority spoof attempts,
zero executable lifecycle path in I2A, local null upgrade, paired DTO validation,
stale/equal/newer reconciliation, account-switch/restart gates, unchanged financial
source fixtures and old-client parsing. I2C adds actual ABA, no-op/CAS ordering,
concurrent same/different key/body, response loss and opposing replay, immutable
receipt/audit and financial non-interference through real transitions.

No schema manifest/seed/test edits occur now; future implementation updates the
relevant schema manifest and current-state handoff within its authorized scope.

## Q. A1-I2A-IMPL boundary

Recommend a separately approved **A1-I2A-IMPL** that changes only server/local
migrations, new-field protection, passive bootstrap DTO/mapping/hydration,
minimal complete TripPerson read extension, relevant tests and short documentation.
Receipt table and command-specific privileges/evidence checks remain I2C because
no transition can occur in I2A. The guard must still protect every old path now.

No deactivate/reactivate endpoint/RPC exposure, active filtering, candidate UI,
Booking/Itinerary integration, offline lifecycle queue, cursor fingerprint/version,
Member incremental-feed event, sync timer or Hosted Dev deployment. No Production.

This boundary is safe without I2B because the new pair is baseline true/0 and all
existing writers are prevented from changing it. Ordinary insert/remove remain
legacy behavior, not newly enabled transitions. I2A reads are observations only;
no freshness guarantee or lifecycle command is advertised. I2B's reliable scoped
refresh must pass before I2C enables real transitions or I2D consumes the new
selection semantics. If implementation needs active writes to prove the schema,
use isolated transactional test-only execution, never expose a production bypass.

## R. Risks / unknowns

| Item                                                                                           | Status / next evidence                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Adoption of exact names, bounded version, role guard, single receipt table and no Trip counter | PROVISIONAL; human review of this document                                                                                |
| Live grants, external writers and deployed schema parity                                       | UNKNOWN; no remote access authorized; do not claim deployment safety                                                      |
| Migration role can provision private execution role/ownership                                  | UNKNOWN runtime; isolated local replay is mandatory; STOP if narrow protection is impossible                              |
| Trigger ordering / INSERT-CONFLICT default normalization                                       | PROVISIONAL design supported by PostgreSQL docs; test real ordinary and service paths locally, not mocks alone            |
| Local ALTER pair constraints and exact-number binding                                          | UNKNOWN execution until local upgrade tests; no schema reconstruction by new ID                                           |
| Reliable freshness protocol                                                                    | PROVISIONAL requirement; I2B design/acceptance unresolved, not satisfied by adding fields                                 |
| Derived vector cost                                                                            | O(Person count), appropriate current small-group scope; measure before counter adoption                                   |
| Old mobile binary rollback                                                                     | Unsafe local REPLACE path identified; retain compatibility hydrator in feature-disabled build                             |
| Receipt privacy/retention                                                                      | Dedicated closed RLS surface, immutable IDs; no public read UI or new expiry; future deletion/retention review separately |
| Physical delete / ID recycling                                                                 | Existing deletion preserved; not reactivation. No lifecycle-ID recycling permitted; general delete redesign out of scope  |

No stop condition was established from repository evidence. This does not waive
future stop conditions if isolated implementation tests contradict the proposal.

## S. Acceptance matrix

PASS means a specified contract with source or explicit normative reasoning,
not executed runtime certification or approval to implement/deploy.

| Criterion                                        | Evidence                                             | Result |
| ------------------------------------------------ | ---------------------------------------------------- | ------ |
| Exact participation field name recommended       | C naming comparison                                  | PASS   |
| Exact server type/default/nullability defined    | A/C                                                  | PASS   |
| Existing-row backfill defined                    | C/G true/0, no inference                             | PASS   |
| New-row default defined                          | C/E true/0                                           | PASS   |
| Exact lifecycle revision representation defined  | D bounded bigint/number                              | PASS   |
| Revision increment/no-op behavior defined        | D/E stale check before no-op                         | PASS   |
| All current journey_members writers inventoried  | B checked-in SQL/TS/seed/test scope                  | PASS   |
| Unrelated writes preserve lifecycle              | E guard restores OLD pair                            | PASS   |
| Claim/link preserves lifecycle                   | B/C/E                                                | PASS   |
| Old-client writes preserve lifecycle             | E/M conflict-update trace                            | PASS   |
| Lifecycle mutation has a protected write path    | E dedicated future role/RPC; closed I2A path         | PASS   |
| Idempotency persistence requirement defined      | F scoped immutable receipt/hash                      | PASS   |
| Audit persistence requirement defined            | F APPLIED transition rows                            | PASS   |
| Human reason requirement decided                 | F optional bounded reason                            | PASS   |
| Exact conceptual server migration order defined  | G atomic defaults+guard, no business backfill UPDATE | PASS   |
| Exact local projection fields defined            | H nullable validated pair                            | PASS   |
| Offline upgrade/unobserved semantics defined     | I null cache upgrade                                 | PASS   |
| Canonical TripPerson future shape defined        | J object/null                                        | PASS   |
| Complete list vs active-candidate list separated | J complete/candidate queries                         | PASS   |
| Bootstrap DTO additions defined                  | K optional-paired wire fields                        | PASS   |
| Missing-field compatibility defined              | I/K preserves known observation                      | PASS   |
| Rollback behavior defined                        | N compatible feature-off, fields/evidence retained   | PASS   |
| Trip-level revision question decided             | L NO recommendation; review provisional              | PASS   |
| I2B persistence hooks without full sync design   | L complete ordered snapshot; protocol reserved       | PASS   |
| Old-client safety proven conceptually            | E/M insert+upsert+claim/replay traces                | PASS   |
| Financial non-interference explicitly defined    | O per-source exclusion contract                      | PASS   |
| No Member ID/role/status/access semantics change | B/C/E/G old writes retained                          | PASS   |
| No second Person authority introduced            | A/F/H/J Member remains truth                         | PASS   |
| Next implementation slice bounded                | P/Q passive persistence only                         | PASS   |
| No source/schema/test/config modification        | Git baseline/final checks below                      | PASS   |
| No migration created/applied                     | Single documentation file; no SQL                    | PASS   |
| No remote environment access/mutation            | Local source reads; public docs only                 | PASS   |

Specification criteria: **32 PASS / 0 PENDING / 0 BLOCKED**. Proposed choices
remain PROVISIONAL; human adoption, isolated migration/compatibility tests and I2B
protocol acceptance remain **PENDING** outside this specification matrix.

Validation: changed-file Prettier and whitespace checks; A–S section order,
32 acceptance rows and referenced local files checked. No application/database
suite executed or claimed as new feature proof. Final working changes contain
only this specification; no commit requested or made.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Migration created/applied: **NO**. Application code changed: **NO**.

**A1-I2A-SPEC COMPLETE — REVIEW PENDING. STOP. Do not begin implementation.**
