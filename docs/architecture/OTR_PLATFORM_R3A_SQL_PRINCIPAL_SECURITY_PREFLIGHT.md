# Platform R3-A SQL Principal Security Preflight

Date: 2026-10-09 (Pacific/Auckland). Role: Platform Security Architect / SQL Principal Owner.
Status: proposed contract; documentation and read-only audit only.

## Decision and readiness

**Recommend Option B:** retain `otr_trip_source_command_gateway` as NOLOGIN with
its accepted command grants; add `otr_trip_publication_catalog_reader` as the
dedicated Backend-only Catalog login. Change only the protected Catalog root's
session allowlist and add its exact EXECUTE grant. Preserve the existing gateway's
Catalog grant and all command/publisher contracts.

**Builder readiness: YES for a separately authorized dormant SQL/Backend Builder
and disposable real-PostgreSQL proof, after Owner acceptance of this contract.**
Hosted provisioning/runtime readiness: **NO**. This report grants no execution
authority. Owner must accept the actor-trust and ambient-PUBLIC limits below.

No role, LOGIN, ACL, grant, credential, migration, runtime, app/device, deployment,
commit, push or merge action occurred. Production was not accessed.

## Source gate and scope

Local `main`, `origin/main` and actual remote `refs/heads/main` independently matched
`d263503b6e6ced9edee977508ffeff94e90ad4df`. Remote verification used `git ls-remote`;
the sandbox DNS failure was followed by a successful authorized read-only retry.
No fetch or canonical ref advancement occurred. Fresh detached worktree:
`/Users/xoery/.codex/worktrees/platform-r3a-principal-preflight/otr-mobile-canonical`.
The original dirty checkout, existing worktrees and DEV Test environments were preserved.

Read current-state first, mandatory project documents and relevant accepted
Source/Import security, Platform membership/Composer and Transport contracts.
Acceptance inputs include:

- Transport Rollout R1, retained at
  `/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`; SHA-256
  `60930226bfc295e729180e658f05cda3232bb83aff10814f0212889b427dee2f`.
- [Authenticated Transport preflight](OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_PREFLIGHT.md),
  [Builder/F1 evidence](OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_BUILDER_REPORT.md),
  [security review and appended F1 PASS](OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_INDEPENDENT_SECURITY_REVIEW.md).
- [R2-SQL Builder/F1](OTR_PLATFORM_TRANSPORT_R2_SQL_DRIVER_BUILDER_REPORT.md),
  [independent review and appended F1 PASS](OTR_PLATFORM_TRANSPORT_R2_SQL_DRIVER_INDEPENDENT_SECURITY_REVIEW.md).
- [Source command security](TRIP_CANONICAL_C_I3D_PROTECTED_SOURCE_COMMAND_FOUNDATION_REPORT.md),
  [execution journal](TRIP_CANONICAL_C_I3H_DURABLE_EXECUTION_JOURNAL_REPORT.md),
  [verified host-context boundary](CP14_VERIFIED_CALL_CONTEXT_V1.txt).
- [R3 accepted execution](OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md) and
  [installed forward provenance](../../supabase/dev-forward/r3-v1/README.md).

Ancestry checks against HEAD passed for Capture/SQLite51 `914e854`, SQLite52
`138b55c`, SQLite53 `792141a`, P2b-A `094cf3b`, P2c `a2ad2ef`, authenticated
Transport `afcb69c`, SQL Driver `505991b`, and Native Receiver `d263503`.
The merge sequence retains all accepted histories; SQLite53 integration is
`7273ac0`, Transport integration `ad52275`, P2c integration `2a42ec6`, Driver
integration `b35b369`. Historical pending verdicts are superseded by accepted
targeted rechecks, not new acceptance here. No implementation test was rerun.

Only this report and a short current-state handoff are delivered. No legacy Web
inspection, device operation, provider call or protected business-data read occurred.

