# CP-LLM-03A Canonical Integration Readiness Report

2026-10-12 (Pacific/Auckland). **CLOSED integration candidate prepared; STOP AT OWNER REVIEW.** No canonical merge/push or activation occurred.

## Exact prepared baseline and tree

- Branch: `codex/cp-llm-03a-canonical-prep`.
- Worktree: `/private/tmp/otr-cp-llm-03a-canonical-prep-20261012`.
- Verified local main: `c0a69204fab3e663356a7f34406d580147869aeb`; actual remote `git ls-remote origin refs/heads/main`: `12693e3c1513d678bd3fe0190bb830d79f262b49`. Local main advanced through the accepted DL1 integration; remote remains the Owner's last confirmed baseline.
- Accepted LLM source: `af1cc93ff99257124452f091221b1f978cdbb774`. All23 original authored SHA-256 values verified unchanged before preparation.
- Prepared implementation commit: `5b5bc093f5386017180e2b27d01959ae1efafda0`, parent `c0a69204fab3e663356a7f34406d580147869aeb`, tree `bb3972d30016a992e9b2757780ef6726c7e9736f`. This exact implementation commit has23 changed paths. A documentation-only follow-up adds this report and the25-path final manifest. No product-code changes occur after the implementation commit.
- Integration plan: review the implementation commit and documentation follow-up on this branch. If separately authorized later, recheck current main and the canonical dirty handoff, preserve all concurrent files, then integrate this candidate using normal Git operations. No reset, forced update or push is prepared or authorized.

## Reconciliation and hash preservation

22 of23 accepted files are byte-identical to `af1cc93`, including Facade, registered Profile, Technical Witness schemas, SQL, host compatibility, vectors, tests and accepted reports. The sole reconciled accepted path is `docs/CURRENT_IMPLEMENTATION_STATE.md`: a short CP-LLM-03A header precedes the entire current canonical file verbatim, including current Core/Capture/Platform/Experience entries and the existing uncommitted Capture/Platform suffix. That suffix is included only in this isolated shared-file reconciliation explicitly requested by Owner; unrelated Platform reports and generated files are excluded. Canonical dirty status and all captured dirty file hashes remain unchanged.

The original CP-LLM-02A report/manifest records the historical acceptance snapshot and its old Git/chain status. This report records the subsequent committed, combined-chain, current-main preparation; historical evidence was not rewritten.

`otr-model-task-v1` request/result/facade interfaces and the fixed import1/EXTRACT/TEXT/FLIGHT_IMPORT_V1 profile are unchanged. Prompt, minimizer, privacy, output schema, canonical JSON/SHA-256 vectors and immutable policy bindings are preserved. Private inputs retain Account/reference/digest/byte-count/attempt association. Structural technical output remains independently retained and revalidated through private custody; semantic interpretation/REVIEW and `response_sha256` keep their existing meaning. Metering remains nullable/pending where evidence is unknown.

Current Capture interpretation/quality/enrichment, continuation repository/router, Backend startup and Linux anchored private custody files remain byte-identical to current main. Existing CP14/CP15 Gateway, Router, Continuation, Custody and Usage Ledger are reused. No gateway, scheduler, accounting ledger, automatic multi-paid retry, fallback, shadow or semantic repair was added.

## Migration dependency evidence

Order: Core `20261011000100` through `20261011000800` (85–92), then `20261012000100_model_task_protected_admission.sql`.

All eight current canonical Core migration hashes and both foundation/publication SQL fixture hashes match the already proven immutable Core pin `ee603f5dcb60b42d9b37e4fb9a20feebd8026f27`. No further migration is allocated in the prepared baseline. Historical Server83/84 and all Core85–92 bytes are unchanged. LLM migration SHA-256: `efee375bec1da7c12d33e7d7994d8983ad9fb32ba7851a56cc4f82b550d65e94`.

Reused combined network-none disposable PostgreSQL evidence: **23 grouped assertions PASS** (20 independent LLM groups plus3 combined-chain groups). Actual reserve/mark roots prove concurrent independent callers, winner commit/rollback, exact replay/no additional Call/START/Hold/binding, changed binding rejection, TERMINAL/UNKNOWN lifetime uniqueness, restart, deadline, conservative Hold ceilings, Account/day budgets, scope rotation, cancellation/revoked authorization, historical unbound recovery/no redispatch, FORCE RLS/direct role denial and immutable writer/privilege guards. Core foundation/publication assertions and final Core/LLM CLOSED checks also passed. No unnecessary repeat was performed because inputs and function-producing SQL are exact matches.

329 original public functions were preserved by Core installation. LLM changes exactly the two approved protected roots and preserves347 other preexisting functions, including Core/Source functions. Final `pg_get_functiondef` SHA-256:

- `flight_activation_reserve_call(jsonb,jsonb)`: `996f26a4e52c26dbbd306bd4c26dbf4d8df670fe1c56dfc468b78b4d8aa72315`.
- `external_integration_mark_dispatch(jsonb,jsonb)`: `5aa0d0e7464a071b86ad95bc72f3a578793fdd8a4ecdbbbd22e45db50accd900`.

Full prior evidence/maps/pinned fixture bytes/executable rehearsal remain at `/private/tmp/otr-cp-llm-integration-preparation/`; current equivalence proof is `/private/tmp/otr-cp-llm-03a-evidence/sql-reuse-evidence.json`. This is source and disposable-fixture evidence, not a Hosted installation claim.

## Combined compatibility verification

- Network-none Linux, locked cached runtime, one worker: **501 PASS /4 SKIP**,14 passing suites and1 skipped suite,137.13s. The exact15-file test list is in the manifest. Covers Model Task/Profile/Witness, dispatch/privacy/usage, continuation, Router, anchored custody, startup CLOSED and current Capture first-stage/interpretation quality/REVIEW behavior.
- Skips: optional `F1_CUSTODY_MODULE` child process, optional `LIVE_W_SERVER84` full bridge, non-Linux denial case on Linux, and real HTTP/TLS/SQL TEXT runtime fixture without its dedicated configuration. None was silently bypassed or weakened. No provider call occurred; network none was enforced.
- Local combined-tree typecheck **PASS**; local and network-none Linux Backend builds **PASS**. Touched code ESLint/Prettier and whitespace checks **PASS**.
- Additional emulated Linux full typecheck exceeded220s without compiler diagnostics; container removed. Local full typecheck passed. Linux Backend build was completed separately without rerunning the501 passing tests. This environment limit does not certify Linux full typecheck and remains explicit.
- The first container exited before testing because the cached image entrypoint interpreted `sleep infinity` incorrectly. Only the task-owned launcher was corrected to explicit `/bin/sleep`; no code, test or assertion was changed. All task-owned containers were removed.

## Concurrent conflicts and resolutions

Agent B `fdd5a5c38660a7942b19fee0d65af7144d1aed19`, Agent3 `fb8dbc9923153cbf20aa13c150dcea40f3961967` and DEV Backend `12693e3c1513d678bd3fe0190bb830d79f262b49` overlap the accepted LLM manifest only in the shared handoff. Agent B and Agent3 inspected worktrees are clean. Their owned code/migrations were not edited. Core/Capture/DEV/G2/DL1 code is taken from current local main; no uncommitted code from other workstreams was imported.

The prior shared-document content conflict is resolved in the isolated candidate by retaining all current canonical bytes beneath the LLM header. Canonical still has its original uncommitted suffix; its later Git handling requires deliberate preservation during separately authorized integration. No security, migration-order or TypeScript contract incompatibility was found. This preparation does not certify newer unaccepted Native/DEV work on other branches.

## Activation gates and remaining Owner decisions

| Boundary                                      | Prepared state                   | Later authority required                                          |
| --------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| Local CLOSED tests/build and isolated commits | Complete                         | Owner integration review                                          |
| Canonical merge/push                          | NOT_AUTHORIZED                   | Exact candidate/base and shared-file approval                     |
| Normal Model Task/paid dispatch               | CLOSED                           | Explicit provisioning and bounded execution authorization         |
| LLM Provider                                  | NOT_CONFIGURED in normal startup | Separate provider/configuration/credential approval               |
| Flight Data Provider                          | NOT_CONFIGURED                   | Outside this work package                                         |
| Hosted migration/Backend deployment           | CLOSED; not contacted            | Separate deployment and actual role/custody verification          |
| Input/output custody runtime                  | CLOSED/unprovisioned             | Trusted anchored store/session and current Account/Trip authority |
| Core AUTO, C5/C9, Production                  | CLOSED                           | Separate owning decisions                                         |

Normal `server.ts` supplies no provisioning to `initializeDevFlightLiveHost`; it returns CLOSED before reading provider environment values. The unchanged startup regression proves this even with synthetic gate/key/session values. Facade is an explicit read seam with no automatic dispatch lifecycle. No real backend environment, credential vault or Hosted state was read; NOT_CONFIGURED describes the prepared normal startup path.

Before later DEV LLM use, Owner must separately approve canonical integration, exact Hosted migration/runtime deployment scope, private custody/session provisioning and current authorization checks, provider configuration/credentials, one bounded paid Task/cost ceiling/deadline, metering/recovery verification and stop criteria. No provider selection or implementation is proposed here.

Full-repository regression, native/device, real HTTP/TLS/SQL TEXT fixture, Hosted acceptance and paid-provider execution were not repeated. Prior23-group SQL evidence and501 focused tests are bounded CLOSED proofs, not activation approval.
