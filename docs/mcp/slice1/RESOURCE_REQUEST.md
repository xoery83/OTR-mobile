# Slice1 exact shared resource request — prepared, not activated

Owner direction: OTR MCP Slice1 Consumer Edit E2E, 1 November2026. Photo confirms
DEV/AD5 release (Root delivery97c38c49). This is one resource-level request,
not a global DEV lease or a request to stop any Agent.

## Current facts and compatibility

- Shared main remains4e1bedfc; frozen MCP baseline4bc93ce8 already contains it.
  MCP branch has no backend/src/browser owning changes relative to accepted main.
- Live read-only baseline08:19–08:29Z: healthy container6093f935a06b7c4128cdcaa5f70900b5f1cb582a19ce544f30e0410c44a202b6,
  image64fccfa4dd6c95241a6a7378e0c9b5bfc8e609b0c2f325ec3d3f32d7627d199c,
  environment hashb12fdecb5b865bf3dab085587af7ea13d5e421ac320aeeeef01ed69f40ee6a75,
  HostConfig hashd50118467f4c6d4548e84b898f06116f03850202b81629f40abdbc032d89bd4c.
  These are observations, not future CAS authority; re-read before mutation.
- Image labelb25fc2bc alone is NOT the effective Auth source: actual
  /app/server-capture.mjs=b0ca9813df42e76f80f33907490be2d8f60d37a384e705c490892305bb0ae8a4
  contains the newer MCP QA loader/old-bb-only gate; /app/mcp/runtime.mjs=
  b8075ca9cfb345f7fc0d976778f8f365347c44cf444cacc7faa5c26d76806820.
  Guide2 is absent; MCP read/write config envs absent. Retain the actual qualified
  Photo+Auth composition rather than rebuilding blindly from old image label/main.
- Historicalbb0cb010 now independently APPLIED/rev2; no retry. Historic9b077556
  has no receipt at the current read, remains UNKNOWN (not proof of NoCommit), no
  resubmission. This Slice uses entirely new IDs in QA_CASES.json.

## Requested minimum owning integration

MCP-owned candidate supplies `toolProfile:"SLICE1_NOTES_EDIT"`. It exposes exactly
8 tools: guide, four existing Trip/Item reads, full legal edit base, Notes-only
update_trip_item PREVIEW/APPLY, and original operation status. No Create, Batch,
material reconciliation, field adapter, Domain bind, Ledger/AKA/Invite/Source.
Notes payload forbids title/dates/null/empty/whitespace-only clear; existing trusted
confirmation, Source preservation guard, current grant, Core CAS and receipt remain.
`SDK_CANDIDATE.json` pins the actual compiled SDK and51 source/config inputs.

Auth remains unique Writer for the following minimal existing-loader adaptation;
MCP has not changed those files or taken over the OAuth contract:

1. `backend/mcp/runtime.mjs`: pass the exact profile into existing createMcpHandler
   for the new Slice1 config only. Retain existing authorizer/issuer/resource/
   active grant/normal user-bound read+write ports/provider OIDC scopes.
2. `backend/src/mcpQaRuntime.ts`: an additive closed finite Slice1 config selects
   the existing QA actor and one existing client per non-overlapping run. Reuse
   existing30min maximum/fresh consent/60s token/active grant checks. Accept only
   fixed operation+digest entries in QA_CASES.json for the selected client; never
   reactivate historicalbb or9b. Confirmation entries initially empty; only after
   actual consumer Before/After and explicit human confirmation install that
   one approved entry by short config CAS. No model boolean becomes approval.
   Configuration approval can reuse the existing per-window config mechanism;
   no new authorization database or generalized approval engine is requested.
3. Fresh Claude clientd2b8167f-ee42-4ac1-b5ef-4dc003c0d141 first, callback only
   https://claude.ai/api/mcp/auth_callback. ChatGPT second only after Claude PASS
   and close, using its existing83504d3f-59d4-43fd-99b1-bebc54c40f7d registration/
   approved callback. Verify actual provider metadata before use; do not register
   a replacement/DCR client if it differs. Business write consent is fresh, not an
   upgrade of stale Read. Keep OIDC request scopes distinct from signed OTR scopes.
4. Safe diagnostics should retain guide/edit-base read tool names in addition to
   existing safe MCP log schema. Never capture tokens, OTP or unrelated browser data.

This is reuse of existing finite QA Read/Edit capability, not an authorization to
expand SQL/RLS/GRANT or production/general domain OAuth scope. If current Auth
controls require a new protected permission, stop that step and provide the exact
owning gap; do not infer or silently install it from this request.

## Resource and lifecycle

Root/owning Writer: build/review outside lock, then short CAS→Deploy→Smoke→Receipt→
Release. Preserve Photo Runtime/config/mounts/custody/provider state byte-for-byte;
only the reviewed MCP bundle/loader and finite MCP QA config are in scope. No AD5
or other device. A second short config CAS is allowed only for the exact human-
confirmed Notes approval; release after it, not after the entire business E2E.
Root must confirm the available safe activation/close control before any OTP or
Consent. Fresh actual authorization/grant/session, not copied other-line sessions.

Failure: retain original IDs; UNKNOWN only original receipt GET. Never blind POST
or alternate identity. Expiry/revoke stops writes. Close exact new QA grant/session,
remove only this MCP config, restore exact existing Auth control state, read back
healthy closed status; retain accepted rows/receipts and Photo state. No long
Root lock; ordinary business E2E uses its own Account/Trip after release.

## Actual consumer and readback

Claude existing connector UI is available but stale: old6-read/4-write discovery,
requires fresh reconnect/consent and new8-tool discovery. Start a new consumer chat,
ordinary request to append one synthetic Notes line to the named existing Stay;
provide only the finite operation tracking UUID, not a scripted tool sequence.
AI must obtain guide/fields itself and show current Before/After. Owner explicitly
confirms that concrete diff before trusted approval/Apply. No consumer sends Create.

Run `node --import tsx scripts/mcp/slice1-readback.ts baseline Claude` once before
business execution (already read08:29Z, target rev2, root SHAe19ebfb1…); any current
revision drift stops without rebase. `after Claude` performs only readonly SQL,
validates formal receipt/hash/canonical intent via existing verifyGoldenReadback,
compares every other root field/field_state and all Item children to baseline.
ChatGPT is a new operation at next revision, with independent fresh baseline,
OAuth/Consent/discovery/preview/confirmation/receipt/readback after Claude PASS.
No SDK or SQL-only success is reported as consumer PASS.

Local candidate: independent scoped review NO_BLOCKER;265 MCP regression tests,
scoped types/build PASS. Root types and readback runner are checked before handoff.
This packet is NOT an active grant, human Notes confirmation or deployment receipt.
