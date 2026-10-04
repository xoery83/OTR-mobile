# A1-I2C4 — Activation / provisioning preflight

Status: **A1-I2C4 ACTIVATION / PROVISIONING PREFLIGHT COMPLETE — REVIEW PENDING**.
Date: 2026-10-05. This freezes future review requirements; runtime remains CLOSED.

## Baseline and authority

Canonical branch `integration/ledger-polish-canonical`, clean HEAD
`5873c4c71a777afbdffad3ed57c309bae314d157`. Fetch confirmed remote integrated
baseline `2c81c548f9dfbe38a80ad3ee8e8c7ff18d8fa6ca` is an ancestor. The separately
integrated Ledger commit is preserved. No staging, history or sibling changes.
Accepted [I2C1](TRIP_CANONICAL_A1_I2C1_LIFECYCLE_COMMAND_CONTRACT.md),
[I2C2](TRIP_CANONICAL_A1_I2C2_PROTECTED_PARTICIPATION_COMMAND_REPORT.md) and
[I2C3](TRIP_CANONICAL_A1_I2C3_RUNTIME_TRANSPORT_RECOVERY_REPORT.md) remain authoritative.
Current-state acceptance supersedes historical review-pending report headings.

## Chain inventory

| Link                      | Current classification and evidence                                                                       | Remaining proof                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mobile authoring          | DISABLED; no product caller/UI installed                                                                  | Approved authoring and device scope                                      |
| Durable intent            | ACCEPTED/CLOSED I2C3; existing sync_operations holds immutable body/key/base as DEPENDENCY_BLOCKED        | Reviewed release/dispatch integration; no second queue                   |
| Capability                | ACCEPTED/DISABLED; strict Mobile contract admits only DISABLED, empty commands/scopes                     | Reviewed enabled contract and live state discovery                       |
| Authenticated POST        | ACCEPTED/DISABLED; verified Actor, exact Trip/Person/key, independent digest; constant false prevents SET | Implement reviewed deployment predicate and request-time checks          |
| Dedicated Backend gateway | PROVISIONING-MISSING; interface only; server.ts installs none                                             | Fixed connector, secret wiring, connection identity/inventory proof      |
| DB session                | PROVISIONING-MISSING; reserved gateway is NOLOGIN, owns nothing                                           | Reviewed LOGIN transition and direct dedicated session                   |
| Protected command         | ACCEPTED/CLOSED; 00600 CAS/ABA, stable locking, activation fence and transition evidence                  | Additive activation migration, writer grants/RLS, live concurrency proof |
| Immutable receipt         | ACCEPTED foundation, command/result version 1                                                             | Deployed parity and actual-credential tests                              |
| Exact recovery            | ACCEPTED I2C3; current Organizer before own-scoped lookup, scope/hash verification                        | Live dedicated historic reads, restart/device transport proof            |
| I2C2 apply                | ACCEPTED; SQLite45, atomic result/queue/row and all-seven invalidation                                    | Device/live result application                                           |
| Convergence               | ACCEPTED existing reporting owner, bounded refresh and Account gate                                       | Command-specific device/reconnect/two-device acceptance                  |

SQLite order remains 1–43 → B44 → A45. Participation is independent of Event
semantic revision. No complete roster certificate comes from an individual result.

## Provisioning contract — future separately approved execution

Use the existing exact database role `otr_trip_person_command_gateway` as the
dedicated LOGIN. Do not use a differently named login plus SET ROLE: command guards
require actual session_user, and SECURITY DEFINER changes only current_user.
An approved deployment administrator applies a reviewed role transition after
schema review; runtime never receives the administrator connection.

Required profile: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
NOBYPASSRLS, NOREPLICATION; owns no object, has no role memberships, ADMIN/INHERIT/
SET options or path to a privileged role. Writer and receipt-reader stay NOLOGIN;
the gateway is never their member. Reject polluted inventory, rather than silently
revoking unknown capabilities and declaring success.

Target connection: one approved database/environment over verified TLS, direct
PostgreSQL identity preserved throughout the pool; a shared authenticator/pooler
that replaces session_user is incompatible. Server-controlled settings:
search_path=pg_catalog, application_name=otr-trip-person-command-v1,
statement_timeout=10s, lock_timeout=3s, idle_in_transaction_session_timeout=10s,
and READ COMMITTED. Connector reapplies/verifies these on checkout, uses qualified
fixed signatures and parameter binding, and never executes caller SQL, SET ROLE,
JWT/GUC authority, arbitrary functions or a gate setter. Timeouts after dispatch
are ambiguous; retain the same key and recover exactly. No automatic new-key retry.

