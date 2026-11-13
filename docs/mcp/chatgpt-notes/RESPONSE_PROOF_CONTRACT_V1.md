# Response proof v1 — local SDK candidate

Status: LOCAL_SDK_QUALIFIED / HOST_LOADER_COLLECTOR_PENDING. Default closed.
No authorization, deployment, issuer, OAuth, permission or business operation change.

## Existing request-log extension

The existing McpLogEvent retains requestId (server-generated UUID), tool, status,
durationMs and existing safe error fields. Add optional `responseProof`:

```json
{
  "version": "otr.mcp.response-proof/1",
  "kind": "EDIT_BASE",
  "inputSHA256": "64 lowercase hexadecimal characters",
  "outputSHA256": "64 lowercase hexadecimal characters"
}
```

For kind PREVIEW add required `previewDigest` (64 lowercase hexadecimal characters).
For EDIT_BASE previewDigest must be absent. Keep the nested object strict; only
these fields are accepted. inputSHA256 and outputSHA256 always require 64 lowercase
hex characters. Version and kind are exact literals, not arbitrary strings.

The actual SDK log is computed in mcp/server.ts from the final serialized JSON-RPC
body after SDK validation, before it leaves the handler. It requires all:

- Existing SLICE1_NOTES_EDIT profile, a single non-array tools/call request, and
  matching final JSON-RPC response id. Notifications and batches cannot have proof.
- HTTP200, no protocol/tool/auth error, valid existing input/output schemas,
  current token at the final output check and again after server.close().
- get_trip_item_edit_base with SERVER_CONFIRMED, or update_trip_item in default /
  explicit PREVIEW mode with outcome PREVIEW and valid 64hex preview digest.
- No Apply, other tools/profile, failed/expired results or confirmation result.

inputSHA256 = existing contentDigest(actual call.params.arguments).
outputSHA256 = contentDigest(actual final result.structuredContent).
contentDigest uses existing canonicalCoreJson, so key ordering does not change
hashes. Input defaults are not synthesized: omitted mode and explicit PREVIEW
are distinct original inputs, and must not be silently equated by the verifier.
requestId is the correlation key of this HTTP request, not an Operation ID.
The proof is emitted within that exact request log, not an unbound side log.

The log contains no raw tool arguments/results, Notes, actor/account/client IDs,
Session, Token, Grant, headers, or source text. Existing metadata fields unchanged.
The hashes remain restricted diagnostics; this is not a public analytics feed.
Logging/parsing/hash errors cannot change business responses or authorize actions.
No new endpoint, tool, configuration option, parser or dependency is introduced.

## Verification and limits

Root's trusted collector captures the correlated server log. Independently hash
consumer-visible quoted arguments/structuredContent with the same existing
canonical algorithm, then compare both hashes. Check actual tool, success kind,
request correlation and exact original277/CAS2/digestfc18 privately as well.
A mismatch, missing proof or filtered field stops confirmation installation.

This proves a final handler tool response was produced. It does not prove network
delivery, client consumption, user confirmation, NoCommit, business APPLIED or
persistence. Actual consumer confirmation/Apply and independent receipt/readback
remain mandatory. The existing quoted8f4 output has no such contemporaneous
proof and must never be retroactively upgraded.

## One owning handoff

Root updates only the actual finite loader allowlist and existing
safe_mcp_close_logs.py collector allowlist. Preserve this nested object, validate
strict literals/64hex/kind-specific previewDigest and retain requestId/tool/status.
Reject/drop malformed proof without logging arbitrary nested fields. SDK-only
success cannot establish hosted collection success if either filter strips it.

Actual loader preimage (Root supplied; do not edit from MCP):
/private/tmp/otr-mcp-chatgpt-canedit-20261102/tree/backend/src/mcpQaRuntime.ts
SHA256 bb6870521ec510cc7493fd7a0438553172f3c48fff228afef97d1f230c235a8b.
Runtime wrapper8337 only forwards log; it is not the strict allowlist owner.
Do not use this branch's historical runtime reference as the deployed preimage.
Do not rebuild Capture or enable a business window for software qualification.

Tests cover real SDK Base/Preview final-output hash equality, canonical key order,
changed input/output hashes, privacy sentinels, error/expired/other tool/profile /
batch and both confirmation-denied and APPLIED cases without proof, and logging
failure without response changes. Local qualification and independent review are
recorded separately; hosted collection and consumer Apply remain untested.
