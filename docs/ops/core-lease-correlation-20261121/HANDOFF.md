# BETA09 Core lease correlation, source-only

Base1a6ac9653dfd82e1745c86625372cd075c68729c. Native is Beta Delivery Lead and Main integrator; Root2 alone deploys. Original Import85e5 Create and f1af link were reported COMPLETED/SERVER_VERIFIED by Native after redundant sheet reads stopped. Preserve those identities/results and the single successful Provider interpretation. Capability15s busy remains an open reliability issue, not resolved by the prior setup12→10 reduction.

## Exact observation and diagnosis

Existing logs prove d002… was15s pure lease wait, no SQL. Successful collections spent3.8–4.5s in12 setup calls and~2.1s TLS. They did not identify holder request/SQL. CAPABILITIES itself does not read a full snapshot; its current Actor/Person/epoch/scope-before-after/Gate checks cannot simply be removed. Core command execution already reads original Receipt before graph/command handling. No authority check is removed or cached in this candidate.

## Minimal delta

Reuse the existing sourcePdfTiming AsyncLocalStorage to carry only server-generated requestUUID and a static action. Wrap existing Core capability/command/receipt boundaries as well as collection. When a lease is acquired, retain that holder's diagnostic context. The already-existing coreLeaseDiagnostic error data is now logged by CoreHttp through strict bounded number/enum/UUID projection, with unknown properties stripped. The current held request may have changed during a wait; holderAge/action describe the holder at failure, not an assertion that it caused the entire wait. No SQL, parameters, Actor/Trip/Operation IDs, Token, raw error or caller-provided correlation strings are copied. Out-of-context calls keep their existing diagnostic shape and remain unattributed.

No acquisition/queue/wait/lease timeout, connection count, pool reuse, SQL, transaction, permissions, request/receipt semantics or retry changes. No new observability platform or configuration. New timing/error records are server-side only; response bodies unchanged.

## Validation and execution

65 focused tests across sourcePdfTiming/PgConnection/CoreHttp PASS; scoped lint PASS using Native's already-installed dependencies (the older canonical dependency tree lacks pg). Independent Review NO_BLOCKER. Concurrent test proves waiter diagnostics name the real held request, and log test proves extra sensitive properties are stripped. No Hosted or Provider call.

Native serially integrate then hand the resulting fixed software SHA to Root2 at a safe boundary after original readback/cold verification. On any subsequent legitimate busy request, correlate core_execution_failed.requestId and lease.holderRequestId/action/phase/age/wait/count against existing request and timing logs. Do not artificially resend85e5, create substitute IDs, or invoke AI to exercise diagnostics. Continue original-operation Receipt/readback; preserve UNKNOWN conservatively. This candidate makes the next remaining holder diagnosable; it does not declare contention fixed or production capacity validated.
