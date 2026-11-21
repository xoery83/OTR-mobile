# BETA11 default-closed composition candidate

Pinned Native base: `5370d1c1`. Auth reference: `a3a36651`. Preparation only; Auth/Core independent Review required before integration.

`candidate.patch` contains 14 byte-identical same-source owning/contracts modules, five incremental current shared-source changes, eight existing Auth tests, and three narrowly extended current tests (30 files). No old shared file replacement, Core changes, SQL/policy changes, env activation or business execution.

All three selectors require exact `1`; unset/0/false remain closed. The provisional read method is omitted from the outward runtime port. Existing internal `issueProvisional` is retained unchanged with its owning SQL policy; including the symbol does not activate it.

Validation: 231 focused tests; five real startup-handler tests using a mock server (no socket); 71 current Consent/MCP/Core/Parent tests. Typecheck, scoped lint, Backend capture bundle, diff check and patch application against the pinned base pass. Existing socket startup tests were not rerun after `listen EPERM`; no escalation. The upstream mixed Native-client DirectedInviteReadHttp suite is excluded, avoiding an unrelated Native repository import.

Single future GoldenSlice: normal directed A→registered B invitation, B own preview/request, A resolve/link, original receipt/member/private-visibility/cold readback. Actual Person/original IDs and a reviewed finite policy package are still missing; no execution readiness claimed.

See MANIFEST.json for file hashes and boundaries. Full logs: `/private/tmp/otr-beta11-composition-{tests-final,startup,compat,types-final,lint-final,build}.log`.