Grant only CONNECT on the selected database and schema USAGE needed by fixed
signatures (public; accepted extensions USAGE is already installed). No database
CREATE/TEMP, schema CREATE, object ownership, protected-table SELECT/DML,
column DML, sequence privileges or DDL authority to the gateway. Public/inherited
rights count as effective rights: a role-level REVOKE cannot cancel PUBLIC grants.
Database PUBLIC TEMP/CREATE policy must be audited and isolated/reviewed if needed;
do not revoke shared environment privileges opportunistically.

Application EXECUTE additions are only:

- existing public.trip_person_set_participation(uuid,text);
- existing public.trip_person_receipt_lookup(uuid,uuid,uuid);
- proposed fixed public.trip_person_runtime_state() discovery, returning only
  installed commandVersion, receiptVersion, gate state and reviewed schema identity.

The discovery function is not installed. Its future migration must pin owner,
SECURITY DEFINER/search_path and qualified references, revoke implicit PUBLIC,
anon/authenticated/service_role execution, and grant only the dedicated gateway.
The gateway gets no direct gate-table SELECT. The owner receives only required
read authority and the ownership inventory is extended explicitly. Existing
00600 pins baseline routine hashes and inventories effective EXECUTE; preserve that
reviewed baseline, inventory built-ins/extensions and reject unexpected signatures,
overloads, defaults or privilege/ownership drift. Do not claim the baseline has
zero system/PUBLIC routines; its exact accepted baseline is part of the inventory.

Secret mechanism: deployment secret manager injects the dedicated connection
credential into only the Backend connector; never Mobile, source, .env committed
files, logs, report or test fixtures. Names/target IDs remain unresolved until an
approved environment is selected. Rotation uses the administrator/secret manager,
drains old pools and verifies new direct identity before admission. Revocation
closes HTTP first and drains/terminates affected sessions; NOLOGIN/password rotation
alone does not terminate existing sessions. Preserve receipt recovery via a verified
replacement of the same identity; an outage retains unresolved intent.

Startup and pool checkout verify actual session_user AND current_user equal the
exact gateway outside definers, role flags/memberships/effective grants, settings,
installed signatures/versions and pinned schema inventory. Failure gives disabled
capability and unavailable recovery, with no service_role fallback. Actor identity
still comes from verified authentication, never the connector role or caller.

## Required additive activation migration — BLOCKED pending separate review

Do not edit server 00600. It deliberately has CHECK(not enabled), reserved NOLOGIN
roles, no Member SELECT/UPDATE/locking grants for the command writer, and no fixed
runtime discovery or admin gate setter. Configuration alone cannot activate it.
A new uniquely allocated migration and manifest/verifier/security profile are
required; no version is reserved or file created by this preflight. It must:

1. Preserve receipts, guards, CAS/ABA and command bytes. Keep gate false by default;
   replace the closed-only CHECK with the reviewed activation-capable constraint.
2. Install fixed discovery and an admin-only gate transition path. The latter
   obtains the exclusive transaction advisory fence matching
   hashtextextended('otr-trip-person-activation',0), then changes the singleton.
   No gateway/admin membership or runtime gate setter grant. Bound the wait; a
   failed closure cannot be reported as successful. Existing admitted transactions
   commit before closure completes or reject after it; never tear down their receipts.
3. Review exact writer privileges/RLS required by unchanged SELECT * INTO target,
   %ROWTYPE and FOR UPDATE: Member row SELECT, UPDATE only participation_active and
   participation_revision, and the minimum supporting SELECT/UPDATE policies under
   the private writer. FOR UPDATE needs UPDATE privilege; no full-table UPDATE,
   INSERT/DELETE, role/status/access/financial column change is permitted. The
   gateway receives no Member privilege. Policies and guards must retain dedicated
   session/gate enforcement and current-owner recheck under deterministic row locks.
4. Define the phase-specific LOGIN/no-membership inventory and tightly scoped
   admin gate ownership. Reconcile all manifests/ACL/default ACL/evidence guards
   through clean replay, populated forward migration and adversarial/race suites.

