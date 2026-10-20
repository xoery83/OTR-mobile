# A1-I2C5 — Participation activation security foundation

Status: **A1-I2C5 PRINCIPAL-SCOPE COMPATIBILITY AMENDMENT COMPLETE — REVIEW PENDING / RUNTIME CLOSED**.
Date: 2026-10-05. Original clean baseline:
`55a35bc2174e2abacc5c1a1bb6206b9918209e3b` on canonical
`integration/ledger-polish-canonical`, clean at startup. Accepted I2C4 is normative;
I2C1/C2/C3 semantics and accepted B/C checkpoints remain unchanged.

## Principal-scope compatibility amendment

Baseline: clean canonical HEAD5d0af4f010595377cd2d4a730b8072b08f954855.
Accepted A1-I2C5/security/fixed-root foundation stays CLOSED. This amendment changes
an accepted security-model semantic and requires independent focused review; it is
not self-approved FULL PASS. No commit/push, sibling checkout or rebase operation.
Unchanged accepted C00300 and its accepted SQL tests were read from canonical Git
objects at dff8f03, never from import's paused checkout.

Before amendment, original A security check passed; applying unchanged C00300 in the
disposable DB failed UNSAFE_PARTICIPATION_ACTIVATION_LIVE_ROOT. PostgreSQL grants are
unions: PUBLIC EXECUTE is effective for every role and role-specific REVOKE cannot
subtract it. The two new isolated principals expanded the old all-non-superuser
function-execution arrays. Neither directly grants auth.uid()/touch_updated_at().
This local platform has 50 reviewed non-system/non-extension-member PUBLIC routines
(the request described49); both original/new shared execution counts remain50.
The blocker is privilege source/classification, not one count or C-specific grant.

Structural algorithm (no name prefixes or C-role allowlist):

1. PUBLIC is a globally pinned ACL surface, not an authenticatable role graph node.
   Fixed application admission roots are anon/authenticated/service_role plus ALL
   LOGIN identities except the two existing trusted migration/DBA identities postgres
   and supabase_admin. Actual platform LOGIN roots include authenticator, pgbouncer,
   auth/storage/functions/replication/ETL/read-only administrators. The three protected
   A identities (command gateway/lifecycle writer/receipt reader) are explicit roots
   even while NOLOGIN. Their existing accepted private-role/ownership boundaries stay
   mandatory; DBA exclusion is a documented trust boundary, not a generic superuser
   exemption for newly created roles.
2. Compute recursive closure over every membership edge. INHERIT/SET/ADMIN options
   and role profiles are pinned. Disabled/mixed option edges are conservatively
   treated as reachable rather than silently proving isolation; this accounts for
   ADMIN-mediated grants and fails closed on ambiguous catalog paths. Also add
   EXECUTE→owner edges for SECURITY DEFINER routines: application execution can
   obtain an owner's privileges without SET ROLE. No function-body dependency crawler
   or schema-USAGE shortcut is used.
3. Exclude a candidate only if NOLOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/
   NOCREATEROLE/NOREPLICATION; outside that closure; no outgoing membership; no
   non-system schema ownership/CREATE or database ownership/CREATE; no ownership of
   any24 critical functions/anchor/3 protected tables; no direct grant on a critical
   routine; no table/column privilege on the protected tables; no anchor EXECUTE.
   Otherwise include it in the conservative application-capability set and pin its
   role profile/edges/effective critical execution, or reject through existing A
   ownership/private-role checks. Unknown unsafe roles cannot disappear merely by
   being SUPERUSER or using an internal-looking name.
4. Recompute execution lists only for this set (36 baseline profiles). An isolated
   NOLOGIN principal's duplicate PUBLIC-derived ability does not add a new principal
   row. Direct A grants still fail proof and change exact ACL/profile/root; A ownership,
   relevant schema/database CREATE and app/recursive/SECURITY DEFINER paths fail closed.
5. Pin the50 shared PUBLIC routine definitions/properties/owners/exact ACLs globally,
   along with unchanged24-function/3-table/anchor/default ACL/role/column boundaries.
   PUBLIC/anon/authenticated/service_role grant drift is never ignored. Existing
   reserved-role scans also reject new unreviewed PUBLIC routines. C-private own
   routines/tables remain private to C and visible to C's own install/test inventory;
   they are not blessed by an A name exception.

