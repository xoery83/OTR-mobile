# Slice1 finite QA authority and Auth Writer scope — awaiting Owner

Status: PREPARED_NOT_APPROVED_NOT_ACTIVATED.

## Why explicit direction is necessary

Owner launched MCP Slice1, but Root/Auth confirmed that Auth's latest direct
instruction is client-only; its Backend Writer cannot change the loader yet.
Historical deac94b1 is COMPLETE_CLOSED and authorizes only originalbb, never the
new Slice1 operations. This Gate is the exact scope switch/new finite test
identity authority, not permission to replay that old Gate or old UNKNOWNs.

MCP candidate4908085d is coded/reviewed/tested. Root independently verified all51
source/config hashes and SDK7832ae51…; compatible Photo+Auth assembly is retained
at /private/tmp/otr-photo-cold-binding-diag-20261101/{tree,ASSEMBLY.json}.
Root has standing ordinary image publishing authority after owning code and QA
authority qualify, with fresh CAS/short release. No global DEV reservation needed.

## Exact requested Owner authorization

1. Allow Auth unique Writer to switch from client-only only for these two existing
   files: backend/src/mcpQaRuntime.ts and backend/mcp/runtime.mjs. Implement the
   additive default-closed Slice1 contract in RESOURCE_REQUEST.md; keep oldv3
   unchanged. Include direct tests and independent review before any deployment.
   Also permit an isolated Auth-owned Slice1 build recipe (for example
   scripts/auth/build-mcp-slice1-runtime.mjs), without changing the old default
   build path. It must verify all51 source inputs and reproduce the exact
   slice1-sdk.mjs SHA7832ae51e06deb8df439540f8ab8723ba1bcbc807993e44799721e624be2f8c1,
   alias @otr/mcp only to that fixed artifact, then bundle the reviewed loader.
   The old recipe hardcodes index.ts/old source-pins and MUST NOT be reused
   unchanged. Generated pins/build metadata are ordinary reproducible packaging,
   not a new Auth/Core capability. No other owning feature is included.
2. After code/tests/review, allow two serial existing-client finite QA rounds, not
   overlapping. Each has at most30min from its first temporary config change and
   access token at most60s, with the existing automatic close/control in place
   before OTP. Explicit fresh normal OAuth/Read/Edit Consent; no session copying.
   Grant checker must remain current before/after IO. No DCR/new OAuth scopes,
   production, private Nelson, finance, Source, AKA/Invite or device.
3. Only actor1f3d7935-1bdc-4952-8d7f-0f72077368c1,
   Tripcc44a705-6f43-41e0-a2f9-16f334b2a6b2,
   existing P3 Item11fdaec9-3305-4db0-a146-be78823fcf74 are writable, one Notes
   update per round. Full exact input/command/digest is in QA_CASES.json.

| Round                                      | Existing client / callback                                                                                                                                                            | New operation / digest / expected base                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| First Claude                               | d2b8167f-ee42-4ac1-b5ef-4dc003c0d141; https://claude.ai/api/mcp/auth_callback                                                                                                         | f10713fc-d86c-456f-a4c9-929a1cced3e8;48dc6e4b7a0c632c9414978df73d38a9287f5e236a6cc4d7e6bbb6007c71a09e; revision2              |
| Then ChatGPT, only after Claude PASS/close | Existing83504d3f-59d4-43fd-99b1-bebc54c40f7d and its approved https://chatgpt.com/connector/oauth/CYUxrs56rSrW callback, verify actual registration before use; no new localhost flow | 27bf1d80-3cf7-4fd7-bf9a-c88aeb70846d;24197bd3caef26a41fd66992f5db47664f24f91616ad45c39ff0fa601cce348f; revision3 after Claude |

4. Trusted confirmation entries initially EMPTY and APPLY denied. Each consumer
   must actually read current Trip/Item/Guide and show Before/After. Wait for the
   human Owner's separate concrete confirmation, then install ONLY that exact
   operation/digest by short CAS. This Gate itself is NOT Notes approval and no
   model assertion/Allow card can substitute for the human reply. No silent rebase
   on revision/notes drift. Notes only: nonblank string, no title/date/clear/other
   field, no Create/Batch/domain tools.
5. Auth is the named sole window/control operator; Root performs its planned
   short deployment/Config CAS, MCP owns SDK/consumer execution and never writes
   the same QA config key concurrently. Root coordinates deployment by fresh CAS→Deploy→Smoke→Receipt→Release. Preserve
   the actual Photo+Auth composition, environment/mount/provider/custody state;
   never rebuild blindly from old image labelb25. Confirm-only config change gets
   another short CAS/release, not a long global lock. No new SQL/RLS/GRANT or
   permission function. Only reuse already qualified finite OAuth controls; any
   genuinely additional protected change remains outside this authorization.
6. Stop on UNKNOWN/revocation/expiry; original receipt GET only, no new ID or blind
   POST. Historicalbb APPLIED is not resubmitted;9b UNKNOWN is not retried. Independent
   same-ID Supabase readback must validate formal receipt, Notes/new revision and
   every other root field/state plus all Item children. Close exact QA grant and
   own sessions and remove/restore exact temporary control/config on completion,
   failure or expiry; retain accepted data/receipts. Verify healthy released DEV.
7. Permit MCP Delivery Owner to relay this explicit human approval/scope switch
   and exact Gate to Root/Auth for the above bounded coordination. It does not
   authorize other messages/features or require another Agent to stop its work.

Local readiness:265 MCP regressions, scoped/root types and build PASS; independent
MCP review NO_BLOCKER; exact read-only baseline executed; compiled8-tool discovery
smoke PASS/no Backend or Provider calls. Consumer/Hosted remains NOT_RUN.