## Actual Hosted DEV structural evidence

Four metadata-only queries ran through the existing approved Supabase CLI 2.117.0
Management API resolver, explicit DEV project `tuqigdxrvrerfewsxqgm`, with the
previously approved nonsecret DB-password placeholder. No credential was retrieved,
printed, copied or created. Every query used `BEGIN READ ONLY`,
`search_path=pg_catalog`, statement timeout5s, lock timeout1s and `ROLLBACK`.
Observed 2026-10-09 18:56:57–18:59:16 NZDT; operator/session `postgres`, database
`postgres`, transaction read-only ON. This operator mechanism is audit-only.

| Observation                     | Actual result                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current OTR catalog commitment  | `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`, exact accepted post-Ledger-forward match                                                                                                                             |
| R3 lineage                      | `otr-r3-dev-v1`; source `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`; baseline `f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52`; installed `2026-10-07T22:33:45.460115+00:00`; CLOSED_ONLY_BETA / SERVER73_OPEN_DEFERRED |
| Historical migration commitment | 68 rows; tail `20261004000300`; full-row hash `971037caca92c44f5f7b817b45ff62b8a27124025caa7347d41187ce75ff105c`, unchanged                                                                                                              |
| Protected root                  | `public.trip_source_read_import_catalogs(actor uuid,trip uuid)`; STABLE, SECURITY DEFINER; owner `otr_trip_source_writer`; `search_path=pg_catalog`                                                                                      |
| Root definition SHA-256         | `e17427b93feff1082e2b49b0b1c939be523dcde51095bd316138812226dac550`, exact accepted R3 match                                                                                                                                              |
| Root ACL                        | writer and command gateway EXECUTE only; no PUBLIC. Effective EXECUTE false for anon/authenticated/service_role, true for writer/gateway                                                                                                 |
| Identity rule                   | `current_user='otr_trip_source_writer'` and `session_user='otr_trip_source_command_gateway'`, plus `trip_source_admission(actor,trip,false)`                                                                                             |
| Source roles                    | writer, command gateway and operation reader: NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS, NOREPLICATION; no role settings                                                                                    |
| Gateway effective authority     | zero owned shared-dependency objects; zero outgoing memberships; no non-system schema CREATE; database CONNECT/TEMP true, CREATE false; no public business-table/column rights                                                           |
| Administrative memberships      | postgres-only incoming Source-role administrative records; INHERIT/SET false. These are not runtime gateway-to-writer edges                                                                                                              |
| Tables/RLS                      | All13 projection families present, ENABLE/FORCE RLS; Trip/legacy Member/Journey Member admission tables ENABLE RLS without FORCE, as accepted                                                                                            |
| Gates                           | Source/Event/Person/Import/provider runtime CLOSED; proposed reader absent                                                                                                                                                               |

Direct helper definition hashes also match accepted R3:

| Helper                                     | Owner / behavior                          | SHA-256                                                            |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| `trip_source_admission(uuid,uuid,boolean)` | operation reader, STABLE SECURITY DEFINER | `fe5a0e098c9593cb3f1e6cedb3b776b1727a4c3edb91f48d7141900d303e9ea4` |
| `trip_import_observation(jsonb)`           | postgres, immutable invoker normalization | `65bac778fe16e445e7436e80bb5234134854a8772d16335900cfc82737ccb53f` |
| `trip_event_canonical_json(json,integer)`  | postgres, canonical serialization         | `69f85a44804bf8a47f84a6cfc30f9c79552c862e2f2903019c5f94b5c32cc132` |
| `trip_event_utc_timestamp(timestamptz)`    | postgres, UTC serialization               | `d22bcd8ad3a6cbd38100a3efd7dc6d554ec381847ef7231fa56b7a653f110a04` |

