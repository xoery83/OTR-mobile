# Platform R3-A SQL Principal dormant contract Builder

Date: 2026-10-09 (Pacific/Auckland). **Ready for Independent Security Review: YES.**
Owner accepted Option B with conditions. This implements a dormant local contract;
Hosted migration, credentials, endpoint attestation and runtime activation remain
separate gates. No Hosted DEV/Production operation, actual credential provisioning,
deployment, device operation, commit, push, merge or rebase was performed.

## Source and accepted evidence

Local `main`, `origin/main` and actual GitHub remote `main` were verified at
`d263503b6e6ced9edee977508ffeff94e90ad4df`. A fresh detached managed worktree was
created at that exact commit:
`/Users/xoery/.codex/worktrees/platform-r3a-principal-builder/otr-mobile-canonical`.
Because that managed path requires filesystem escalation, implementation and checks
used a byte-preserving Git archive in `/private/tmp/otr-r3a-builder-20261009/source`,
then the scoped result was saved to the Builder worktree. Other worktrees were not
edited, reset, switched or cleaned. Existing DEV containers and device sessions
were not operated.

Read current state, mandatory project contracts, API/Data Model/Offline Sync,
accepted Platform security contracts and the accepted R3-A preflight. The
[preflight](OTR_PLATFORM_R3A_SQL_PRINCIPAL_SECURITY_PREFLIGHT.md) is copied verbatim
from the prior isolated audit: SHA-256
`bf661d82eead63c393976943f47840ebff5062ca109ce99c11af1fcbe19924fc`.
Its accepted R1, R2-SQL Builder/independent review, Transport security/F1 review,
Native receiver and R3 Hosted forward evidence remain authoritative. R1's retained
artifact is `/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`,
SHA-256 `60930226bfc295e729180e658f05cda3232bb83aff10814f0212889b427dee2f`.
The source contains accepted SQLite51–53, P2b-A, P2c, authenticated Transport,
SQL Driver and Native Receiver ancestry. No source in those subsystems changes
except the two Backend principal literals and their tests.

## Exact changed files

Paths are relative to the isolated Builder root above. Existing files:

- `backend/src/tripPublicationCatalogPgConnection.ts` — fixed pg user becomes Reader.
- `backend/src/tripPublicationCatalogRead.ts` — same-lease identity requires Reader.
- `backend/src/tripPublicationCatalogPgConnection.test.ts` — fixed-principal fixtures.
- `backend/src/tripPublicationCatalogPgConnection.integration.ts` — disposable socket fixture principal.
- `backend/src/tripPublicationCatalogRead.test.ts` — Reader fixtures, old-gateway rejection and forward/body preservation check.
- `docs/API_CONTRACT.md` — exact Reader/SQL compatibility and dormant status.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` — short pending-review handoff prepended; prior evidence retained.

New files:

- `supabase/dev-forward/r3-v1/202610090001_publication_catalog_reader.sql`.
- `supabase/dev-forward/r3-v1/202610090001_publication_catalog_reader.rollback.sql`.
- `supabase/dev-forward/r3-v1/publication-catalog-principal-inventory.sql`.
- `supabase/dev-forward/r3-v1/publication-catalog-reader-manifest.json`.
- `supabase/dev-forward/r3-v1/publication-catalog-reader-proof.json`.
- `scripts/supabase/test-r3-catalog-principal.py`.
- `scripts/supabase/test-r3-catalog-principal-text.ts`.
- `docs/adr/2026-10-09-dedicated-publication-catalog-principal.md`.
- `docs/architecture/OTR_PLATFORM_R3A_SQL_PRINCIPAL_SECURITY_PREFLIGHT.md` — accepted artifact, unchanged.
- `docs/architecture/OTR_PLATFORM_R3A_SQL_PRINCIPAL_BUILDER_REPORT.md` — this report.

No package/lockfile, server.ts, Native source, Composer, SQLite migration,
historical Supabase migration or installed Ledger forward changes.

## Dormant SQL and Backend contract

The version is `otr-r3-dev-v1-catalog-reader-1`, a separate R3 DEV forward artifact,
not a fabricated row in the historical migration ledger. Initial role:
`otr_trip_publication_catalog_reader NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB
NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1`.
Settings: `search_path=pg_catalog`, `default_transaction_read_only=on`,
`statement_timeout=5000ms`, `lock_timeout=1000ms`,
`idle_in_transaction_session_timeout=5000ms`.

Exactly three dedicated grants: CONNECT on database `postgres`, USAGE on schema
`public`, and non-grantable EXECUTE on
`public.trip_source_read_import_catalogs(uuid,uuid)`. No outgoing role membership,
business table/column/sequence rights, ownership, schema CREATE, command roots,
private helpers or service-role capability. CREATE ROLE supplies an administrator
membership to postgres with ADMIN true, INHERIT false, SET false; no runtime role
may assume or inherit the Reader. Shared PUBLIC/managed ACLs remain unchanged.

The protected root retains signature, jsonb return, writer owner, STABLE,
SECURITY DEFINER and `search_path=pg_catalog`. Its only definition change is:

```sql
if current_user<>'otr_trip_source_writer'
 or session_user not in ('otr_trip_source_command_gateway','otr_trip_publication_catalog_reader')
 or not public.trip_source_admission(actor,trip,false)
