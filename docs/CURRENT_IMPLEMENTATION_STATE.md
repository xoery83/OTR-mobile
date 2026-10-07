# Current Implementation State

Date: 2026-10-07 (Pacific/Auckland).

## Current checkpoint — R1-C1 strict live-host input grammar

The final LOW input-contract correction is complete. Production admits only ordinary
plain data objects with the five existing field names; complete own-key/descriptor
inspection rejects hidden unknowns, symbols and accessors. Custom/null prototypes,
classes, detectable proxies and added inherited unknown/capability fields reject
before configuration/custody/secret/gateway/transport/dispatch. Linux-only composition
and fixture isolation remain unchanged.

Validation: strict-input/original A–G/startup/bundle/transport focused204 PASS;
additional authority/SQLite/persistence/sync328 PASS (overlapping counts), explicit
cold12 PASS; Linux63 PASS; Server84 security104 PASS/gates CLOSED; scheduler24 PASS.
Typecheck/lint/UI guard/build/format/whitespace and exact-base schema/sync preservation
PASS. No new regression or broader behavior change; full suite not rerun for this
narrow correction. Independent Review unchanged. Details/all answers are appended
under FINAL LOW R1-C1 in the Builder report. Next: final targeted Independent recheck.
LIVE-1 remains unauthorized. No commit/push/activation.

## Prior checkpoint — F1-R1 portable composition separation

Recovered review identified a production-reachable portable custody/fetch seam.
It is removed: production accepts only provisioning/config, always admits Linux
anchored custody and continuity before fixed native HTTPS construction, and rejects
legacy/unknown capability fields. No fetch identity or wrapper-shape security gate.
Portable root is fixture-only with its own fake credential/transport, absent from
server exports/imports and compiled Backend bundle. Shared validation, witness,
recovery/readback and existing executor logic acquire no security capabilities.
Original Linux filesystem F1 source/tests remain unchanged and regressions pass.

Validation: Linux63 PASS; focused361 PASS; actual startup7 combinations PASS;
Server84 security104 PASS; SQLite cold19 PASS; full2,643 PASS with same reproduced
exact-base Ledger failure and zero new final failures. Typecheck/lint/UI guard/build
and export/bundle/format/preservation checks PASS. Earlier intermediate parse failures
were corrected and rerun, not called baseline. Details/all answers are appended under
TARGETED F1-R1 in `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`.
Independent Review unchanged; no commit/push/activation. Next: targeted independent
F1-R1 recheck. LIVE-1 remains unauthorized.

## Prior checkpoint — Owner-approved Linux anchored F1 correction

The Linux-only contract from `architecture/CP15B_LIVE_W_LINUX_CUSTODY_SPIKE.md`
is now implemented. Custody requires Linux/procfs, safe descriptor-by-descriptor
admission from `/`, service-owned0700 root, private0600 files and capability checks.
All normal I/O uses the retained root FD; replacement and parent retargeting cannot
switch namespaces. File fsync, immutable hard-link publish and two directory fsyncs
precede ACK. macOS/Windows reject real filesystem custody; protocol tests explicitly
inject test custody and intercepted HTTP without weakening production admission.

Restart requires an opaque store UUID plus mount metadata provided independently
through trusted host provisioning, a matching preprovisioned private marker and exact
retained request pin before transport construction. Empty/replaced/missing custody
cannot permit provider replay. Metadata restore requires explicit host reattestation;
no new dispatch authority, native addon, schema or privilege is introduced.

The earlier macOS blocked attempt is preserved in the appended Builder report;
the Owner-approved narrower platform contract resolves that blocker. Independent
Review is unchanged. Next: targeted independent F1 recheck; LIVE-1 unauthorized.
Validation: Linux 48 PASS; focused331 PASS; SQLite cold19 PASS; Server84 security104
PASS; full2,613 PASS with same exact-base Ledger failure and zero new failures.
Typecheck/lint/UI guard/build PASS. Final evidence is appended under
TARGETED F1 — LINUX ANCHORED CUSTODY
CORRECTION in `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`.

## Prior checkpoint — CP15B-LIVE-W CLOSED host wiring

