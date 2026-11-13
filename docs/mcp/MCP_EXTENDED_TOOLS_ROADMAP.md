# Extended MCP tools — boundaries only

Owner's 1 November direction now supplies a concrete task-led follow-up plan:
[AI task contract](MCP_AI_TASK_CONTRACT_PLAN.md). People name reconciliation/AKA
and Ledger Expense–Item links are planned delivery slices with explicit owning
dependencies, not implemented capabilities or blanket activation authority.

| Domain         | Later tools                                                             | Required owning contract                                                                           |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Trip           | update_trip/archive_trip                                                | Metadata V3 CAS/receipt; lifecycle permissions                                                     |
| P1–P6          | SparseP2/typed P5 and clock/zone adapters, more edits, legal retirement | Existing family commands/temporal qualification; never silent clock clearing or hard-delete bypass |
| Documents      | upload/query/link/authorized original                                   | Source/Storage/Document ACL and retention; no parallel parser                                      |
| Ledger         | query/create/update Expense, Settlement read                            | Ledger money/valuation/operation/permission contracts; no automatic settlement confirmation        |
| People/Profile | roster/participation/private profile                                    | Auth/People identity, privacy and participation owners                                             |
| Invite         | list/create/revoke/accept                                               | Organizer/Owner vs member authority; explicit send confirmation                                    |
| Permissions    | current legal capabilities                                              | Owning server capability/read observations; no role inference                                      |
| Flexible       | Block/Choice/Pool                                                       | Flexible accepted planning state; no Choice→canonical assumption                                   |
| Import         | submit material/read Activity/confirm save                              | Universal Source/Task/Results/Admission, existing original evidence                                |

One standard server, shared business ports. ChatGPT Custom MCP Plugin and Claude
Remote MCP are first actual consumer clients; Gemini API/CLI next, then other
standard clients. Compatibility changes belong in metadata/transport adapters,
not separate Backend saves. Record the exact tested client/account mode rather
than extrapolate plan, region or historical Developer Mode restrictions.

No Production endpoint, pricing/billing, multi-agent orchestrator, general domain
repository, new sync engine, broad sharing/delete or financial action is authorized
by this roadmap. Public safety depends on Auth grant revocation which remains an
explicit owning gap, so shared-trip Beta readiness is not claimed.
