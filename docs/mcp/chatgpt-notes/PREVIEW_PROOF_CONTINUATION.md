# ChatGPT Notes continuation — proof gap only

Status: LOCAL_SDK_CANDIDATE_IMPLEMENTED_NOT_DEPLOYED. No active window or Apply authority.
Normative event fields: RESPONSE_PROOF_CONTRACT_V1.md; Root loader/collector pending.

## Evidence and smallest remedy

The consumer UI returned “unable to load response”; normal reload exposed the
completed response. Visible reasoning/more menus did not expose raw tool results.
The subsequent four JSON blocks are model quotations, not transport capture.
Root independently checked their expected content, but cannot establish their
association with the actual handler response. Do not promote them to raw proof.

Existing server logging already assigns requestId per HTTP request and records
invokedTool/status. mcp/server.ts computes each read and mutation result after the
owning call and checks token expiry before returning structuredContent. The
missing evidence is one hash of that actual validated result and its input.

Propose reusing this logger only for SLICE1_NOTES_EDIT profile:

- On a successful get_trip_item_edit_base return, record requestId/tool plus
  canonical input SHA256 and canonical structuredContent SHA256.
- On successful update_trip_item PREVIEW return, record the same pair plus
  the result's preview_digest. No APPLY diagnostics or broader tools needed.
- Bind each proof to the actual requestId already emitted by the logger; include
  tool-result JSON-RPC id only as a hash if transport binding requires it.
- Use existing canonicalCoreJson/contentDigest. Never log raw request/response,
  Notes, Account/Session/Token/Grant, attachments, headers, or private source.
- Emit only after successful output and final auth check, and only if the actual
  result is SERVER_CONFIRMED / PREVIEW respectively. HTTP200 alone proves nothing.
- Logging failure must not change the response. Logging proves handler output,
  not user confirmation, client receipt, business commit or APPLIED.

The consumer's quoted JSON can then be hashed and compared to the independently
captured actual handler result, with request correlation and same original277 /
CAS2 / digestfc18 confirmed privately. A mismatched or missing hash stops Apply.
If output changes through final transport mapping, hash the final serialized tool
structuredContent instead; do not record an intermediate result as sent output.

## Touch points and validation

- MCP owner: mcp/server.ts McpLogEvent and the two existing result-return sites;
  existing focused handler tests, canonical hashing helper from mcp/mutation.ts.
- Root owning runtime: the actually deployed finite loader's strict log allowlist,
  preserving get_trip_item_edit_base and accepting only bounded 64-hex proof fields.
  backend/src/mcpQaRuntime.ts is the repository reference; verify the deployed
  wrapper version before proposing an exact integration patch.
- Test unchanged success body, stable canonical hash across object key order,
  different Notes/Base produce different hash, no proof for expired/error/APPLY /
  other profile, logging throw cannot affect response, and sensitive values absent.
- Independent review before a minimal default-closed software release. No SQL,
  role, OAuth scope, issuer or permission changes. No re-audit of Auth/Core.

## Next actual consumer check

After local candidate qualification and Root software-only review, prepare one
exact finite continuation proposal for original277 / same3616 / CAS2. Recheck the
same item and original receipt; any drift or existing APPLIED stops submission.
Actual current Base/PREVIEW must have matching independent handler hashes before
Root can install the sole approved digest. Consumer explicit confirmation then
one Apply maximum, original-ID receipt query on UNKNOWN, independent Supabase
readback and closure. The expired8f4 authority must never be extended or reused.
Do not activate this proposal or ask Owner to approve an incomplete package.