The root executes admission under its separate definer reader, then reads private
Source/catalog rows under writer SELECT policies. The login itself needs neither
helper EXECUTE nor table SELECT. Writer has existing command capabilities, but
the fixed STABLE read body does not call them. Preserve qualified names, helper
ACLs, owners, policies and guards; reader membership in the writer is forbidden.

This verifies installed structure, not successful direct-principal authentication,
live Catalog contents, Auth/Storage preservation, TLS enforcement or direct endpoint
reachability. No protected Catalog function was invoked in this audit.

Private evidence: `/private/tmp/otr-r3a-principal-evidence-20261009/`, containing
four query/result pairs, verifier summary and metadata-only definitions/ACLs.
Result SHA-256 values:

| File                     | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `contract-result.json`   | `9bc40a382731289b7c3a0153f488e6791341b1a36276d26883ed6a2db26b5099` |
| `commitment-result.json` | `f689887f827a50b611f26939381796b2dc38262ae56a23c047090cf677088397` |
| `security-result.json`   | `343a02d05cc0e5f49fa3f599f98569a1f85de15a7cb36292f2bab96ef40bc69f` |
| `surface-result.json`    | `2cc2d98de2a59e15532da7b7d7b810be4849818145c10e518e7cd51ca3078603` |

## Current gateway roots and dependency impact

Actual effective public EXECUTE includes these14 non-PUBLIC Source/Import roots:

| Purpose                               | Exact signatures in `public`                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source commands                       | `trip_source_acquire_source(uuid,text)`, `trip_source_prepare_representation(uuid,text)`, `trip_source_verify_representation(uuid,text)`, `trip_source_replace_material(uuid,text)`, `trip_source_mark_representation_lost(uuid,text)`, `trip_source_recover_representation(uuid,text)`, `trip_source_upload_original(uuid,text)` |
| Exact historic recovery               | `trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text)`                                                                                                                                                                                                                                                                     |
| Import publication/preparation        | `trip_source_publish_flight_run(uuid,uuid,text)`, `trip_source_prepare_confirmation(uuid,uuid,text)`                                                                                                                                                                                                                              |
| Slot dispatch/finalization/revocation | `trip_source_mark_slot_dispatch(uuid,uuid,uuid,bigint,uuid,text)`, `trip_source_finalize_event_slot(uuid,uuid,uuid,bigint,uuid,uuid)`, `trip_source_revoke_undispatched_slot(uuid,uuid,uuid,bigint,uuid,text)`                                                                                                                    |
| Catalog read                          | `trip_source_read_import_catalogs(uuid,uuid)`                                                                                                                                                                                                                                                                                     |

Accepted C-I3D command/replay and CP13A publication/confirmation/slot workflows
depend on these grants and exact session identity. Scoped production-code searches
found no direct invocation of those command SQL names; existing code is dormant
or uses injected owning seams. This does not prove grants are redundant. CLOSED
gates prevent present activation, but are not a durable read-only privilege
guarantee. Revoking command grants would alter accepted future execution/recovery
contracts. The separate execution journal roots belong to
`otr_trip_source_execution_gateway`; they are not grants of the command gateway.
`backend/src/tripSourceExecutionRecovery.ts` also retains command-principal pins
for responsibility evidence; do not rename those to the Catalog reader.

### Ambient privileges that a new login will inherit

The wider effective audit found61 PUBLIC EXECUTE routines reachable in non-system
schemas: seven public invoker trigger-only hooks, six managed invoker event-trigger
hooks, and48 extension routines (crypto/UUID/statistics). It also found SELECT
capability on `extensions.pg_stat_statements` and
`extensions.pg_stat_statements_info`. No statistics rows were selected. Database
ACL grants PUBLIC CONNECT/TEMP; public schema grants PUBLIC USAGE. These are
ambient platform capabilities, not grants unique to the gateway.