Fresh worktree `/private/tmp/otr-cp15b-live-wiring`, branch
`intelligence/cp15b-live-wiring`, exact accepted base/retained HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`. Changes are uncommitted; no push.
Original dirty checkouts and retained LIVE-0 planning input are preserved.

- DEV/FLIGHT_IMPORT_V1 private composition reuses the accepted CP15B executor and
  verified Server84 gateway. Normal startup supplies no actual issuer/session/
  workflow provisioning and remains CLOSED. TEST/PRODUCTION construction rejects.
- Dedicated environment resolver, fixed HTTPS POST with no redirects/retries,
  independent default-CLOSED host transport and one-shot gates, and bounded
  versioned response-model witness are implemented. Tests inject fake environment
  and deterministic HTTP; no actual developer-process key is read.
- Private immutable filesystem custody retains requests, raw responses, exact
  task/attempt/call/config associations and interpreted results before metering or
  install. File/directory fsync precedes acknowledgement. Persistent host mounting
  is documented but unprovisioned. No new schema or durable business authority.
- Immutable acceptance session binds one Account/task/attempt/call/request. Existing
  Server84 fresh mark CAS governs the one transport handoff across restart; lost
  ACK/MAY_HAVE_STARTED/UNKNOWN never replay. Raw response recovery repeats pure
  parsing/rebinding/CP13B under current disclosure authority, without provider I/O.
- Safe host readback is composed; complete server hold/price/cost reads use existing
  protected Admin/Recovery or documented operator-only read-only SQL. No grants/UI.
- Validation details and final readiness are recorded in
  `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md` with 2,609 full-suite passes, one exact-base Ledger failure, zero new failures;
  actual network-denied Server84 E2E and 104 security checks PASS.

## Accepted foundation and active schema

Server migrations are contiguous **1–84**, ending at
`20261007000100_flight_dev_dispatch_foundation.sql`, SHA-256
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
SQLite remains **1–50**; every migration and registry byte is unchanged by LIVE-W.
The 88 preservation hashes match. No Server85/SQLite51 is authored.

CP15B independent targeted F1–F4 recheck PASS supersedes its historical initial
findings. Recovery repeats current Account/Trip/material authority after custody;
mark serializes Trip revoke; immutable holds bind exact executing pins; calculated
schedule cost stays ESTIMATED independently of actual token quality.

CP14 Final Closure targeted PASS, A2/C2/B2 and CP13A/B remain accepted foundations.
SQLite50 continuations/attempts and `sync_operations` retain their separate owners;
the five C operation denials remain unconditional. CP13B owns interpretation;
CP13A owns reviewed canonical commands. Inbound does not schedule paid outbound.
Capture owns originals and adds no automatic Source authority. Source IO_UNKNOWN
provider terminality and canonical activation remain outside this checkpoint.

## Next checkpoint and critical boundaries

Next: final targeted Independent R1-C1 recheck. LIVE-1 provider use is **not authorized**. It needs
real dedicated issuer/session/workflow provisioning, persistent private mount,
official current model/currency/price revalidation, dedicated Mobile DEV key,
current internal Account/Trip/material authority, one-call Owner authorization and
explicit immutable monetary policy/scope/grant. Proposed maximum USD0.0049152 is
not activated. No Hosted Dev/Production inspection, deployment or real provider call.

DEV runtime defaults disabled/killed; TEST/PRODUCTION real dispatch structurally
CLOSED. Vision, Apple, fallback, shadow and public B2 remain OFF. No new endpoint,
scheduler, automatic polling, queue draining or Event execution. Never erase private
custody or reset identity to retry UNKNOWN. Retention grants neither disclosure nor
installation authority. Cached valid sessions keep offline access.

Authoritative next-task inputs:

- `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`
- `adr/2026-10-07-cp15b-closed-live-host-wiring.md`
- accepted CP15A preflight and CP15B implementation/independent targeted recheck
- API_CONTRACT, DATA_MODEL, OFFLINE_SYNC and DEV Backend deployment/runbook
- Owner-reviewed LIVE-0 report in `/private/tmp/otr-cp15b-live0-readiness`

Read only directly relevant additional files. No legacy Web reaudit or redesign of
accepted CP13/CP14 authority. Canonical UI primitives/glossary and UI guard remain
mandatory for later UI work; no UI is changed by LIVE-W.
