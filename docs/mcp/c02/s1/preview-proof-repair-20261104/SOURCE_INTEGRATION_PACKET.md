# C02 Preview proof preservation — minimal source repair

Request: MCP-C02-S1-PREVIEW-PROOF-20261104-001. Lane B owns this fix.
Source base: main59a5415d. Candidate SHA is supplied with the handoff after commit.

Actual failure: e0d1 Consumer reached P3 Create Preview, request
31cb4c25-dc9f-4155-9870-48d93655f7f7, operation
a8c1e142-19c4-4d53-9d8e-fae4ad3ff616. Current deployed runtime log schema stripped
existing handler responseProof; close collector also omitted it. Consumer quoted
JSON reproduces the canonical digest but cannot supply independent server proof.
No Save was authorized or submitted. e0d1 is CLOSED_VERIFIED, never restart it.

Change: only backend/src/mcpQaRuntime.ts and scripts/mcp/c02-close.py, with their
focused tests. Preserve existing strict EDIT_BASE / PREVIEW hash object only for
HTTP200 without error/auth failure and matching tool. PREVIEW permits existing
create_trip_item and update_trip_item; EDIT_BASE only get_trip_item_edit_base.
Reject unknown nested fields, invalid hashes/version/kind/digest shape. Malformed
proof is omitted while safe request metadata remains. No raw input/output, token,
source, Actor or Grant is added. No endpoint/config/auth/confirmation change.

Root1 request: integrate only this reviewed source delta on then-current main,
resolve exact overlaps if needed. No Canonical/Core/SQL/GRANT changes.
Root2 later request: qualify a default-closed software update preserving latest
Auth/Import increments, retained MCP Host and shutdown paths. Do not deploy or
activate under this packet alone; establish current authority and short CAS first.
Repair must reach BOTH runtime filter and the pinned close collector. Verify with
a synthetic hash-only successful response and malformed/privacy negative before
any real consumer window. Source/build PASS is not deployed/Consumer PASS.

Validation: 41 focused runtime tests, 4 collector tests, Capture build, scoped
lint/format/diff checks PASS. Initial Typecheck only lacked existing consent-app
react-dom declarations in this new worktree; existing consent dependencies reused,
final result recorded in VALIDATION.json. Independent review recorded separately.

Return trigger: source SHA integrated, exact latest Hosted image/config/capture
qualified and closed. Then request any needed precise finite access. Same original
operation and unchanged synthetic input may be previewed; compare input hash,
output hash and digest to the fresh server proof. Missing proof blocks installation.
Show Owner exact Create preview before Save. Only APPLIED plus independent readback
allows subsequent same-Item Edit preview/confirmation. No historical UNKNOWN retry.