PostgreSQL privileges are additive; a per-role REVOKE cannot deny PUBLIC rights.
NOINHERIT does not remove PUBLIC. See [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html).
Therefore this proposal guarantees **no persistent business writes and exactly
one dedicated business read root**, not zero effective capabilities outside it.
TEMP permits temporary objects; invoker routines and catalog visibility retain
resource/metadata exposure. Fixed qualified SQL avoids temp-schema substitution,
but password holders are not confined to the application's five-second protocol.
Owner must accept this inventoried ambient surface and require independent
stats-visibility/extension reachability checks before Hosted provisioning. If zero
TEMP or zero extension/statistics access is required, stop for a separate shared
PUBLIC-ACL compatibility design; neither option can obtain it by role-local REVOKE.
Do not silently harden managed objects or rewrite unrelated shared grants here.

## A/B comparison

| Criterion                    | A: convert command gateway to read-only LOGIN                                                   | B: separate Catalog reader                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Actual least privilege       | Must revoke13 non-Catalog roots and audit PUBLIC; changing LOGIN alone is unsafe                | Dedicated root grant, no command/owner membership; same explicit ambient limits                     |
| Existing commands/publishers | Breaks accepted command/replay/Import grant contracts                                           | Preserves all existing grants and session predicates outside Catalog read                           |
| Function/ACL delta           | Catalog body unchanged; broad gateway grant removal and profile/settings change                 | One root session-list change, one EXECUTE grant, one new restricted role/profile                    |
| RLS/definer                  | Same private owner policies; login must not acquire writer privileges                           | Same; root reaches existing writer/read helpers, no new policy or table grants                      |
| Session/direct Auth          | Existing name authenticates directly                                                            | New exact name authenticates directly; Backend changes two fixed expectations                       |
| Credential compromise        | Read disclosure; later restoring command grants expands that same leaked credential's authority | Read disclosure/resource abuse; no command-root path, even after future command gates open          |
| R3 lineage                   | Role plus many ACL deltas, wider compatibility proof                                            | Additive role/root/ACL and separate forward commitment; historical bytes retained                   |
| Rollback                     | Restore multiple command grants and disable login; consumers may depend on intermediate state   | Disable reader, terminate sessions, revoke its grant and restore original root; commands unaffected |
| Future command gateway       | Must repurpose/re-expand a reader credential or redesign later                                  | Existing NOLOGIN command gateway remains reserved for separate provisioning                         |

B is minimum risk despite changing the fixed Backend identity: it separates read
credentials from accepted command capabilities without introducing another read
function, SQL service, JWT verifier or authentication framework.

## Exact proposed SQL and Backend contract delta

### Principal and effective grants

Target runtime role name: **`otr_trip_publication_catalog_reader`**.
Attributes: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
NOREPLICATION, NOBYPASSRLS, CONNECTION LIMIT1. No owned objects, outgoing
memberships, runtime incoming memberships, ADMIN/SET/INHERIT paths to any other
principal, table/column/sequence grants, schema/database CREATE or grant options.
Only a required trusted postgres administrative membership record may remain,
with ADMIN true, INHERIT false, SET false; no application membership is allowed.
Inspect actual membership options, not just role-level NOINHERIT.

Required explicit grants only:

```sql
GRANT CONNECT ON DATABASE postgres TO otr_trip_publication_catalog_reader;
GRANT USAGE ON SCHEMA public TO otr_trip_publication_catalog_reader;
GRANT EXECUTE ON FUNCTION public.trip_source_read_import_catalogs(uuid,uuid)
  TO otr_trip_publication_catalog_reader;
```

These are proposed statements, not executed SQL. Preserve existing root writer/
command-gateway ACLs, and no PUBLIC/anon/authenticated/service_role EXECUTE.
No helper grant is required. No default ACL may expose new business objects to
the reader or PUBLIC. Verify effective grants across every non-system schema,
extension objects, live columns, recursive memberships, ownership and definer
call paths; compare against the explicit ambient manifest above.