The principal-role profiles and membership options, global shared PUBLIC object/ACL
inventory and scoped execution semantics are the new reviewed semantic inputs. Root
was regenerated for that SECURITY MODEL change, not C role names. No C role name is
present in the A migration. Independent anchor remains outside normalization, full
body pinned. Reviewed root:
`2a0650a960257bc9e8a0e8ef9e9d2109cf992f2b65be334c3aa586904fb3703c`.
Anchor full definition hash:
`be9313fb8d8909f8bf84d9dcfe16e923accabd950f3ce339cbb981cd5eef0ad6`.
Checker normalized definition hash:
`58e3a1beb2117f19696d6c711a94d487dbf32ccb103a83d702236699cfe50ffe`.

The reserved participation gateway is always a protected principal, never an isolated
exemption. Its LOGIN bit remains governed by the accepted expected_login phase
checks: current install/test requires false, separately reviewed provisioning audit
requires true, installed discovery follows the existing direct-identity profile.
The root profile labels this reserved bit reviewed-direct-gateway-phase; no analogous
exception exists for future isolated roles. This preserves accepted external LOGIN
provisioning architecture rather than making the future dedicated LOGIN disappear
from the capability set. No LOGIN/secret/connector/feature/allowlist/dispatch was added;
PUBLIC TEMP still blocks future LOGIN provisioning pending separate DBA review.

Validation on final candidate:

- Generic scope35 Node tests: opaque two-role stability/OPEN+CLOSE; LOGIN/INHERIT/
  SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION; direct and recursive SET/INHERIT/
  ADMIN/mixed/disabled membership; outgoing/reverse A bridge; private function/anchor,
  table/column/ownership/schema/database capabilities; shared PUBLIC ACL/body drift;
  private PUBLIC leakage; SECURITY DEFINER owner path; internal-looking reachable name.
- Fixed-root16: all original15 retained plus indirect-helper/root joint forgery;
  prior P2 52 PASS. Trigger/root, policy/root, independent anchor/discovery/generation/
  no repair/CLOSE asymmetry remain intact. Positive external anchor/code audit passes.
- A-only clean replay twice:73 versions, each42 SQL files/1472 assertions PASS.
  Hostile63, forward1/119 tables, real fence3, I2C2 codec/races1+1 PASS.
- A+C clean replay twice:74 versions, each43 SQL files/1583 assertions PASS; unchanged
  C journal test contributes111. A checker PASS after C; C own inventory callable;
  C gateway/writer NOLOGIN/NOINHERIT, no A-specific direct access/app membership path;
  shared PUBLIC50 capabilities per role do not change A reviewed root. Per replay
  compatibility1, scope35 and root16 PASS.
- The integrated suite uses accepted C versions of the two old Source SQL tests in
  /tmp, and a /tmp RLS copy changes only119→121 /1776→1812 combined counts. Original
  baseline expectations correctly failed at the later C stage. No assertions were
  dropped and canonical A/C tests were not rewritten for integration.
- Backend29/360, focused7/108 (54 overlap; unique34/414), typecheck/build/full lint/
  UI guard, changed-file format/whitespace, verifier/count+checksum+anchor-source
  negatives PASS. A-only manifests identical; integrated manifests identical.
- Canonical manifest remains A-only119 tables/1776 columns/217 functions; checksum
  `734a8d75b7b21e7f87bc690df0f1a03bbcd1c7668e85ad44ec5b6e7376e93296`.
  Integrated121 tables/1812 columns/227 functions checksum
  `285f314be12ac7d2d1ada8e50ee38814bfc63660c7c7ed7024ac2b11d5755b96`
  remains /tmp evidence ONLY, for later Checkpoint10 reconciliation.
- Historical72 migrations, whole SQLite, B/C protected src/backend and Tripsy bytes
  unchanged. C migration and accepted copied tests byte-equal to Git dff8f03. No
  import/temporal checkout edits, rebase operations, Hosted Dev/Production or runtime
  activation. Logs/evidence: /private/tmp/otr-ai2c5/scope-* and integrated-*.

Exact amendment files:

- supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql
- scripts/supabase/trip-person-activation-foundation.test.mjs
- scripts/supabase/trip-person-gateway-security-inventory.sql
- scripts/supabase/verify-baseline-artifacts.mjs
- supabase/schema-manifest.json
- docs/API_CONTRACT.md
- docs/DATA_MODEL.md
- docs/CURRENT_IMPLEMENTATION_STATE.md
- docs/architecture/TRIP_CANONICAL_A1_I2C5_ACTIVATION_SECURITY_FOUNDATION_REPORT.md

## Accepted prior fixed-root correction #2 — independent reviewed-root anchor

The previous mutual normalized-pin scheme admitted the exact independent joint
trigger forgery. Before correction, `forged-structure.py` returned security_check=true,
OPEN/generation1 and healthy discovery after disabling the trigger and blessing D in
the payload/root trio. External fixed audit rejected it. Evidence is outside git:
`/private/tmp/otr-ai2c5/root-before-reproducer.log`. This supersedes the earlier
implication that mutual pins alone provide an independent root of trust.

Added only `public.trip_person_activation_reviewed_root()` outside the existing
24-function/3-table normalized inventory cycle. It is parameterless SQL IMMUTABLE,
SECURITY INVOKER, owner postgres, fixed pg_catalog config, returning the exact
migration-installed reviewed root. Its full pg_get_functiondef SHA-256 has no
normalization exclusions; changing its returned literal changes that full hash.
Only postgres and private NOLOGIN receipt reader have EXECUTE. PUBLIC/API/gateway/
writer have none; no ownership/membership/configuration registry or caller/GUC/JWT/
environment trust input is added. Exact signature/schema, owner, volatility, security/
strict/leakproof/kind/language/config, ACL, effective execution/membership paths and
absence of same-name aliases are checked. Pre-existing anchor functions in any schema
or a same-name relation cause transactional install rejection with fixtures intact.

The external fixed audit and source verifier independently pin this anchor and the
reviewed root. The source verifier rejects changed anchor executable literal even
with matching migration count/manifest supplied. Anchor replacement is reserved to
a separately reviewed trusted migration/DBA boundary; no command/admin setter path
writes it. This is protection against accidental/trusted DBA/environment drift, not
confinement of a malicious superuser able to replace both code and the anchor.

OPEN retains exclusive advisory fence + singleton row lock + expected-generation CAS.
Inside that transition it directly verifies/reads the independent anchor, verifies
checker code and payload, then recomputes the complete live 24-function/3-table
inventory and requires its root equal the anchor before update. Discovery performs
the same anchor admission. The mutable/normalized trio cannot redefine the root
merely by consistently replacing its own excluded literals. CLOSE deliberately skips
OPEN-only checker/anchor admission, retaining trusted-admin emergency closure after
Backend feature OFF. Anchor corruption CLOSE regression passes.

Fixed reviewed root:
`1f6bd2cb0fe9b6a9ddbd611d78e3c8fe33de63a6676032f6d412e228b936199a`.
Full anchor definition hash:
`f8fdf9394720027db4885f0127277de2a49ba046f00025e0765326746e7d25ad`.
Normalized checker definition hash:
`c5079be7b4bc04db361519c173f581e3161f8d6dccb534fbf0c982454459ca5d`.

Both joint trigger-D and broadened writer UPDATE policy attacks rewrite payload,
recompute root, and replace checker/setter/discovery root literals together. Their
normalized mutual hashes remain unchanged, demonstrating the old weakness; the
independent anchor now rejects security check, OPEN and discovery. The external audit
also rejects. Gate generation is unchanged, drift persists, anchor is unchanged,
rollback restores exact accepted inventory. The original independent script now
stops at UNSAFE_PARTICIPATION_ACTIVATION_ANCHOR_ROOT. After-proof:
`/private/tmp/otr-ai2c5/root-after-original-reproducer.log`.

Final added root suite: 15 Node tests PASS (parent included): two joint forgeries,
11 anchor body/owner/ACL/membership/config/security/alias probes and anchor-corrupt
CLOSE control. All prior P2 52 PASS. Hostile reuse expands 60→63 for the anchor
identity collisions. Full SQL twice remains 42 files / 1,472 assertions per replay;
73 migrations, now 217 functions, same table/policy/trigger/column counts. Other
validation below was rerun on this final candidate. Runtime/capability remain CLOSED.

Exact correction #2 files (relative to previous uncommitted P2 candidate):

- supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql
- scripts/supabase/trip-person-activation-foundation.test.mjs
- scripts/supabase/trip-person-gateway-security-inventory.sql
- scripts/supabase/verify-baseline-artifacts.mjs
- scripts/supabase/verify-baseline-artifacts.test.mjs
- supabase/schema-manifest.json
- docs/API_CONTRACT.md
- docs/DATA_MODEL.md
- docs/CURRENT_IMPLEMENTATION_STATE.md
- docs/architecture/TRIP_CANONICAL_A1_I2C5_ACTIVATION_SECURITY_FOUNDATION_REPORT.md

## Previous P2 correction — preserved coverage

Safety gate: correction HEAD is `a39cb1c2d6129cb3b355c98b6da22a3d7682588a`.
The sole committed delta since original baseline55a35bc is the unrelated
`docs/trip/OTR_Tripsy_Benchmark_UI_Product_Review_2026-10-05.docx` addition.
That artifact and commit remain untouched; all A1-I2C5 changes remain uncommitted.

P2-A/P2-B were real inventory gaps, modeled as trusted DBA/environment drift.
These probes do not establish an application role escalation path.

The fixed reviewed inventory now has 24 functions and 3 tables. Each function pins
exact schema/signature/name, owner, SECURITY DEFINER/INVOKER, volatility, strictness,
leakproof, proconfig, language/kind, normalized pg_get_functiondef SHA-256 and exact
ACL (grantee/grantor/privilege/grant option). Effective EXECUTE and membership/SET
reachability for every non-superuser application/runtime principal must match the
accepted positive surface. Existing shared helper/API execution is preserved exactly;
A entrypoints remain private. Same-name overloads/wrong-schema aliases reject.
Public/global function default ACLs are pinned; existing platform API defaults are
not mistaken for new A grants. Reserved role/pg_shdepend/column grants checks remain.

Fixed function graph (no generic crawler or prefix-based trust):

- `auth.uid()`
- `public.guard_trip_person_participation()`
- `public.is_trip_member_or_creator(uuid)`
- `public.is_trip_owner_or_admin(uuid)`
- `public.ledger_grant_linked_personal_payment_history_1a()`
- `public.touch_updated_at()`
- `public.trip_event_canonical_json(json,integer)`
- `public.trip_event_keys(jsonb,text[],text[])`
- `public.trip_event_utc_timestamp(timestamp with time zone)`
- `public.trip_person_activation_security_check(boolean,boolean)`
- `public.trip_person_command_codec(text)`
- `public.trip_person_command_gate_transition_guard()`
- `public.trip_person_hash(text,jsonb)`
- `public.trip_person_intent_tuple(jsonb)`
- `public.trip_person_owner_admission(uuid,uuid)`
- `public.trip_person_receipt_guard()`
- `public.trip_person_receipt_lookup(uuid,uuid,uuid)`
- `public.trip_person_receipt_reply(public.trip_person_participation_receipts,boolean)`
- `public.trip_person_receipt_validate()`
- `public.trip_person_result_tuple(jsonb)`
- `public.trip_person_runtime_state()`
- `public.trip_person_set_command_gate(bigint,boolean)`
- `public.trip_person_set_participation(uuid,text)`
- `public.trip_person_transition_evidence_guard()`

Table integrity is exact for journey_members, trip_person_command_gate and
trip_person_participation_receipts: 14 policies, 7 noninternal triggers, 30 constraints
and 43 columns. Table owner, ENABLE/FORCE RLS; each policy's name/command/role set/
permissive mode/USING/WITH CHECK; each trigger's table/name/function/timing/events/
enabled state/deferrability/definition; every constraint's name/type/validation/
deferrability/definition and each column's type/nullability/default/identity/generated
state must match. Gate singleton PK/check, safe generation bounds, NOT NULL and
close-capacity constraint are included. Unexpected broader policies/triggers reject.
The private writer's exact two UPDATE columns are still checked separately.

OPEN holds the unchanged exclusive fence and row lock, verifies expected generation,
independently verifies checker code/owner/settings and inventory root, calls the full
checker, then updates. Failed OPEN never repairs drift or advances gate generation.
CLOSE does not call OPEN-only inventory; checker corruption cannot prevent trusted
admin CLOSE. Arbitrary destructive DBA replacement of the setter/guard itself remains
DBA trust scope; this is inventory integrity, not confinement of a superuser.

