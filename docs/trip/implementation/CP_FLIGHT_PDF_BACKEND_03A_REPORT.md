# CP-FLIGHT-PDF-BACKEND-03A — CLOSED preparation / Owner Review

2026-10-13, Pacific/Auckland. Branch: `codex/flight-pdf-backend-03a`.

**Independent Backend preparation implemented; Source v2 integration and activation remain BLOCKED.**
No public PDF route, Source v2 acceptance, custody FINAL or remote terminality is claimed.
The new adapters are unreferenced by Backend startup. They require explicit private
composition and reviewed owning ports, which have no production implementation here.

## Baseline and accepted inputs

Preflight local main: `e091b60e0527766bf6a055a4280e21f61933da5c`.
Actual read-only remote `origin/main`: `065bdd96d334cfa4818178cb715dfd7ff14b5289`.
The isolated worktree uses the newer local main, preserving concurrent CP01B/G2 work;
no fetch, merge, ref advancement, push or concurrent-worktree modification was performed.
Canonical has existing Platform report/notes changes; they were left untouched.

Source v1 contract/DTO, registration, derivative authority, execution/staging journal,
private descriptor and TEXT HTTP/pg/TLS conventions were read. All 96 historical
migrations and both schema manifests remain exact baseline bytes; hashes are in evidence.
The accepted Upload v1 migration remains `20261013000100_source_pdf_upload_authority.sql`.
No v2 migration/profile/SQL interface is installed or invented by this checkpoint.

Recovery02 prose was recovered at
`/private/tmp/cp-flight-pdf-upload-recovery-02/CP_FLIGHT_PDF_UPLOAD_RECOVERY_02_DECISION.md`,
SHA `b9d58f7f46ec201abc1a5816e9ddc7b6e67cfea994392e75abb7a6fc98b72773`.
Its header describes a proposed contract; this Owner request authorizes independent
Backend preparation, not Source completion. The proposed
`PDF_PRIVATE_UPLOAD_BETA_ACK_V2` interface/fingerprint remains Agent 3's responsibility.
Provider01 `8d6eedd` and accepted Provider02 `7dcc1fd` remain preserved in their worktrees.
Their findings are not overridden: concurrent create-only is not atomic in the tested
provider, and complete ACK or exact GET does not prove remote writer terminality.

## Implemented adapters and runtime entry

- `app.ts`: exports its existing `authenticate` helper unchanged in behavior. PDF
  preparation uses the same gateway/session Actor and Trip reader fence; no new auth framework.
- `sourcePdfBackendPreparation.ts`: internal `ingress`, `upload`, `observeRetained`.
  Authenticated Actor must match the Source-resolved binding; exact Trip, Source,
  Representation, operation and account generation must match. Owning current-scope
  checks precede IO and handoff. POST/PDF only; no content encoding; declared length,
  streamed count, hash and strict profile are checked with a bounded/cancellable stream.
  Caller identity is a consistency request, never authority or a filesystem/provider path.
- `sourcePdfPrivateStage.ts`: private absolute server root, own UID/0700 directory,
  opaque Source resource UUID filename, no symlink reads, 0600 exclusive temporary file,
  exact binding header and finite payload, chmod0400/fsync/close then atomic no-replace
  hard link and directory fsync. Reopen bounds reads and rechecks binding/hash/count/profile.
  Changed content or binding under one resource fails without replacing the retained file.
  A closed two-link inode is readable across the link/unlink crash window; its residual
  temporary alias is retained, not age-cleaned. No public cleanup/release API exists.
- `sourcePdfStorageProducer.ts`: fixed registered configuration, private bucket and
  Source-derived `v1/<Trip>/<Source>/<Representation>/payload`. Raw Node HTTP/HTTPS,
  verified TLS, one POST, `x-upsert:false`, no SDK/application retry, redirect, overwrite,
  copy/move or alternate key. Payload is snapshotted and rechecked before socket IO.
  Complete HTTP200 must have the expected complete Id/Key shape and closed local input;
  status, complete response body/hash, complete bounded response headers/correlation, dispatch/binding
  digest and nonsecret provider-configuration digest are captured. Other/partial/ambiguous
  responses remain UNKNOWN observations. ACK does not mean exclusive writing or terminality.
  Independent private origin GET checks actual bytes, MIME, length, hash and finite profile;
  results are MATCH/MISMATCH/MISSING/UNAVAILABLE/UNSUPPORTED, never VERIFIED or SOURCE_FINAL.

The adapters do not execute Source or Canonical SQL, publish, prepare Core commands,
register derivatives, seal, or finish uploads. Existing owning paths remain unchanged.
There is no new runtime environment flag, automatically registered endpoint or startup caller.
The normal adapter uses the fixed `/storage/v1` API prefix, bound into configuration identity.
Production HTTPS is mandatory; the explicit test option permits HTTP only on 127.0.0.1.
Secrets stay in private constructor scope, never observation DTOs or shared collection.