Defense-in-depth role settings: `search_path=pg_catalog`,
`default_transaction_read_only=on`, `statement_timeout=5000ms`,
`lock_timeout=1000ms`, `idle_in_transaction_session_timeout=5000ms`.
They do not establish write denial; role holders can change ordinary session
settings. Root ACLs, fixed code and absence of writable capability establish it.
Connection limit1 is the initial single-process DEV budget; scaling/overlap needs
separate capacity approval, not automatic adjustment.

### Protected root identity and authorization

Replace only the first guard's session predicate, keeping this exact rule:

```sql
IF current_user <> 'otr_trip_source_writer'
 OR session_user NOT IN (
   'otr_trip_source_command_gateway',
   'otr_trip_publication_catalog_reader'
 )
 OR NOT public.trip_source_admission(actor,trip,false)
THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
```

Use forward `CREATE OR REPLACE FUNCTION` preserving signature, return type,
STABLE/SECURITY DEFINER, owner, `search_path=pg_catalog` and every remaining body
byte/semantic. No wildcard/prefix, membership-based identity, SET ROLE, session
impersonation, service_role, public RPC or caller JWT/GUC flags. Retaining the old
gateway in this exact list preserves its existing read/recovery contract; it
does not allow the new reader into any command guard.

The SQL admission remains creator, legacy `trip_members`, or linked
`journey_members`; `participation_active` is not authorization. HTTP derives actor
exclusively from existing verified Auth, rejects caller actor parameters and
retains early Trip admission plus current protected SQL admission.

**Trust limit:** SQL does not verify end-user Auth and cannot distinguish a
compromised dedicated login supplying another legitimately admitted actor UUID.
A stolen reader credential can read that actor's scoped Catalog. It cannot obtain
command EXECUTE through this delta. Owner must accept that Backend authentication
is the trusted actor-binding boundary; no false direct-SQL foreign-actor denial
claim or new signed-attestation protocol is introduced.

### Forward artifact and fixed Backend delta

Author one new R3 DEV forward artifact/version after approval, e.g.
`otr-r3-dev-v1-catalog-reader-1`; do not allocate or rewrite historical Server1–84
migrations or installed Ledger forward SQL. Contract implementation creates the
restricted role **NOLOGIN, PASSWORD NULL** initially, grants only the above and
adjusts the root. LOGIN/password/expiry activation is a separate secret-provisioning
gate. Reject an existing polluted role instead of silently sanitizing it.

Backend changes are limited to:

1. `backend/src/tripPublicationCatalogPgConnection.ts`: fixed pg `user` becomes
   `otr_trip_publication_catalog_reader`, with no configurable user override.
2. `backend/src/tripPublicationCatalogRead.ts`: actual same-lease
   `SELECT session_user` must equal that new exact name. Do not accept both names
   in the Backend; SQL's old-name compatibility is separate.
3. Update the two closest unit test files and
   `tripPublicationCatalogPgConnection.integration.ts` login/identity fixtures;
   add proposed-forward SQL tests. Retain the historical-migration assertions
   unchanged and add assertions for the effective forward contract.
4. Incremental API/current-state/forward provenance documentation and an ADR after
   Owner acceptance. Leave `server.ts` unprovisioned during dormant implementation.

Keep the fixed leased READ COMMITTED READ ONLY sequence, primary verification,
Pool/max1,1s checkout/rollback,5s SQL/15s Backend/30s Mobile limits, verified TLS,
strict original JSON text admission, uncertain-socket retirement and safe errors.
No route, config-user option, generalized SQL wrapper or Mobile change is needed.
Driver principal fixtures are mechanical tests; the static R2 fixture function
does not prove real protected SQL semantics.

### Read behavior with CLOSED command gates