These are review requirements, not granted rights or an executed migration.
If the deployed database cannot satisfy them without broad authority, stop
provisioning; do not improvise fallback or bypass 00600 guards.

## One future HTTP activation predicate

For the selected Actor/Trip scope, ENABLED iff ALL are true and current:

```text
P = dedicated gateway provisioned and healthy
  AND actual session_user/current_user == otr_trip_person_command_gateway
  AND reviewed role/settings/grant inventory verified
  AND commandVersion == 1 AND receiptVersion == 1
  AND DB lifecycle gate == OPEN
  AND deployment feature tripPersonParticipationCommandsV1 == ON
  AND explicit deployment Actor/Trip rollout allowlist admits this scope
  AND Mobile command/result contractVersion == 1 is supported
  AND reviewed server schema/activation manifest and Mobile SQLite >=45 are compatible
```

Supported means a reviewed release/schema identity, not any arbitrary higher
version number. Missing, stale, unknown or malformed evidence means DISABLED;
caller headers/GUC/JWT claims or cached capability cannot supply any clause.
The future verifier must attach authoritative compatible-schema evidence, not
trust a client boolean. Capability is advisory. POST recomputes P at dispatch
without using a cached ENABLED decision; fixed SQL checks the live gate under its
shared fence and live authority under locks. Actor authorization is additional,
not implied by P. DB OPEN alone cannot enable HTTP. Feature ON with DB CLOSED
cannot enable HTTP. Gate/flag can change after discovery; no key is consumed for
a fresh disabled request. Preserve authorized replay/GET availability independently.

This predicate is a frozen contract and a test-only model. Current constant false,
strict DISABLED schema, server wiring and Mobile submit remain unchanged. No
feature flag, enabled capability, grant or production predicate is installed here.

## Future procedure and kill switch

Each live step needs separate environment/deployment authorization; Production is
excluded from this preflight. Never proceed on incomplete inventory evidence.

1. Review additive schema/connector/contract/dispatch changes and full SQL/security
   parity; deploy closed Backend/Mobile-compatible release with rollout OFF.
2. Apply the approved closed activation migration, provision exact identity/secret,
   verify direct effective security inventory, pool settings and deployed schema.
3. Verify current-Organizer exact historic receipt GET while closed; verify former
   Organizer 403, own absent/foreign key 404, corrupt/gateway outage 503. Arrange a
   reviewed historic fixture; no fabricated receipt or table write by runtime.
4. Negative POST while closed: with feature ON in an isolated allowed scope and
   DB CLOSED, prove disabled/no receipt/no key consumption; reset feature OFF.
5. Use the approved administrator path to open DB gate under exclusive fence.
   With feature OFF, re-read capability: still DISABLED. Turn feature ON only for
   the approved isolated Actor/Trip test scope; re-read authoritative capability.
6. Run one isolated Trip/Person transition; verify exact immutable receipt, SQLite
   result, all-seven invalidation then existing-owner complete convergence; compare
   financial/private cursors and access. Execute the entire device matrix below.
7. On any invariant failure: feature OFF first (new HTTP dispatch blocked), then
   admin-fenced DB CLOSED and verify closure/readback. Report in-flight ambiguity
   until fence completion; do not declare a failed closure complete. Confirm fresh
   POST consumes no key, capability DISABLED/UNKNOWN and exact authorized GET works.

Kill switch retains committed pairs/revisions/receipts/local results and unresolved
intents; no automatic undo, receipt deletion, revision reset or access revocation.
Disable new sends using the existing dispatch owner; no second scheduler. Gate
closure is not cancellation of already committed work. Restore recovery service
if credentials failed; otherwise keep intents durable. An owner who loses authority
after commit receives PARTICIPATION_FORBIDDEN/403 and retains pending intent; historic
recovery requires current authority again, not bypass or a new operation.

## Device/live acceptance matrix — all PENDING, none executed here

Each case records exact key/digest, authoritative receipt/pair, local result and
certificate state plus preserved finance/private cursors. Use isolated approved
fixtures; test exceptions must not ship into runtime.