## Exact internal handoff and missing Source seam

The internal `PdfPreparationAuthority` port is deliberately **not** a Source v2 DTO:

| Port                                      | Required owning implementation before integration                                                                                                                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveReserved(actorId, identity)`      | Current private ownership, Actor/Trip membership, account-generation and Source/Representation pins, existing quota reservation, local node/resource binding, authorized staging phase. Never mint an extra ledger or treat caller claims as a reservation.                   |
| `assertCurrent(context)`                  | Recheck current ownership, generation, material/row revisions, execution owner/fence and admission state; reject revoked/stale scope.                                                                                                                                         |
| `consumeDispatch(context)`                | Durably grant/consume at most one dispatch, return its exact UUID, deny duplicate/takeover/restart redispatch. Commit ambiguity must never grant a replacement. Local busy-set protection is additional admission only.                                                       |
| `recordObservation(context, observation)` | Admit immutable exact bound ACK/GET/UNKNOWN records into the existing Source journal; return a durable private evidence reference. Retain operational evidence before rejecting a newly revoked success handoff. No Source FINAL or debt release is implied by the reference. |

Reservation may have no dispatch UUID. Provider IO uses only the UUID returned by the
owning durable grant. Context retains ownerRun/fence/generation separately from the
immutable payload binding. Stage evidence supplies opaque resource/key, byte tuple and
binding digest. ACK/GET evidence carries exact request binding and provider configuration.
No raw original bytes are supplied as Source custody proof; GET is independently executed.

For independent preflight validation, the common binding uses the existing accepted
Upload v1 schema. This does **not** issue a v1 terminal proof. Once Agent 3's profile
passes Owner Review, the bridge must map its authoritative version/profile, tuple,
request/ACK digests, evidence references, historical execution fence, current CAS,
result/receipt codec and retained remote obligation. Do not manufacture a v1-shaped
terminal DTO or assume the legacy profile admits Beta ACK. Until that mapping exists,
these constructors cannot be composed with production Source admission.

Tests use explicitly labeled CLOSED authority-port doubles for the new adapters. They
emit no Source v2 receipt and do not certify durable journal admission. Real Source v1
SQL regressions separately verify accepted journal/dispatch/recovery behavior. Actual
PDF Backend process restart with a live Source v2 dispatch/evidence bridge remains an
integration requirement; adapter reconstruction and cold-process staging reopen are
verified here. No new durable Backend dispatch ledger or evidence database is introduced.

## CLOSED verification and limits

Evidence: `CP_FLIGHT_PDF_BACKEND_03A_EVIDENCE.json`.

- Focused final: **4 files / 44 PASS / 1 optional local-Storage SKIP**. Includes actual
  fixture-only Node HTTP ingress, byte bounds/truncation/MIME/hash/strict-profile negatives,
  Account/Trip/Source/Representation/operation/generation/revocation rejection, safe stage
  reopen, replacement/symlink/privacy negatives, link/unlink crash window, fresh Node
  process reopen, single/duplicate dispatch, newly granted UUID binding, ACK/GET distinction,
  timeout/disconnect/incomplete/bad-shape/redirect UNKNOWN, retained mismatch/MIME rejection,
  stalled ingress cancellation and untrusted Provider TLS certificate rejection.
- Actual pinned local Storage run: **33 PASS / 0 FAIL**, including the optional actual
  API probe. Complete ACK, exact independently read retained bytes and duplicate rejection
  passed using newly generated synthetic credentials and the real private Storage API.
  Counts overlap; they are not an aggregate.
- ORIGINAL TEXT: existing **real HTTP → Node pg → verified TLS** regression PASS;
  two stable Flight UUIDs, four lost-response receipt recoveries, five Backend restarts,
  private Source redaction and hostname/CA/principal negatives passed.
- Source Upload v1: **29 SQL tests PASS** in a disposable owning clone, including roles,
  RLS/guards, quota, exact replay, dispatch/UNKNOWN/receipt/recovery and CLOSED gates.
  Its accepted synthetic stronger terminal evidence is historical regression machinery,
  not a claim that this real Storage producer emits terminal evidence or accepts v2.
- Strict PDF Source registration → independent seal → Core/read2/SQLite/Day: PASS,
  two stable accepted Items/revision2, four recovered domain receipts, Quartz REVIEW,
  private Source nonleakage and original historical functions/gates preserved.
- Typecheck, Backend build, lint/UI guard, touched formatting, Python syntax and diff
  checks passed. UI guard baseline remains473 legacy occurrences/90 representative files.

Validation deviation: initial strict PDF runs hit the existing 30-second joined-test
watchdog. An exact clean baseline run passed in27.75 seconds; the unchanged working
branch strict PDF run then passed in12.21 seconds. The optional combined
`--pdf-source --with-pdf-upload` variant still timed out on three attempts after
registration and sealing. The independent upload and strict PDF/Core scenarios pass,
but that optional combined variant is **not recertified**. No existing test timeout or
contract was changed; no full-suite PASS or established timeout root cause is claimed.

Local provider: cached API1.73.1 image SHA
`c24fb33cc2fa38d0f9582a30312907fc56da333fb9ba0646833186197e4982f3`, private
file-backed16MiB tmpfs, loopback only, queue disabled, outbound masquerading disabled.
PostgreSQL17.6.1.167 SHA
`6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb`.
The accepted fixture launcher is reused with only its fixed test-entry path changed.
Disposable credentials/containers/network are removed; no Hosted key or object is used.
This is not Hosted S3 durability, replication, all-delegate termination or power-loss
certification. No public supplier PDF, Provider replacement or alternate upload protocol.

## Security assumptions and activation gates

1. Source v2 Owner Review must approve the profile/DTO/SQL and preserve the distinction
   between complete ACK, byte MATCH, Beta logical completion, remote obligation and FINAL.
2. Owning reservation/staging/dispatch/evidence ports must be implemented and tested with
   actual journal state, including crash-before/after grant/record, receipt-first recovery,
   current generation/ownership/CAS and protected UNKNOWN quota. A memory set is insufficient.
3. Deployment must register a persistent exclusive private stage node/root with suitable
   permissions and proven filesystem fsync/hard-link semantics. Partial/UNKNOWN aliases
   retain obligations; no age cleanup, quota release or remote delete is authorized.
4. Backend must be the exclusive authorized Source-bucket producer with one immutable
   content tuple per key for its lifetime. Broad service credentials require separate
   secret/role/operational review. Private bucket policy alone is not writer exclusivity;
   provider concurrent create-only remains unreliable. Disable if different bytes can
   reach one key or any opaque delegate can change key/content. ACK+GET remains weaker.
5. Hosted R3-compatible Core/Source installation, credentials/principals/grants, Storage
   registration, deployment, provider/Source runtime gates and sanitized HTTP error mapping
   require separate authorization. This checkpoint provisions none. Legacy R3/Catalog and
   historical migrations remain unchanged; no CLI temporary login or Hosted query was run.
6. Agent B's Native plan/SQLite56/recovery/catalog interface remains separate. No Native
   credential, public PDF endpoint, upload-success flag as authority or client DERIVED proof.
   Existing registration/independent seal/Publisher/Admission/read2 remain mandatory.
   Paid LLM, Production, C5/C9 and unrestricted Native runtime remain CLOSED.

STOP if the bridge needs an unreviewed Source field/trust transition, new ledger,
credential/provisioning, fabricated terminal evidence, automatic UNKNOWN retry/cleanup,
unprotected stage volume or nonexclusive different-content producer. Do not call
`trip_source_pdf_upload_finish` from ACK/GET. STOP at Backend-03A Owner Review.

## Exact changed-file manifest

1. `backend/src/app.ts` — one existing authentication helper exported; no route change.
2. `backend/src/sourcePdfBackendPreparation.ts` — dormant internal orchestration/ports.
3. `backend/src/sourcePdfPrivateStage.ts` — bounded private stage adapter.
4. `backend/src/sourcePdfStorageProducer.ts` — fixed ACK and independent byte observations.
5. `backend/src/sourcePdfBackendPreparation.test.ts` — CLOSED tests and optional real API probe.
6. `backend/src/__fixtures__/sourcePdfBackendLocal.mjs` — test-only local fixture runner.
7. `scripts/provider/flight-pdf-provider-local.py` — reused pinned disposable launcher.
8. `docs/trip/implementation/CP_FLIGHT_PDF_BACKEND_03A_EVIDENCE.json` — sanitized facts/hashes.
9. `docs/trip/implementation/CP_FLIGHT_PDF_BACKEND_03A_REPORT.md` — this report.
10. `docs/CURRENT_IMPLEMENTATION_STATE.md` — prefix only; preceding accepted bytes preserved.

Implementation commit/tree are recorded below after local verification. Documentation
closure commit/tree are returned in the completion response to avoid a self-referential
commit hash. No canonical integration/push is authorized.

Implementation commit: `095b430df5166db5bd7098f7a3751d71eaffc62e`.

Implementation tree: `0f09861cb1eb0fcc0adde9442b0974560cb0d0e0`.