Catalog read remains independent of Source/Import command activation. No gate
opening or mutation is required; a complete empty Actor/Trip Catalog is valid.
Preserve all13 arrays and their actor-private projection,13 LIMIT65 probes,
max64 rows/family and4,194,304-byte fail-whole bound. No pagination, subset,
silent truncation, FAILED-to-success or unavailable-to-empty conversion.
Preserve Backend/Mobile strict original-text parsing before schema/canonicalization,
duplicate-key/unsafe-number/UTF-8 rejection, private/no-store responses and local
Account/generation/cancellation/final owning SQLite admission.

## Independent security proof and tests

**Disposable real PostgreSQL proof before Hosted provisioning: feasible and
required. Not executed in R3-A.** Reuse accepted R3 baseline/local fixture and
Ledger forward on two fresh isolated cached PostgreSQL17 instances, then apply
the candidate reader forward. Use task-only internal networks/no published ports,
synthetic secrets and independently authenticated client sessions. Do not load
Hosted backups, credentials or existing containers. Preserve fixture provenance;
missing managed extension routines require labeled compatibility evidence, not
a claim of complete Hosted equivalence.

| Test                         | Required independent result                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real reader authentication   | Session/current user equal reader outside function; same PID/lease; root executes as writer; primary/read-only/TLS verified                                                                                                                        |
| Positive current Trip        | Creator, legacy member and linked member read own actor Catalog while all command gates CLOSED; read-only guest/participation=false retains accepted read behavior                                                                                 |
| Complete Catalog             | Real13-family nonempty fixture, historical/FAILED/identity-only/unreferenced siblings retained; valid empty distinct from unavailable                                                                                                              |
| Wrong principal, ACL         | Real wrong LOGIN without EXECUTE denied; anon/authenticated/service_role capabilities false; Backend wrong actual principal503 before root                                                                                                         |
| Wrong principal, root guard  | In disposable fixture only, grant a wrong LOGIN exact root EXECUTE; authenticate directly and require42501/FORBIDDEN. This distinguishes identity guard from ACL denial                                                                            |
| Trip revocation              | Remove every creator/legacy/linked access path in fixture; subsequent root denies. Revocation committed before Catalog statement wins over early HTTP admission; earlier completed snapshot does not claim ongoing access                          |
| Foreign actor/Trip           | Actor without Trip access denied; actor B with legitimate shared Trip sees only B scope. Bearer B plus supplied A is rejected/ignored as authority by HTTP; cannot expose A rows                                                                   |
| Compromised-login limitation | Record that direct reader+admitted actor A can read A; SQL is not an independent end-user verifier. Treat as the documented trust boundary, not a passing foreign-actor denial test                                                                |
| Command-root denial          | For every13 non-Catalog gateway roots above plus execution/Person/Event/control-plane roots, reader has no effective EXECUTE; actual syntactically valid calls fail ACL42501 in READ WRITE sessions, not merely READ ONLY or CLOSED-gate rejection |
| Gate independence            | Disposable-only openable test seam may bypass a command gate to prove ACL denial persists; never open Hosted gates or alter accepted closed production constraints                                                                                 |
| Direct writes/DDL            | SELECT/DML on business relations, column rights, sequences, protected helper execution, object ownership/CREATE and membership escalation denied; PUBLIC TEMP/statistics/extensions separately characterized                                       |
| Bounds and original text     | 64/65 per family; exact4MiB/+1; missing family, duplicate/escaped duplicate keys, unsafe numeric tokens, invalid UTF-8 and foreign scope fail whole; zero SQLite admission writes                                                                  |
| Driver preservation          | Fresh real TLS hostname/chain negatives; no Pooler/direct alias assumption; cancel/lost BEGIN/read/COMMIT/ROLLBACK and rotation/shutdown physically retire sockets with fresh subsequent PID                                                       |
| Compatibility and rollback   | Two independent candidate installs produce identical inventories; old gateway contract/command grants retained; reviewed reverse delta restores original root/ACL and commitment without deleting evidence                                         |