Mutual definition hashes avoid a self-reference cycle by normalizing only the clearly
marked inventory payload/root/checker pin literals. Everything else in the definitions
is hashed. OPEN/discovery/read-only external audit independently pin checker code and
its full payload SHA-256; checker independently pins setter/discovery definitions and
compares their literal roots/checker pins. Altering just the excluded payload cannot
pass the independent root check. No expected inventory is rebuilt from live drift at runtime. The independent anchor
above supplements these mutual checks; there is no mutable inventory registry/table.
Inventory root: `1f6bd2cb0fe9b6a9ddbd611d78e3c8fe33de63a6676032f6d412e228b936199a`.
Normalized checker hash: `c5079be7b4bc04db361519c173f581e3161f8d6dccb534fbf0c982454459ca5d`.

Discovery invokes this complete check and rejects indirect/owner/ACL/trigger/RLS
corruption. A DBA-replaced discovery body cannot authenticate itself: raw arbitrary
DBA SQL is never treated as reviewed state. Its canary definition fails independent
inventory/OPEN/bootstrap admission. No connector consumes it; runtime remains disabled.
This does not claim that a malicious superuser cannot return arbitrary SQL data.

Final validation: P2 Node 52/52 (parent included), including every five original reviewer
fixture patterns, restoration/positive OPEN+CLOSE, checker replacement and independent
payload-root tampering. Original `/private/tmp/otr-i2c5-independent/probes.sql` executes
verbatim and stops with expected UNSAFE_PARTICIPATION_ACTIVATION_INVENTORY at its first
body drift (`ON_ERROR_STOP on`); the remaining owner/API/trigger/policy patterns are
independently replayed by the 52-test harness. Failed subtransactions keep fixtures
intact; rollback restores the exact accepted inventory. Other final candidate checks
and counts appear below. No product/runtime activation or new credential.

Exact correction files (relative to the previous uncommitted I2C5 candidate):

- supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql
- supabase/tests/trip_person_activation_foundation.test.sql (restore fixture trigger before missing-row discovery)
- scripts/supabase/trip-person-activation-foundation.test.mjs
- scripts/supabase/trip-person-gateway-security-inventory.sql
- scripts/supabase/verify-baseline-artifacts.mjs
- supabase/schema-manifest.json
- docs/API_CONTRACT.md
- docs/DATA_MODEL.md
- docs/CURRENT_IMPLEMENTATION_STATE.md
- docs/architecture/TRIP_CANONICAL_A1_I2C5_ACTIVATION_SECURITY_FOUNDATION_REPORT.md

## Completed object inventory

Exactly one additive server migration:
`20261005000200_trip_person_participation_activation_foundation.sql`.
The old 72 are byte-identical; the chain is now 73.

| Object                                                                            | Result                                                                                                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trip_person_activation_reviewed_root()                                            | New immutable postgres-owned independent reviewed root; full definition pin, only private-reader/admin EXECUTE                                            |
| trip_person_command_gate                                                          | Existing singleton retained CLOSED; generation bigint NOT NULL DEFAULT 0, safe-integer bound and OPEN close-capacity constraint replace closed-only CHECK |
| trip_person_set_command_gate(bigint,boolean)                                      | New postgres-owned administrator-only generation CAS; exclusive existing activation fence                                                                 |
| trip_person_command_gate_transition_guard() / trip_person_command_gate_transition | New invoker guard verifies direct admin/current identity, actual exclusive lock and generation +1 before row transition                                   |
| trip_person_activation_security_check(boolean,boolean)                            | New postgres-owned fixed definition/role/ownership/effective-ACL inventory; admin/reader use only                                                         |
| trip_person_runtime_state()                                                       | New receipt-reader-owned fixed read-only state discovery; gateway EXECUTE only                                                                            |
| trip_person_activation_writer_read/update                                         | New Member SELECT/UPDATE RLS for private writer; exact dedicated session, UPDATE additionally requires open gate                                          |
| trip_person_activation_reader_gate                                                | New minimal gate SELECT policy for private receipt reader                                                                                                 |
| gateway session defaults                                                          | search_path pg_catalog; application_name otr-trip-person-command-v1; statement/lock/idle-in-transaction timeouts 10s/3s/10s                               |
| read-only provisioning inventory artifact                                         | scripts/supabase/trip-person-gateway-security-inventory.sql verifies externally provisioned LOGIN profile and database boundary; performs no provisioning |

