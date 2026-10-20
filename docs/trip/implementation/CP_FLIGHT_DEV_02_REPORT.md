# CP-FLIGHT-DEV-02 CLOSED Implementation Report

Date: 2026-10-12 (Pacific/Auckland). Branch: `codex/flight-dev-backend`.
Canonical baseline: `6af3aff1fbfb136b087512589aa94b2c9d4640fc`;
assessment parent: `09d833a4d170da940b0ff6765668689d70b56b15`.
Worktree: `/Users/xoery/.codex/worktrees/flight-dev-backend/otr-mobile-canonical`.

## Outcome

Owner selected ORIGINAL TEXT-only. Minimum backend wiring is implemented and
verified locally through real HTTP → Node pg → verified PostgreSQL TLS.
Normal Backend startup remains CLOSED; no Hosted connection, provisioning,
deployment, native activation, C5/C9, Provider, paid LLM or Production action.
No canonical merge/push. Local scoped review commit only.

The existing Source ACQUIRE/Run/Input SQL contracts retain sole custody and
admission ownership. Existing Core publication2/preparation/command/receipt/
finalization/read2 and the Canonical writer are reused unchanged. No second
custody store, new queue, business authority, dependency or migration was added.

## Changed implementation

- `backend/src/flightTextSource.ts`: authenticated TEXT boundary and transactional
  adapters to `trip_source_acquire_source` / `trip_source_publish_flight_run`.
  Existing command1 envelope retains durable IDs/key/digests; only UTF-8 TEXT/PASTE,
  UNKNOWN capture time and inline original are admitted. Exact bytes/hash are
  checked before SQL; owning SQL checks all acquisition/capture/operation digests,
  revisions, ownership, Trip read/write admission and immutable receipt replay.
  Source receipt correlation and result hash are independently checked on return.
- `backend/src/app.ts`: existing bearer authentication derives Actor for the two
  Source routes; current Trip read fence precedes owning SQL. Caller actor/Trip
  fields remain consistency claims. Default absent connection returns CLOSED503.
- `backend/src/tripCoreV2PgConnection.ts`: existing bounded verified-TLS/fresh-session
  driver reused by two fixed factories: Core gateway and Source command gateway.
  No arbitrary role parameter is exposed. Session/current principal and primary
  identity checks remain; no service_role/Reader reuse or shared actor session.
- `backend/src/flightTextDevBackend.ts`: explicit injected composition around the
  existing DEV gateway/handler and existing Core HTTP factory. It performs no
  startup IO; credentials/config must be supplied by an authorized private host.
  `server.ts` does not call it or load a new activation environment variable.
- `backend/src/server.ts`: TEXT Source ingress is capped before Buffer concatenation;
  the authenticated handler separately bounds/strictly parses JSON with the
  existing request deadline. Other startup behavior remains unchanged.
- Focused boundary/driver/ingress tests; fixture-only child HTTP host and real
  TLS transport test; existing disposable SQL harness gets `--text-runtime`.
  API contract/current-state/report/evidence and exact manifest accompany the code.

No public Core DTO changes, SQL-body changes, Core W0/W4 ownership changes or new
ADR decision. The Owner selected the already-defined TEXT contract; implementation
adds adapters only. Exact files: `CP_FLIGHT_DEV_02_CHANGED_FILES.txt`.

## Runtime/status matrix