Run closest Backend Auth/Trip/Catalog/Driver, Mobile strict Transport, Account,
SQLite51–53 membership and P2b-A/P2c regressions; typecheck/lint/UI guard/Backend
build and changed-file formatting. Require independent source/ACL/definer-path
review and real SQL evidence, not self-reported Builder PASS. Add fixture checks
for statistics redaction and inability to invoke trigger/event-trigger hooks
outside their permitted contexts. No broad unrelated framework or tests are needed.

## Credentials, direct-primary TLS and operational contract

Backend-only dedicated DEV secret in the existing restricted host/service secret
mechanism; no Mobile/Expo public env, Git, report, CLI argument, URL or raw log
exposure. Use a fresh generated high-entropy password with SCRAM-SHA-256 storage
and TLS-protected provisioning through an approved nonlogging operator mechanism.
Never place password/verifier bytes in migrations or catalog evidence.

Proposed initial policy for Owner decision: finite password validity of30 days,
rotate by day14 and immediately on compromise; no infinite validity. Record UTC
expiry, secret version, responsible operator and next rotation outside Git.
VALID UNTIL governs password authentication, not established sessions; see
[PostgreSQL CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html).
NOLOGIN/password rotation alone does not evict existing connections.

Rotate by closing new read admission, canceling/retiring active and idle pool
sockets, authorized password/expiry update, terminating all remaining reader
sessions via trusted administration, verifying zero old backends, loading the new
private secret and rebuilding the same fixed-principal factory. Check old-password
login fails and new TLS/session/positive/negative acceptance passes before reopening
reads. Avoid dual-reader roles/overlapping pools. Emergency revoke first disables
LOGIN and root EXECUTE, terminates sessions and closes Backend injection; preserve
local accepted evidence and classify remote reads unavailable. The ordinary login
must not receive session-termination privileges.

Only verified **Direct Primary TLS** is admissible. Expected DEV hostname candidate
`db.tuqigdxrvrerfewsxqgm.supabase.co:5432`, database `postgres`, remains unverified
from the actual Backend host in this audit. At the separately authorized gate,
confirm the project connection-panel endpoint, DNS/address routing and Backend
IPv6 or approved direct IPv4 reachability; establish chain and hostname validation
against that exact approved host and trusted CA, and prove `pg_is_in_recovery()=false`,
real session_user and TLS on the application's connection. A hostname spelling
or a false recovery flag alone does not prove routing through a direct endpoint.
Capture content-free endpoint/CA provenance and certificate validity evidence;
no rejectUnauthorized=false, trust-all callback, SSL URI override or plaintext
fallback. Server-side TLS enforcement is not verified here and needs separate
operator evidence; do not change shared platform configuration under this gate.