No old command/receipt/helper/evidence function is replaced. Twenty-four exact activation-graph functions are pinned by definition/owner/ACL
and catalog properties; 20 historical dependencies are also checked before install. The
existing immutable-receipt, Actor/Trip/key privacy, CAS/ABA and Account/certificate/
reporting boundaries remain authoritative. Participation=false does not change
Person identity, role/status, Account identity or collaboration access.

## Gate and fence semantics

Installed and fresh default is CLOSED/generation0; deployment/restart never opens
or reinitializes missing state. Missing/corrupt state rejects, with no implicit insert.
An accepted administrative request requires direct session_user=postgres,
READ COMMITTED and expected-generation CAS after acquiring the exact exclusive
`hashtextextended('otr-trip-person-activation',0)` transaction advisory fence and
locking the singleton. The unchanged command holds its matching shared fence.
A stale administrative expected generation fails with
PARTICIPATION_GATE_GENERATION_CONFLICT/40001; OPEN→CLOSE→OPEN cannot revive it.
Every accepted transition, even same-state, increments once. The row guard verifies
actual pg_locks ownership and prevents raw writes without the fence/generation.

OPEN additionally verifies the exact security inventory and reserves at least one
remaining generation for CLOSE. At exhaustion the gate stays CLOSED; counters are
never reset/wrapped. Closure waits for admitted writers; their existing atomic
command/receipt commit finishes before closure returns, or later requests reject.
Bounded lock waits can fail and must not be reported as completed closure. Privileged
DBA DDL remains a trust boundary; no mechanism claims to restrain a malicious DB
superuser. Application identities have no admin setter or direct gate DML.

Administrator response loss requires actual generation/state readback, not automatic
advancement of an expected generation or blind replay under a fabricated fence.
Kill switch remains Backend feature OFF followed by admin-fenced DB CLOSED;
retain committed pairs/revisions, receipts, local results and unresolved original
keys. Exact authorized GET stays usable. No automatic undo/key regeneration.

## Privilege matrix

| Identity                               | LOGIN / ownership                                           | Allowed participation surface                                                                                                         | Denied boundary                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated gateway                      | NOLOGIN, no object ownership                                | Fixed SET(uuid,text), exact lookup(uuid,uuid,uuid), runtime_state(); existing reviewed utility baseline                               | No Member/gate/receipt table SELECT/DML, admin setter, private helper, schema CREATE, sequence rights, writer/reader membership or app SET ROLE |
| Private lifecycle writer               | NOLOGIN; existing fixed SET owner only                      | Existing receipt SELECT/INSERT and gate SELECT; new Member SELECT + UPDATE only participation_active/revision; exact existing helpers | No broad Member UPDATE, role/status/access/financial column mutation, Member INSERT/DELETE, gate UPDATE or runtime credential                   |
| Private receipt reader                 | NOLOGIN; existing admission/lookup plus new discovery owner | Existing Member/receipt SELECT; new gate SELECT and fixed security-check/reviewed-root EXECUTE                                        | No Member/receipt/gate DML or admin setter                                                                                                      |
| Direct postgres admin                  | Existing trusted deployment identity                        | Fixed generation-CAS setter and inventory; role/schema administration already trusted                                                 | Not a runtime credential or caller-controlled identity                                                                                          |
| PUBLIC/anon/authenticated/service_role | Unchanged                                                   | No new A EXECUTE/grants                                                                                                               | No discovery/setter/security-check execution or SET ROLE into gateway; JWT/GUC/header claims do not confer authority                            |

Reserved roles remain NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS/
NOREPLICATION. Gateway has no outgoing membership or application membership path.
The existing trusted postgres creator ADMIN membership has SET/INHERIT false; it
is not application SET ROLE access. Writer/reader administrative memberships retain
that same closed profile. Inventories include all ownership classes/pg_shdepend,
schema CREATE, direct/PUBLIC/inherited application EXECUTE, live table/column/
sequence rights, defaults, role flags/config and protected definition hashes.
Known baseline utilities remain exact signature+hash exceptions, not arbitrary
schema/name-prefix trust. Real extension-member/system routines are platform scope.
Hostile identity/object/capability reuse rejects transactionally without sanitation.