then raise exception 'FORBIDDEN' using errcode='42501';end if;
```

Projection, private Actor scope, all13 families, 64-row ceilings and canonical
4,194,304-byte guard are preserved byte for byte. The command gateway remains
NOLOGIN with its existing14 roots, including Catalog read compatibility; the
Backend accepts only the new Reader. Protected SQL continues current Trip admission
independently of Backend's earlier authorization. CLOSED command/import/provider
gates do not prohibit read-only Catalog observations.

The forward requires exact postgres session/current identity, original lineage and
H0. Any preexisting Reader, including a polluted role, rejects without sanitizing
it. The postcondition pins H1 and rejects unsafe role attributes/memberships,
object/CREATE/business-relation authority, additional reachable SECURITY DEFINER
or dedicated routine paths, or non-CLOSED gates. This does not rewrite shared ACLs.

Replacing the writer-owned root as NOSUPERUSER postgres requires a transaction-local
administrator privilege sequence: temporarily enable writer inheritance with SET
false, replace the root, grant its EXECUTE, then restore the precise prior grantor
edge. If no postgres-granted edge existed, revoke only the newly created edge using
`GRANTED BY postgres`; otherwise restore its non-inheriting/non-settable options.
Both branches were tested and raw memberships, including grantors, preserved.
Any failure rolls the whole transaction back. No SET ROLE or identity impersonation
is used. This privileged administrator sequence warrants explicit independent review.

Backend retains fixed username, Pool max1, primary verification, trusted TLS,
READ COMMITTED READ ONLY, same-lease checks, existing deadlines, cancellation,
socket retirement, rollback-before-reuse and finite safe errors. Username remains
non-configurable. `backend/src/server.ts` is unchanged and unprovisioned. No new
SQL service or authentication framework is introduced.

## Commitments and rollback

| State                                            | Accepted/proposed OTR catalog SHA-256                              |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Accepted post-Ledger H0                          | `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906` |
| Proposed dormant H1, both final installs         | `60e25a6bdd8a4359fcdb6246ad0a967ea03402f46c200f40478417194e9d49cc` |
| Synthetic LOGIN-only H2 rehearsal, both installs | `4c69a199b5fc50f25d66b6bef3a3c72981ec163882e469ac0b49fc9319648fe9` |
| Reviewed reverse, retained dormant role          | `a2f7bcceedcbfe49688af8f064305f6e251a8418df5a16568203a6dae2152642` |

Forward SQL SHA-256: `b107a706d35b3dc829c03136407cf15dc769b1c4b25b66397a382020fc71fe75`.
Reverse SQL SHA-256: `dba2a7d9dfe447d54b6a75b9ee5382f0c9e75915f69dd8354894ffb5ea6c44d6`.
Root H0 definition: `e17427b93feff1082e2b49b0b1c939be523dcde51095bd316138812226dac550`;
H1 definition: `e1fd9179d8f8c90bf3a8c9be4cddc98e286b62d2680b06ad955da9ddf035ecab`.

Installed Ledger artifact remains byte-identical, SHA-256
`983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`.
Original R3 lineage remains source `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`,
baseline `f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52`,
scope `CLOSED_ONLY_BETA; SERVER73_OPEN_DEFERRED`. No historical rows are appended.

The reverse requires exact H1, postgres identity/lineage and zero Reader sessions.
It restores the exact original root and ACL, revokes Reader's three dedicated
grants, retains its unowned NOLOGIN role/settings and pins the resulting reverse
commitment. It does not delete historical/local evidence or operate credentials.
The reverse hash differs from H0 because that retained role remains.
Reapplying the original forward after reverse intentionally fails ROLE_EXISTS;
reinstallation requires a separately reviewed additive forward.

If credentials have later been provisioned: first withhold Backend injection, then
separately disable LOGIN, clear/retire the credential and terminate all Reader
sessions before reverse. NOLOGIN/password expiry alone do not terminate existing
sessions. The local synthetic tests disable LOGIN/PASSWORD before reverse; finite
synthetic expiry metadata remains. Dormant installation starts with null expiry.

The OTR commitment excludes password bytes, expiry, connection limit and parts of
the managed surface. The credential-free manifest separately records attributes,
expiry, settings, memberships/grantors, ownership, database/schema ACLs, effective
routine paths, raw relation/column ACL rights, default ACLs and gates. H2 above is
measured synthetic LOGIN evidence, **not an invented actual credential inventory**.
A real H2 must capture actual finite expiry, role profile, endpoint/certificate
attestation, manifest and termination evidence after separately authorized provisioning.

## Real disposable PostgreSQL proof

Two freshly created, isolated `--network none` fixtures used cached Supabase
PostgreSQL17.6.1.167, retained accepted R3 baseline/catalog/platform fixture and
unchanged installed Ledger forward. Each matched exact accepted OTR H0 before
candidate application. Candidate and reverse run as NOSUPERUSER postgres. Only
fixture restoration and synthetic row setup use disposable administrator authority.
A task-local one-day localhost certificate and synthetic password enable actual
TCP SCRAM authentication with `sslmode=verify-full`; wrong password rejects.
No Hosted endpoint or project env file is loaded. Task-owned containers are removed;
existing environments are never stopped or reset.

Final proof: **103 recorded checks PASS** (51 first install, 52 second). The second
also exercises an existing non-inheriting administrator self-edge; it has the same
H0 commitment and preserves that edge exactly. Both yield identical H1, synthetic
H2, reverse commitment and Reader capability manifest. Evidence:
`/private/tmp/otr-r3a-builder-20261009/evidence/sql-proof-final3.log`,
`sql-proof.json`, original synthetic SQL Catalog text and H1/H2 manifests. The
credential-free manifest and proof are included beside the forward SQL.

- Creator, legacy-only member and linked guest read successfully over actual Reader
  login, with gates CLOSED; actual session/current identity, primary and TLS verified.
- Foreign Actor/Trip and revoked legacy membership reject with protected FORBIDDEN.
  Admitted other Actors see their own empty private catalog. A stolen Reader can
  deliberately supply a known admitted Actor; this is the documented trust limit.
- Wrong actual login denies separately by ACL, then by session predicate after a
  fixture-only grant; that grant/role is removed. Reader cannot execute the forward.
- All13 other gateway Source/Import roots deny Reader EXECUTE with SQLSTATE42501
  in explicit READ WRITE transactions. CLOSED gates/read-only settings are not
  credited as the ACL denial. Existing gateway rights stay unchanged.
- Direct business SELECT/INSERT/UPDATE/DELETE, public CREATE/schema CREATE, protected
  admission/observation/canonical helpers and writer-membership escalation deny.
  Inventory finds no business column/sequence rights, ownership or extra privileged
  routine path. Original relations, policies, types, helper definitions and raw
  existing role edges are preserved.
- Preexisting polluted role and H0 ACL drift reject atomically without repair.
- Nonempty complete13-family SQL output admits through existing Backend schema and
  canonicalization. Original returned text rejects duplicate actor/nested keys,
  rounded and unsafe integers, and exponent syntax before normalization.
- Each of the13 families accepts64 and rejects65 through the actual protected root.
  Exact canonical4MiB accepts; +1 byte rejects. Administrative cardinality stress
  bypasses fixture FK/guard triggers only; those rows are not claimed to be valid
  command/publisher-produced authorities. TEXT byte stress keeps row-local checks.
- Reverse restores exact original function/ACL and preserves each fixture's history
  and lineage rows, while retaining the unowned dormant Reader.

This proves the OTR contract, not full Hosted platform equivalence. Managed schema
restoration is a retained structural fixture; managed extensions/settings/platform
roles are not all identical to Hosted. History uses68 locally synthesized rows from
canonical files: local full-row hash `3a0751caeb8ec9e81023cbe935b8bdf58076b299cf822f0ae7733ca52164daf6`
is preserved, **not** the Hosted history hash. Each fixture's timestamp-bearing
lineage hash is preserved locally; the two timestamp hashes naturally differ.
Reproduce with `python3 scripts/supabase/test-r3-catalog-principal.py` after restoring
the explicitly referenced retained fixtures and existing dependencies. The script
refuses existing task container names and cleans only containers it created.

## Ambient PUBLIC capabilities and Actor trust

The local Reader has PUBLIC CONNECT/TEMP, public schema USAGE and catalog visibility.
Explicit READ WRITE temporary-table insertion succeeds: read-only defaults can be
overridden and are not an ACL security boundary. Seven PUBLIC invoker trigger
routines are reachable; direct trigger invocation rejects. The only reachable
SECURITY DEFINER routine is the protected Catalog root. No shared ACL is altered.

Raw PUBLIC SELECT ACLs exist on the two `extensions.pg_stat_statements*` views,
but Reader lacks `extensions` USAGE; actual statistics and crypto calls deny at
the schema boundary. They are inventoried as raw rights, not successful access.
The prior Hosted audit's61 PUBLIC routines/extension/statistics capabilities apply
to the existing gateway, which has explicit extensions USAGE. They must not be
assumed reachable by the new Reader. Exact Hosted managed/Public schema and routine
capabilities still require read-only inventory under the provisioning gate.
If an unexpected privileged path appears, the forward rejects rather than changing
shared ACLs; independently review any otherwise ambient invoker surface.

Backend must derive Actor only from verified bearer Auth and preserve current Trip
admission. SQL authenticates the trusted Backend principal and checks that supplied
Actor/Trip, not an end-user JWT. Compromised Reader credentials can read catalogs
for known admitted pairs without possessing those users' bearer tokens. Neither
role name nor read-only transaction eliminates this disclosure risk. Owner must
accept that boundary and the inventoried PUBLIC/TEMP surface before provisioning.
No SET ROLE, service_role, public RPC, JWT/GUC impersonation or table-read shortcut.

## Validation and preservation

Affected Backend/Auth/Catalog/Driver/Transport, SQLite53 membership/Import and
P2b-A/P2c Composer regressions pass: **58 suites, 1,196 tests**, with15 existing
skips. The focused Catalog/Driver/Native rerun passed132 tests. Additional
actual Driver physical replay passes **13/13**, including same socket/primary/TLS,
untrusted chain/wrong hostname, cancellation/response loss, bounded checkout,
late COMMIT, rollback failure and physical retirement/fresh lease. That replay uses
the accepted synthetic Driver root; full protected SQL root proof is separate above.

Typecheck, lint/UI guard, Backend build, scoped formatting and whitespace checks
pass. No new dependency. Historical SQL, installed Ledger forward, SQLite51–53,
Native/Composer/runtime, package/lockfiles and all tracked files outside the exact
scope above are byte-identical to canonical base. Preflight copy is byte-identical.
All changes remain uncommitted. No fresh device/native physical acceptance or
Hosted equivalence is claimed.

## Remaining Owner and Hosted gates

1. **Independent Security Review** of exact SQL hashes/H1/reverse, both administrator
   restoration branches, root/ACL scope, trust boundary, ambient surface and proof
   limitations. Builder readiness YES means reviewable dormant artifacts only.
2. **Hosted DEV forward approval**, limited to `tuqigdxrvrerfewsxqgm`: read-only
   identity/H0/history/lineage/CLOSED/managed surface recheck, exact forward apply,
   H1/root/manifest readback and reverse rehearsal evidence. Do not rerun original
   R3 rebuild or installed Ledger forward. No Production access is needed.
3. **Separate credential and endpoint approval**: approve LOGIN activation only for
   this role, finite password validity (proposed max30 days), rotation (proposed
   at most14 days), connection limit1, backend-only secret-manager storage and
   emergency owner. No password/DSN/private key in Git, Mobile, public env or logs.
   Rotation must retire the old credential and every old pool/session; maintain
   fail-closed behavior during handover. Emergency disable withholds injection,
   disables LOGIN, retires the secret and terminates Reader sessions, with evidence.
4. **Direct Primary TLS attestation** for the actual DEV database/hostname/port,
   trusted certificate chain and hostname verification, primary-not-recovery and
   actual same-lease Reader identity. Record actual H2 manifest/finite expiry.
   Connectivity, CA/hostname or identity failure withholds reads; no pooler,
   service_role, public RPC, SET ROLE or alternate identity fallback.
5. **Backend injection/deployment approval**, followed by independent current
   authorization/ACL negatives and complete bounded live-read acceptance. server.ts
   presently injects nothing. Native receive/runtime injection and physical-device
   live acceptance remain independently gated; Android/missing receiver stays CLOSED.
6. Preserve offline-first cached SQLite history and existing launch/Auth behavior.
   Composer, C5/C9, providers, command gates and domain writes remain inactive.

Every listed stage can be performed without Production access. No next gate is
implicitly authorized by this Builder or its tests.

STOP — R3-A SQL PRINCIPAL BUILDER / INDEPENDENT SECURITY REVIEW REQUIRED.

## F1 default ACL correction — targeted independent recheck required

2026-10-09. Owner authorized the required IMPORTANT correction from the accepted
Independent Security Review. **F1 corrected: YES at the forward, reverse and
commitment validation boundaries. Original negative probes closed: YES at those
corrected boundaries. New application regressions: NO. Ready for Targeted Independent
Security Recheck: YES.** This section supersedes the commitment-boundary/readiness
claims above; all preceding report bytes and historical values remain unchanged.
The original Independent Security Review is preserved byte-for-byte, SHA-256
`a3ba33924d7c01aa00d9c74ac3d56a1fec90cccf431f23038de2f8ac91189b6f`.
No Hosted/Production mutation, actual credential provisioning, deployment, runtime
injection, device/Simulator operation or Git commit/ref operation was performed.

### Reproduction and exact correction

Before editing SQL, ran the accepted independent runner with only source/output
locations and task-owned container names relocated. Original probe bodies,
assertions and SQL were unchanged. Both fresh network-none PostgreSQL fixtures
reproduced all four original F1 outcomes: unsafe PUBLIC future-table SELECT passed
the full original forward/H1 postcondition, and actual TLS/SCRAM Reader READ WRITE
returned the future synthetic private value. Original evidence is retained at
`/private/tmp/otr-r3a-f1-20261009/reproduce` and
`original-review-reproduction.log`; the accepted reviewer runner remains unchanged,
SHA-256 `511898861afa134d6bc380337435c73fa034c686878a5984589617a767b03df2`.

The minimum correction adds the same transaction-local `pg_default_acl` validation
before mutation and at the final postcondition of both forward and reverse. It
rejects **any positive table/view/foreign-table or sequence default privilege** whose
grantee is PUBLIC or the exact Reader, for every creating role, either globally in
the current database or in any non-system schema. It does not use current schema
USAGE or a creating role's present CREATE/LOGIN capability to dismiss future grants.
All table privileges, including MAINTAIN, and all sequence privileges are covered;
grant options are retained in the evidence. Reader has no outgoing memberships, so
no additional inherited recipient role is silently omitted.

Defaults belong to the actual creating role; schema defaults add to that role's
global defaults. A schema REVOKE cannot subtract a global grant. Inspecting each
positive applicable entry therefore covers both scopes and their additive union,
without manufacturing negative privileges. See
[PostgreSQL17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).
System schemas are outside the business-object scope. Owner/private and managed
non-Reader/non-PUBLIC table/sequence defaults, and harmless managed PUBLIC routine
EXECUTE/type USAGE defaults are preserved. No shared default or PUBLIC ACL is
rewritten or sanitized. Unsafe drift raises
`R3_CATALOG_READER_UNSAFE_DEFAULT_ACL` and the transaction rolls back exactly.

A new read-only `publication-catalog-security-commitment.sql` enforces the same
validation before returning a hash. Corrected commitments extend the original OTR
catalog JSONB with normalized `future_default_acls`: creating-role name,
global/schema scope, object class, recipient, grantor, privilege and grant-option
flag, deterministically sorted without unstable OIDs. The manifest adds that same
projection alongside the existing raw relevant-default inventory. Clean acceptance
requires the future table/sequence projection to be empty. Unsafe drift changes the
forensic extended digest, and the validated commitment refuses to certify it;
a legacy OTR-only hash is never substituted at a corrected acceptance boundary.

### Corrected commitments — distinct from historical OTR-only values

The SQL root, gateway and role profile are structurally unchanged by F1. Thus the
original OTR-only H0/H1/H2/reverse hashes above remain valid **historical/legacy OTR
hashes**, but omit defaults and cannot certify the corrected security contract.
The accepted R3 H0 precondition stays exact and is now accompanied by the new
unsafe-default rejection. Corrected H1/reverse boundaries pin the extended hashes.

| Corrected catalog/default-ACL state                  | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Clean H0 extended observation                        | `71f569fcbbba4653408c19adeee5d83807f21cd7532773001ab6d9309ec0bb84` |
| Corrected dormant H1                                 | `a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42` |
| Corrected synthetic LOGIN H2, not actual credentials | `2cb062324878ba9fabe468c59fb86b757dd26b85aa42763847467c6531fa5e55` |
| Corrected reverse, retained dormant Reader           | `ce0a1e589877705dd6d982e1be3f5c28d7a778b041c7bc899f8863ad5a5ba3fb` |

Corrected forward SHA-256:
`f65beb0c44bb5ca217af7349e39bad82252861d772afe5d6f863c1bd38e25f5d`.
Corrected reverse SHA-256:
`5e3ea75a871f5946e029fb779476c7c41b736cbb625d0ddd1d4e7dae0422518e`.
Read-only security commitment SQL SHA-256:
`383800fac6d576303876de9a99a96a2707d80bbe0a9652440e9eae39c2bc0b42`.
Both final real installations independently recompute corrected H1/H2/reverse,
with unchanged legacy OTR values, installed Ledger forward,68 history rows and
per-install lineage. The proof JSON retains its original pre-F1 section and adds
explicit F1 evidence; the corrected manifest carries the default projection.

### F1 validation and limits

Final two fresh disposable PostgreSQL fixtures passed the expanded matrix, including:

- Original independent preexisting PUBLIC SELECT attack rejects at the forward;
  its subsequent future-table statements are not reached. The original post-install
  attack body, bound to the corrected commitment reader/H2, rejects at its
  commitment check before future-table creation. Probe bodies/attack SQL stay
  unchanged; the commitment helper intentionally uses the corrected contract.
- Unsafe PUBLIC table and sequence defaults at global/public/auth/extensions scope;
  multiple creating roles; global plus schema combinations and ineffective schema
  REVOKE masking. Forward and reverse reject with exact unchanged roles, root/ACLs,
  settings, raw grantor memberships, defaults and database/catalog state.
- Direct Reader defaults at global/public/auth/extensions scope reject reverse;
  direct Reader/PUBLIC table/sequence default drift injected after the precondition
  rejects both postconditions at global and schema scopes. Every rejection preserves
  the deliberately unsafe preexisting state; the artifacts do not remove that drift.
- Read-only commitment rejects every unsafe preexisting case; deliberately bypassing
  only its guard for forensic measurement yields a changed extended digest.
- Harmless managed recipients and PUBLIC routine/type defaults survive complete
  forward/reverse validation without mutation. Actual new table and sequence
  creation grants the intended harmless recipients, while Reader READ WRITE SELECT,
  INSERT, sequence SELECT, nextval and setval all deny with42501.
- Both administrator grantor restoration branches, all24 accepted independent
  transition-fault rollback probes, polluted Reader/H0 drift, wrong principal,
  revoked Trip, foreign Actor/Trip and all13 command-root ACL negatives persist.
  Creator/legacy-member/linked-member reads, complete nonempty13-family original
  SQL text,64/65 limits for every family and exact4MiB/+1 behavior persist.
  Reverse preserves all existing public business rows, history and lineage.

Final proof: **235 recorded outcomes** (117/118 by branch), including96 atomic
default-ACL rejection cases,24 transition-fault rollbacks, four original probe
closures at corrected boundaries and two explicitly retained legacy administrator
disclosure controls. Evidence: `/private/tmp/otr-r3a-f1-20261009/security-final2.log`,
`security/sql-proof.json`, per-case unsafe-digest/state evidence and actual SQL
text/manifests. The original pre-correction reproduction and earlier F1 runs are
retained separately. Affected application
regressions: **58 suites /1,196 PASS /15 existing skips**. Typecheck, lint/UI guard,
Backend build, scoped formatting, Python compilation, whitespace and source
preservation checks PASS. No new dependency or Backend/Driver/Native/Composer/
SQLite51–53 source change. Prior physical socket evidence is preserved; no new
physical-device/runtime/Hosted acceptance is claimed.

**Administrative drift limitation:** the original legacy-hash post-install disclosure
probe was also replayed unchanged as a forensic control. It still returns synthetic
data when a privileged administrator changes defaults after validation and bypasses
the corrected boundary. This is not claimed to be prevented by transaction-local
SQL. The new boundary rejects/cannot certify that drift, and its extended digest
includes it. A privileged administrator can also grant existing table access directly.
Hosted migration and credential/activation gates must use the corrected commitment
and default inventory; subsequent privileged schema/default changes need the same
revalidation. No continuous monitor or generalized SQL authentication framework was
introduced. Compromised Reader Actor/Trip disclosure risk and all prior Hosted,
secret, Direct Primary TLS, Backend injection and live-read gates remain.

F1 scope: existing forward/reverse, principal inventory, capability manifest, proof
JSON, disposable SQL test runner, this append and a current-state handoff prefix;
one new read-only commitment SQL file. All other original Builder/review bytes
remain unchanged. Targeted independent recheck must assess these exact artifacts,
commitment semantics, atomicity, harmless-default compatibility and probe adapters
before final Owner acceptance.

STOP — R3-A F1 DEFAULT ACL CORRECTION COMPLETE / TARGETED INDEPENDENT SECURITY RECHECK REQUIRED.

## Final Owner dormant acceptance and local closure validation

2026-10-09. Owner accepted the dormant SQL Principal and fixed Backend identity
contract, including the F1 correction and appended independent recheck PASS.
The corrected extended H1 and rollback in the F1 section above are the current
acceptance commitments; all earlier values remain historical evidence.

Final closure rerun from an exact temporary source copy:235 PostgreSQL security
outcomes across both administrator branches; both corrected commitments match;
58 affected application suites/1,196 PASS/15 existing skips;19 actual TLS/socket
cases PASS. Typecheck, lint/UI guard, Backend build, scoped formatting, Python
compile, whitespace and preservation PASS. An initial socket-fixture certificate
omitted localhost; regenerating only the temporary certificate with the accepted
DNS names resolved the fixture failures without repository code changes.
Full-repository formatting retains the previously documented28 unchanged base
issues. Logs, disposable certificate material, test containers and bundled output
are excluded from the commit. Final local evidence is retained at
`/private/tmp/otr-r3a-closure-20261009`.

Exactly one scoped local commit at parent
`d263503b6e6ced9edee977508ffeff94e90ad4df` is authorized. No push, merge, rebase
or canonical-main advancement. All1,304 tracked paths outside the accepted scope,
including server.ts, historical migrations, installed Ledger forward, SQLite1–53,
Native Receiver, Composer and package/lockfiles, remain byte-for-byte unchanged.
The Independent Security Review and its appended F1 PASS remain unchanged.
Hosted migration, actual LOGIN/secret provisioning, Direct Primary TLS target
verification, Backend injection and live-read acceptance remain separately gated;
Composer/C5/C9/providers and device/runtime activation remain CLOSED.