| Requirement                                        | Local status                                                                                          | Normal / Hosted status                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Node driver                                        | INSTALLED pg8.16.3 / @types8.15.5 / Node24.18.0; reused                                               | No dependency/lockfile changes                                                              |
| Authenticated HTTP and Actor/Trip fences           | IMPLEMENTED / TESTED with fixture bearer identities and owning SQL                                    | Existing Supabase `auth.getUser` adapter reused; actual DEV Auth exchange not run           |
| ORIGINAL TEXT acquisition                          | IMPLEMENTED / TESTED real Node pg/TLS; exact original, revision1, action and durable receipt          | BLOCKED by separately authorized Source principal/grants/gates; no Hosted original uploaded |
| Source Run/Input publication                       | IMPLEMENTED / TESTED real HTTP and owning SQL; complete existing pins/lineage                         | Not startup ENABLED; runtime Source/import gates remain CLOSED                              |
| Core publication/plan/command/receipt/finalization | Existing implementation reused; TESTED real HTTP/pg/TLS                                               | Core principal provisioning and activation BLOCKED; writer unchanged                        |
| read2 collection                                   | Existing authenticated transport/validator reused; TESTED exact two Item IDs/revision2                | Hosted acceptance not run; normal startup CLOSED                                            |
| TLS/principal isolation                            | TESTED actual SSL session, untrusted CA, wrong hostname/password, direct cross-principal table denial | Hosted host/CA/private credential custody/reachability unverified                           |
| Replay / UNKNOWN                                   | TESTED process-loss exact acquisition/Run/command replay; four lost command responses                 | Failure/503 retains same intent; no new identity or assumed no-commit                       |
| Binary PDF/image / Document original               | BLOCKED / not implemented in this checkpoint                                                          | Future required Flight Beta capability; requirements below                                  |

## CLOSED verification

`python3 scripts/trip/core-v2-sql-acceptance.py --text-runtime` creates a UUID-named
clone of cached `otr-core-v2-server84-fixture:20261012`, applies existing Core85–92
only inside it, provisions **synthetic** Source/Core LOGIN credentials, generates
one-day localhost TLS certificates, and publishes PostgreSQL only to127.0.0.1.
A task-owned Docker bridge is needed for host Node pg; ordinary prior SQL modes
retain `--network none`. No image pull or remote endpoint is used. The container,
bridge and temporary certificates are removed in cleanup.

The fixture starts the actual composed handler in a separate Node child process.
Its bearer identities are a deterministic Auth test adapter, not a Supabase session.
Normal backend authentication still uses the existing Supabase token validator.

Acceptance assertions:

1. Real HTTP request and fixed Source LOGIN → verified TLS Node pg → owning ACQUIRE
   atomically creates one Source/revision1/original/action/receipt. No admin-seeded
   Source original. SQL and returned byte hash match the exact synthetic UTF-8 text.
2. One Source → sealed Run/Input publication → publication2 → two independently
   qualified Flights. Validated read2 has the same two Item UUIDs at revision2.
3. Exact Source acquisition/Run replay, stable publication/plan/operation identities
   and empty ready commands after completion; changed operation identity with the
   same valid acquisition key returns409.
4. Acquisition acknowledgement is discarded; backend is killed and restarted.
   Identical envelope recovers the same receipt with one stored original. Four
   command responses are discarded; four further backend SIGKILL/restarts recover
   the same operation receipts and finalize the same Source slots. No duplicate
   CREATE or new intent on uncertainty.
5. Invalid bearer401; forged acquiring actor403; foreign Trip404 for Core; a Trip
   member's foreign Source Run pins are rejected409/INPUT_STALE by owning SQL.
   Source guard rollback leaves no unauthorized Run accepted.
6. Other member's collection contains no private Source ID or track-c proof.
   Source gateway cannot read canonical Event tables; Core gateway cannot directly
   read original text. Original Document access remains denied.
7. Actual `pg_stat_ssl` proves SSL for the live Node session; default untrusted CA,
   wrong hostname and wrong password reject. No verification bypass or pooled host.
8. SQL checks preserve all329 historical public function bodies and restore Source,
   import and Core fixture gates CLOSED. Existing databases remain untouched.

**Fixture authority limit:** to exercise the CLOSED SQL contracts positively, the
owned clone enables gates, grants Source writer only the fixture tables needed by
those entrypoints, and disables the inherited unconditional Source mutation and
statement deny triggers on Source/revision/representation/action tables. Manifest,
byte-integrity, immutable-operation and other structural triggers remain. Core
uses its accepted owning writer. These fixture changes are not included in any
migration or provisioning artifact and do not certify Hosted activation privileges.
No source/function body is replaced or treated as new business authority.

