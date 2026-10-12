# CP-FLIGHT-E2E-B — Canonical → SQLite → Day

Baseline: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`.
Branch: `codex/cp-flight-e2e-b`; isolated downstream worktree.
Status: implementation/acceptance in progress. Local commits only; no merge/push.

## Narrow preflight and implementation boundary

W0 `otr-trip-core-read/2` actor-filtered collection and Item views are authoritative.
Core85–92, the v2 HTTP collection transport, SQLite54 complete-partition installer,
Core repository refresh, durable sync coordinator and `projectCoreDay` are already
integrated. The production Day reader only consumes the v1 SQLite47 projection.
The missing downstream seam is a local accepted-v2 Flight presentation adapter.

Read the installed complete v2 certificate, accepted graph and Person bindings in
one existing serialized SQLite transaction, retaining Account/Trip/access fences.
Do not include pending intents or Capture Candidates in this accepted read. Keep
v2 certificate/participation separate from v1 whole-Trip/UNASSIGNED authority;
never install v2 data into SQLite47. Use existing Core Day projection for accepted
local dates/roles and existing G2 presentation components. Preserve G2/TTR v1 query
behavior. This slice renders P2 Flights only; broader v2 family renderers are separate.
No schema, Core command, Source publisher, Capture adapter, provider, MapKit, sync
engine, runtime startup or Hosted activation change is authorized here.

## Acceptance and handoff

Pending focused synthetic collection/SQLite/render tests, cold reopen/offline replay,
account/Trip/visibility/participation checks and required static checks. Simulator,
native and Hosted acceptance must be reported separately; synthetic tests do not
certify those environments. Final manifest and F5/F6 seams will be recorded below.