| Case                                        | Required observation                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| active→inactive                             | One APPLIED flip, revision +1; all seven cleared, then complete convergence                                                 |
| inactive→active                             | One APPLIED flip, revision +1; canonical roster/filter recomputed                                                           |
| Organizer self                              | Allowed with current linked owner; participation=false leaves role/access intact                                            |
| response loss + kill/restart                | Same stored key/body; exact GET retrieves committed result; one local apply                                                 |
| foreground/reconnect                        | Existing wake/reporting owner converges; no new timer/worker or repeated invalidation                                       |
| offline authoring held                      | Future approved authoring retains stable intent; no disabled/offline dispatch or optimistic certificate                     |
| Account A→B→A                               | Old flight cannot apply/finish; preserve A intent without disclosure to B                                                   |
| Trip A→B→A                                  | Bind immutable Trip request; navigation must fence view/dispatch generation; never apply another Trip result to active view |
| stale base / ABA                            | Durable conflict; same-value after ABA does not authorize stale base; no automatic rebased key                              |
| authority lost before dispatch              | 403/no receipt disclosure or semantic mutation; keep original pending intent                                                |
| authority lost after commit before recovery | 403 even if still Trip-readable; original commit persists, pending remains unresolved                                       |
| gateway outage after cached capability      | POST fails closed; if dispatch may have begun, outcome remains ambiguous; recover same key                                  |
| gate closes between capability/POST         | Fresh request denied without key consumption; fence waits for admitted writer                                               |
| duplicate tap                               | Same normalized intent/key; one outcome, replay/duplicate local consumption neutral                                         |
| two devices same base                       | One APPLIED and one REVISION_CONFLICT, no silent LWW/rebase                                                                 |
| financial/private regression                | Shared financial checkpoint/server time and private payment cursors/data unchanged                                          |
| no access revocation from false             | Cached/read/write collaboration access preserved; no leave/unlink/remove semantics                                          |

TripId is captured and verified today; Account generation is installed. A UI Trip
navigation/authoring generation owner is not installed by I2C3. Trip ABA device
proof remains pending and cannot be inferred from Account ABA tests.

## Local proof, limitations and remaining blockers

New test-only model checks every predicate clause, missing/unknown evidence and
feature/gate combinations. Static SQL probes pin exact 00600 bytes and its closed
constraint, gateway signature allowlist, direct/PUBLIC/inherited privilege checks
and absent Member DML grants. These are source-contract checks, not a live ACL or
PostgreSQL DML denial proof. Accepted I2C2 disposable SQL/security evidence remains
historic; no database, new LOGIN or remote test is run here. Existing I2C3 runtime
probes cover wrong session_user/service_role, caller/JWT/GUC spoof, fixed lookup
privacy and HTTP closed behavior. New HTTP probes cover stale cached ENABLED /
feature-header spoof and open DB/feature-off without mutation fallback.

Remaining blockers: approved additive activation migration and phase manifest;
fixed discovery/admin fence; dedicated connector/identity/secret management and
live effective privilege verification; reviewed enabled capability/request-time
predicate and compatible Mobile release; authoring/dispatch release and Trip
navigation fencing; approved environment/deployment; full device/live matrix and
independent review. None is waived by local probes.

Validation: **8 files / 161 tests PASS**: 3 focused files / 75 cases (29 new
predicate/source checks, 25 Backend runtime cases, 21 SQLite/result/recovery cases),
4 Account/client/reporting/database regression files / 45 cases, and 41 certificate
cases with a temporary native-boundary mock. The extra certificate suite initially
failed loading React Native Flow after the Ledger notification import; its final
run uses the same queue-announcement mock boundary as accepted I2C3, from a config
under /private/tmp only. No Ledger/Auth/test configuration in the repository was
changed to hide that native-loader constraint. This is Node-level proof, not device
or live database proof.

Typecheck, Backend build, scoped ESLint, UI guard, changed-file Prettier and diff
whitespace checks PASS. All tracked runtime/schema/Ledger/Auth bytes match startup;
only the existing I2C3 runtime test and current-state document changed, plus the two
new I2C4 report/model-test files. The pre-existing Ledger sections in current-state
are byte-identical. HEAD is unchanged, staging is empty. Evidence directory:
`/private/tmp/otr-ai2c4/`.

- SET_PARTICIPATION runtime enabled: **NO**
- lifecycle gate open: **NO**
- real runtime credential added: **NO**
- normal dispatch enabled: **NO**
- UI enabled: **NO**
- Hosted Dev/Production accessed: **NO**
- unrelated Ledger work modified/staged: **NO**
- sibling worktrees modified: **NO**
- commit: **NO**