Focused regression: **11 suites / 90 PASS**. Local runtime acceptance: **1 PASS**.
Typecheck, Backend build, lint/UI guard, touched TypeScript formatting and whitespace
checks PASS. Python harness syntax checked. Prior `--flight` / `--source` acceptance
remains covered by its previously accepted CP-FLIGHT-DEV-01 evidence; this checkpoint
runs the new transport path plus focused regressions, not the whole repository suite.
Final run identities and explicit boundaries: `CP_FLIGHT_DEV_02_EVIDENCE.json`.

## Minimal Native Capture interface

1. Retain C2 originals locally first; keep the original Account/Trip/generation.
2. POST the existing ACQUIRE_SOURCE envelope to `/v2/trips/:tripId/sources/acquire`:
   original TEXT descriptor, exact UTF-8 hash/byte count, existing capture/acquisition/
   operation digests and stable Source/Representation/operation IDs/key. Backend
   does not accept storage locators, binary payloads, caller roles or readiness flags.
3. POST the existing complete Run/Input/legacy Candidate/lineage envelope to
   `/v2/trips/:tripId/sources/runs/publish`; retain acknowledged Run/input hash.
4. Reuse `createCoreV2Transport` / `prepareCaptureFlightSetV2` for publication2,
   preparation and existing Core command/receipt/finalization/collection interfaces.
   Only accepted read2 is canonical truth; Candidate/plan confidence is not authority.
5. Missing response/receipt remains UNKNOWN. Retry the exact retained request and
   recover its original IDs; Source acquisition replay returns the same owning
   receipt. Domain success with unfinished Source association remains EVIDENCE_PENDING.
   Do not allocate another key/Source/Item or dispatch v1 as fallback.

No Native caller, scheduler, queue drain or C5/C9 allowlist is added. The backend
ports are available for a separately approved Native transport integration.

## Later binary PDF/image custody — exact additional requirements

- Reuse the approved separate private Source bucket/provider boundary and derived
  immutable keys; provision it only after Owner approval. No receipt-bucket reuse,
  direct Mobile storage authority, overwrite/upsert or public listing/download.
- Complete existing PREPARE/UPLOAD_ORIGINAL/VERIFY and LOST recovery adapters with
  bounded private staging, quotas, MIME/profile decoding/resource limits and exact
  persisted byte hash/length. PDF/JPEG/HEIC need independently accepted profiles;
  accepted narrow PNG evidence does not certify them.
- Durable exclusive representation attempt ownership, trusted completion producer,
  create-only/identical-object comparison and provider post-crash terminality.
  IO_UNKNOWN retains responsibility; crash/cancel/timeout never authorizes resend,
  overwrite, purge or deletion of the last protected original.
- Explicit retention/protection inventory, staging cleanup only after quiescence,
  independently reviewed purge/redaction/erasure rights. This checkpoint chooses
  no duration or automatic retention release.
- Operational Document custody registry/host/grant/authorized-copy/open-original
  isolation, plus private Source proof authorization independent of shared Item
  visibility. A Flight Item does not grant access to its PDF/image Source.
- Accepted binary extraction/airport/supplier grammar and provider/privacy/cost
  gates remain separate; no OCR/LLM/provider activation is implied by custody.

## STOP before real DEV Hosted activation

Local CLOSED implementation is ready for Owner Review. Real DEV requires separately
scoped authorization for **dedicated Source/Core LOGIN principals and credential
custody, exact grants and Source/import/Core runtime gate handling, Hosted lineage
compatibility, deployment/private injection/rollback, and actual Supabase Auth →
Node pg/TLS acceptance**. Existing unconditional Source deny triggers must not be
silently removed in Hosted; their accepted activation treatment is a review gate.
No Hosted operation was needed to complete this local checkpoint or performed.
Request that separate authorization before any Hosted implementation/provisioning
or activation. Native/runtime activation and binary custody require later scopes.
