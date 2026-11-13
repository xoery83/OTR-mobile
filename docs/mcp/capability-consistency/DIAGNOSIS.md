# Item canEdit — focused diagnosis, 2 November 2026

The prior shared Core read projection did not evaluate Item permissions:
`tripCoreV2Day.closedItemCapabilities` fixes every flag to false;
`tripCoreV2Views.projectCoreItem` returns it unchanged. `mcp/read.ts` parses and
passes that DTO through. This is not derived from consumer Consent, tool discovery,
Item Revision or an MCP cache. Root, the shared Core projection Writer, independently
confirmed this conservative unevaluated default.

Both deployed-source reads and writes hydrate the Actor through the same
`lockCorePgActor` implementation in tripCoreV2PgStorage (current Reader source
uses it at lines105/350; command storage at455). The flag mismatch was therefore
not evidence of a second actor-permission policy or an MCP permission cache.

The actual Notes command uses `executeCoreCommandV2`: verified current actor,
current enabled command gate, locked graph, CAS, admission and `applyCoreCommand`.
`SET_ITEM_TEXT` calls `target()` with management required, which uses the existing
`coreCanManage` predicate. MCP separately validates resource/scopes/expiry and exact
trusted confirmation/digest; it never reads canEdit as a write permission grant.
The actual e389 evidence shows one authorized APPLIED and unchanged unrelated data,
not a bypass of the false projection flag. Foreign/private and inactive actors must
continue to be rejected by the actual mutation authority.

## Fixed owning correction and boundaries

Root fixed the formal contract in `fe96aed1b077ed5e1d660aed764c1afe6facea19`:
only full Item Details computes `canEdit` using `coreCanManage(g,actor,"ITEM",item)`.
It means object-management eligibility, not runtime/command/Consent availability.
An unreadable Item still yields no projection. Day and all other flags are unchanged.
No new NOT_EVALUATED field is introduced and MCP performs no boolean-pattern inference.
The exact Views.ts/Views.test.ts/API_CONTRACT.md patch was integrated locally;
Root's unrelated Private Realtime parent and current-state history were not imported.

MCP Guide and EditBase description distinguish current Details object permission,
legacy/Day placeholders and actual execution gates. Raw booleans stay unchanged.
The focused regression proves current owner projection follows owning output,
private foreign/inactive actors fail, and a GROUP-visible nonmanager can read but
cannot apply SET_ITEM_TEXT. Root's projection regression additionally checks owner,
shared manager, private foreign and inactive cases. Fresh Backend authorization,
Confirmation, CAS and Receipt paths are unchanged.

Scope: MCP Guide/descriptions and focused regression; shared Core changes originated from Root and are integrated only as its exact reviewed patch. No Native UI, SQL, OAuth scope, Hosted deploy or QA write is authorized
by this diagnosis. ChatGPT requires its own finite access/save authority.

## Reporting

Previous E2E result was originally sent to Root without a stable Event ID. Direct
Mission Control lookup has now returned MC-ACK-READBACK-20261102-MCP-001:
Claude event mcp-claude-p3-notes-e389-20261102-001 and the same-ID STARTED/READY
submissions are PENDING_VERIFICATION on existing CAP-MCP-CONSUMER-EDIT nodes.
Snapshot738de012fdb02870/Publish5 already contains the scoped Claude audit evidence;
no execution transition is applied/published (transition snapshot null). Both
resubmitted event byte hashes match the ACK. Do not claim a new website state update.