LOGIN provisioning remains outside migrations, matching accepted I2C4. No password,
token, deployment secret, connector or usable login is created. Future DBA/secret
management must provision the exact same direct identity and verify the read-only
artifact. That artifact rejects unsafe LOGIN flags and fails if effective database
CREATE/TEMP exists or CONNECT is absent. The local platform still grants ambient
PUBLIC TEMP: a separately reviewed database/environment policy is required before
LOGIN. This task does not revoke shared PUBLIC rights opportunistically or claim
that ambient database rights have disappeared.

## Discovery and still-pending activation

Fixed SQL discovery returns only commandVersion=1, receiptVersion=1, gateClosed,
gateGeneration and schemaVersion=20261005000200. It requires actual dedicated
session_user, validates exact inventory/definitions and checks state integrity.
No Actor, receipt, enumeration, password, caller capability or arbitrary SQL seam.
Missing/invalid state raises unavailable; future transport must validate/map these
facts to the accepted installed-state interface. No runtime connector is installed.

The final enabled predicate remains false in product code. Future admission still
requires ALL: healthy verified dedicated gateway, expected versions/inventory,
DB OPEN, Backend flag ON, rollout Actor/Trip allowlist, supported Mobile contract
and compatible schema/generation. DB OPEN alone does not enable HTTP/capability.
Existing exact errors remain 401 unauthenticated; 403 PARTICIPATION_FORBIDDEN for
current Organizer loss; 404 OPERATION_NOT_FOUND only for own-scoped absence;
503 REPLAY_UNAVAILABLE for unavailable/corrupt gateway results. Ambiguous intent
retains its original key, including authority loss after commit.

Still pending/blocked: real LOGIN/secret provisioning and environment privilege
review; actual fixed connector; Backend feature flag/allowlist activation;
request-time enabled predicate; compatible enabled Mobile contract/generation;
normal dispatch; Trip navigation/authoring generation fencing; device/live matrix;
independent review and any Hosted Dev/Production deployment. No item is upgraded
by local fixture OPEN tests. No Event/Source command, access leave/rejoin or UI scope.

## Validation — final candidate

All SQL execution used disposable project `otr-trip-ai2c5`, ports 603xx, separate
from the running canonical stack. No sibling or Hosted Dev/Production database
was modified/accessed. Logs: `/private/tmp/otr-ai2c5/`.

| Check                                                     | Exact result                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Two clean final 73-migration replays                      | Each PASS; distinct registered versions checked                                                                                          |
| Full SQL after each clean replay                          | Each 42 files / 1,472 assertions PASS (44 new A assertions)                                                                              |
| Independent fixed-root/joint forgery probes               | 15 Node tests PASS; parent included; external/DB/discovery agree, generation/drift untouched, corrupt-anchor CLOSE usable                |
| P2 fixed catalog drift probes                             | 52 Node tests PASS; parent included; independent root/checker and CLOSE positive control                                                 |
| Hostile reserved-role/object/capability reuse             | 63 Node tests PASS, parent included; polluted fixture survives failed install                                                            |
| Populated forward upgrade                                 | 1 Node test PASS; all 119 old tables' deterministic rows preserved, except additive gate generation0; old non-gate constraints preserved |
| Actual admin CAS / shared-exclusive fence                 | 3 Node tests PASS, parent included; one competing generation wins, exclusive closure waits                                               |
| I2C2 independent Node/Backend/PostgreSQL codec            | 1 original regression PASS via temporary container/path adaptation                                                                       |
| I2C2 real two-device CAS/replay/ABA/isolation/gate waiter | 1 original regression PASS via temporary admin-CAS fixture; no test-only broad Member grant                                              |
| Full Backend                                              | 29 files / 360 tests PASS                                                                                                                |
| Focused I2C2/C3/C4 + Account/client/DB/reporting          | 7 files / 108 tests PASS; 54 overlap Backend, combined unique 34 files / 414 tests                                                       |
| Manifest determinism / verifier / drift negatives         | Two manifests identical, expected comparator and verifier PASS; 1 count/same-count checksum negative test PASS                           |
| public/storage schema diff                                | Empty: no schema changes after final clean migration replay                                                                              |
| Typecheck / Backend build / full lint / UI guard          | PASS                                                                                                                                     |
| Changed-file Prettier / SQL whitespace / git diff         | PASS; SQL uses existing repository plain-SQL style, no formatter dependency                                                              |
| Historical 72 migration bytes                             | All identical to startup; includes server00600 and B-T3H00100                                                                            |
| SQLite/B/C/runtime bytes                                  | All src/backend and protected B/C/parser artifacts identical (515 checked); SQLite full migration file, including44/45, unchanged        |