Supabase documents the direct/session connection and certificate options in
[connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
Those documents do not certify this DEV endpoint. R1's conditional Session Pooler
candidate is superseded by accepted R2's direct-only implementation for this
minimum rollout. If direct reachability fails, withhold reads; no Session/Transaction
Pooler, replica, service_role/RPC, SET ROLE or generic SELECT fallback. Any future
pooler mode requires its own Owner contract, driver and real identity/retirement review.

## R3 forward commitment and rollback evidence

Freeze current commitment H0 above and exact root/role/ACL/dependency inventories.
Preserve original baseline SHA, installed lineage row, historical68 hash, Server
migration bytes and installed Ledger forward. Candidate SQL adds a separate versioned
forward record, source SHA and expected catalog H1 for the NOLOGIN dormant role/root
delta. Compute H1 from two independent clean rehearsals with the exact accepted
`search_path=pg_catalog` inventory. Do not invent its value in this preflight.

Secret provisioning creates a separately reviewed state H2 because LOGIN/profile
changes alter the catalog. Pin expected H2 before execution. Supplement the R3
catalog with a credential-free principal manifest for connection limit, password
expiry, settings, effective global/PUBLIC/extension capabilities and grant options:
the existing hash does not cover every role attribute or secret lifecycle fact.
Rotation expiry changes need that supplemental evidence even when the main catalog
hash is unchanged. Never repin H0 silently, omit the new role from the verifier or
claim Server73 OPEN equivalence. Post-state assertions must show only approved
root/role/ACL changes and all gates still CLOSED.

Before Hosted forward execution, prepare independently reviewed rollback SQL and
expected reverse inventory. Operational rollback first closes Backend reads,
disables reader LOGIN, revokes its root EXECUTE and terminates its sessions. Restore
the root's exact original definition and ACL through a separate recorded reverse
artifact; preserve the command gateway and helper grants. Retain the reader as
NOLOGIN/PASSWORD NULL with no dedicated grants for audit, recording a distinct
rollback commitment; do not falsely call that H0. If complete removal is separately
approved, drop only that unowned role after exact dependency checks, and then prove
H0 equivalence. Forward/reverse records remain append-only. No destructive rebuild,
history fabrication, business-row/Source/receipt deletion or SQLite rollback.

## Owner decisions and rollout gates

Owner decisions required:

1. Accept B, exact reader name, preserved old-gateway Catalog compatibility and
   the one-root/two-fixed-Backend-expectation delta.
2. Accept trusted Backend actor derivation and the documented stolen-SQL-credential
   disclosure radius; accept the inventoried ambient PUBLIC surface subject to
   independent proof, or commission a separate shared-ACL design.
3. Accept single-process connection limit1, proposed30-day validity/day14 rotation,
   secret custodian/store and approved direct endpoint/CA/network evidence process.
4. Authorize only the next dormant Builder/disposable proof and independent review;
   approve forward/version/rollback and provisioning as separate later checkpoints.

| Gate                             | Required output / authorization                                                                                                                                                                         | Production needed? |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| R3-A Owner review                | Accept this design or return a concrete correction                                                                                                                                                      | No                 |
| SQL/Backend dormant Builder      | New forward artifact, fixed identity changes, fixtures, two real disposable proofs, expected H1/H2/rollback inventories; no Hosted/secret/injection                                                     | No                 |
| Independent security review      | Audit effective authority/definer paths and replay real positive/negative tests; Owner accepts exact reviewed artifact                                                                                  | No                 |
| Hosted DEV forward               | Fresh H0/lineage check, apply approved NOLOGIN/PASSWORD NULL artifact once, verify H1/closed gates/history; no secret or runtime activation                                                             | No                 |
| Secret/LOGIN provisioning        | Explicit Owner approval, secure password/expiry/profile activation and expected H2/supplemental manifest; no Backend injection                                                                          | No                 |
| Backend injection/endpoint       | Separate approval for actual host TLS/direct-primary verification and private fixed-principal injection, bounded pool shutdown/rotation; no Composer/device activation                                  | No                 |
| Live read acceptance             | Approved synthetic actors/fixtures, actual protected positive/negative reads and authenticated HTTP, byte/text/retirement/zero-write evidence; no fixture mutation without separate setup authorization | No                 |
| Native/owning runtime acceptance | Separately approved DEV Test artifact/device and exact owning installation acceptance; accepted dormant receiver code is not runtime evidence                                                           | No                 |

Remote availability/auth failure preserves local offline access and accepted cached
evidence. SQLite51–53, durable intent/UNKNOWN history, Account generation and final
owning transaction remain unchanged. Do not activate Composer/Integrated C4,
C5/C9, Source/Import/Event/Person commands, providers, scheduler or domain writes.

Not checked: real proposed-role login/SQL behavior, direct-host TLS/reachability,
credential lifecycle, application/device operation or a new test-suite run. Actual
Hosted evidence is structural only; provisioning/live readiness remains NO.

**STOP — R3-A SQL PRINCIPAL SECURITY PREFLIGHT / OWNER REVIEW REQUIRED.**