Temporary I2C2 regression adaptation changes only module/container references and
fixture activation to the new admin CAS boundary; repo command/receipt implementation
and old Node harness stay unchanged. Existing SQL test expectation changes retain
all assertions: column count +1, private writer minimal column grants, and trusted
fixture OPEN/CLOSE through the new setter. No B/C assertion is deleted.

Final manifest: 119 tables/RLS tables, 4 buckets, 1,776 columns, 370 indexes,
207 policies, 149 triggers, 217 functions, 1,028 constraints. SHA-256:
`6675aef5dacbdae84baf5878ad0455f119f44bf3c1d3d3d17bc740d318825486`.
Final disposable state after concurrency cleanup: CLOSED/generation3, 73 versions,
exact NOLOGIN profile verified. Fresh/default generation0 was verified independently
on both clean replays; no product gate was opened. Disposable stack is stopped
without backup after evidence capture; canonical stack is preserved.

## Exact task-owned changed files

- supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql
- supabase/tests/trip_person_activation_foundation.test.sql
- supabase/tests/trip_person_command_foundation.test.sql
- supabase/tests/trip_person_participation.test.sql
- supabase/tests/rls_matrix.test.sql
- scripts/supabase/trip-person-activation-foundation.test.mjs
- scripts/supabase/trip-person-gateway-security-inventory.sql
- scripts/supabase/verify-baseline-artifacts.mjs
- scripts/supabase/verify-baseline-artifacts.test.mjs
- supabase/schema-manifest.json
- docs/API_CONTRACT.md
- docs/DATA_MODEL.md
- docs/CURRENT_IMPLEMENTATION_STATE.md
- docs/architecture/TRIP_CANONICAL_A1_I2C5_ACTIVATION_SECURITY_FOUNDATION_REPORT.md

## Required confirmations

- A1-I2C5 implementation complete: **YES**
- DB gate default CLOSED: **YES**
- DB gate opened in product runtime: **NO**
- dedicated gateway security identity defined: **YES** (reserved NOLOGIN; external LOGIN remains pending)
- real gateway secret provisioned: **NO**
- service-role fallback added: **NO**
- runtime connector enabled: **NO**
- capability enabled: **NO**
- SET_PARTICIPATION runtime enabled: **NO**
- TripPerson/access semantics changed: **NO**
- historical 72 migrations changed: **NO**
- SQLite 44/45 changed: **NO**
- Production/Hosted Dev accessed: **NO**
- commit: **NO**
- push: **NO**

- replaced runtime_state body can pass inventory: **NO**
- runtime_state owner drift can pass inventory: **NO**
- indirect trip_event_keys drift can pass inventory: **NO**
- PUBLIC EXECUTE leakage can pass inventory: **NO**
- authenticated/service_role EXECUTE leakage can pass inventory: **NO**
- disabled gate trigger can pass inventory: **NO**
- weakened gate constraint can pass inventory: **NO**
- disabled RLS can pass inventory: **NO**
- broadened writer UPDATE policy can pass inventory: **NO**
- OPEN repairs hostile drift automatically: **NO**
- OPEN succeeds with corrupt security inventory: **NO**
- CLOSE kill-switch semantics weakened: **NO**
- gateway changed from NOLOGIN: **NO**
- SQLite changed: **NO**
- B-T3H/C-I3G protected artifacts changed: **NO**

- mutually rewritten normalized root literals can self-authenticate OPEN: **NO**
- forged inventory payload/root can satisfy independent reviewed anchor: **NO**
- disabled trigger + forged root can OPEN: **NO**
- broadened policy + forged root can OPEN: **NO**
- indirect helper drift + forged root can OPEN: **NO**
- forged discovery can report healthy reviewed state: **NO**
- failed forged OPEN advances generation: **NO**
- failed forged OPEN repairs drift: **NO**
- external audit and DB OPEN disagree on forged inventory: **NO**
- malicious-superuser confinement claimed: **NO**

STOP — REVIEW PENDING / RUNTIME CLOSED.
