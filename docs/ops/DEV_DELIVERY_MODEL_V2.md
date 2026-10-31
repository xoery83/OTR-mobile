# DEV Delivery Model V2

Owner approved 2026-10-31. Adopt single Hosted DEV with short resource-scoped
release sections and existing isolated validation. No second Supabase, new queue,
orchestrator or deployment platform. This changes delivery procedure, not business
Authority. Reference: [investigation](DEV_SERIAL_BOTTLENECK_AUDIT_20261031.md).

## Parallel QA and ownership

Normal DEV API E2E needs no global reservation when it uses a valid normal Session,
approved synthetic Account/Trip/Source/Item, existing business qualification and
unchanged shared runtime/config/SQL. Respect Provider cost/concurrency/holds/expiry,
object conflicts, Auth fences, same-operation receipts and UNKNOWN recovery.
No access to another lane's private QA objects. No automatic retry of UNKNOWN.

Only the relevant unique Writer serializes:

| Resource | Exclusive change section |
|---|---|
| Shared Backend | Same service image/version/config/mount switch and compatible smoke |
| Supabase DEV | Intersecting schema, protected functions, RLS, GRANT, policy |
| Protected Authority | EXECUTE, roles, Provider capabilities/protected config |
| Repository | main pointer and the same owning file; separate from DEV service lock |
| Device | Same UDID/session/lifecycle and DeviceHub GUI focus, only while used |

Import dispatcher and Enrichment runtime retain their proven version mutual
exclusion. Normal QA permission does not override runtime incompatibility.
No permanent admin access, expired-scope extension, hash rebase or automatic
acceptance of drift is authorized. Existing exact Gates and OID/Owner/ACL checks
remain binding. Migration/version changes must preserve in-flight UNKNOWN recovery.

## Release sequence

**Prepare outside lock → acquire specific resource → fresh CAS → apply → smoke →
independent readback → receipt → release.**

Coding, build, isolated PG tests, risk-proportionate independent Review, permission
scope, release/restore commands and the minimal new-object qualification chain
are prepared outside the lock. READY means those prerequisites are complete;
ACQUIRED means the actual named resource is held. Early notification is not a lock.
An unrelated lane's lawful QA is not a reason to reject READY.

Within the lock do only the final baseline/CAS, authorized change, minimal health
and security smoke, independent state/permission readback and receipt. Release
immediately thereafter. Continue business E2E outside the publication lock; its own
TTL/hold/watchdog remains effective. Failure releases or safely retains only the
resource that is actually uncertain. Do not release an unsafe state as healthy.
CAS drift/UNKNOWN require readback, not blind repeat or an incompatible rollback
that overwrites another lane's later change. Return one precise missing condition
for an incomplete package, not a request to repeat the entire engineering review.

## Minimum Release Package

```text
Workstream:
Owning Writer:
Target Resource:
Current DEV Baseline:
Candidate SHA / Digest:
Shared Write-set:
Required Authorization:
Existing Approval / Gate:
Dependency / Compatibility:
Expected Mutation:
Minimal Smoke:
Rollback / UNKNOWN Recovery:
QA Follow-up:
```

Qualify adjacent gates using the same minimal input (for example Source→Provider→
Review→Admission), only to the depth needed now. Combine related actual defects in
one legally approved package where possible; do not expand future Authority.

## Receipt addition to existing tools

Append these fields to the existing Markdown/JSON release receipt; no new service
or persistent queue. Use actual UTC timestamps as each event occurs, never planned
TTL, Git time, chat time, or guessed elapsed time. UNKNOWN remains explicit.

```json
{
  "deliveryModel": "V2",
  "resource": "exact resource and overlapping write-set",
  "workstream": "lane",
  "candidateSHA": "fixed candidate",
  "requestedAt": "UNKNOWN",
  "readyAt": "UNKNOWN",
  "acquiredAt": "UNKNOWN",
  "mutationFinishedAt": "UNKNOWN",
  "releasedAt": "UNKNOWN",
  "outcome": "NOT_EXECUTED",
  "firstFailure": null,
  "releaseProof": null
}
```

Each timestamp is recorded when the event actually happens. READY does not populate
acquiredAt. mutationFinishedAt does not populate releasedAt. releaseProof links the
actual CAS/smoke/close/lock-return evidence; scope TTL is separate. On failure keep
the real times and first failure, including UNKNOWN for unconfirmed events.

Reuse existing read-only preflight, CAS/rollback, protected transaction and close
adapters. The minimum integration for the next natural Photo release is these
fields in its existing receipt, not a new generic runner. Do not modify frozen
approved SQL or bypass its maintenance permissions to add reporting. Any future
necessary automation wrapper gets a focused test; no speculative framework now.

## Notification / adoption snapshot

| Lane | Delivery | Adoption / current difference |
|---|---|---|
| Import (this thread) | Received directly from Owner | ADOPTED; Photo coding/isolated PG outside lock. New protected pin body still needs exact Gate; existing Nov1 expiry unchanged. No active release lock held. |
| Native | Chat notification sent successfully | ACK / ADOPTED in chat reply; normal Core/downstream/iPad QA does not reserve service. Publisher/subscriber/version changes retain own Writer/Authority checks. Existing outer-COMMIT candidate Writer unaffected. |
| Auth | Chat notification sent successfully | ACK / ADOPTED in reply. OTP/Adoption/Person QA parallel under existing grants; Parent8079+dc43121b remains candidate, not READY pending owning Review/new EXEC Gate. |
| MCP | Direct sending rejected by automatic approval; agent independently read the forwardable notice | ACK / ADOPTED in incoming chat reply. No rejected-send retry or indirect relay. OAuth/public access/new grants remain separately gated. |

No lane was asked to stop coding, restart a passed E2E or redeploy accepted code.
Native/Auth chat IDs remain their established coordination destinations; this
snapshot is delivery evidence, not a new authorization register.

### Forwardable MCP notice

> Owner adopted DEV Delivery Model V2 on 2026-10-31. Normal approved QA Core
> Read/Create/Edit/Receipt and Nelson Preview/Apply do not reserve global DEV.
> Request only the specific shared Backend/SQL/config/main change resource; code,
> build and review outside the lock. READY is separate from ACQUIRED. After fresh
> CAS, apply, smoke, independent readback and receipt, release the change lock.
> New release receipts record requestedAt/readyAt/acquiredAt/mutationFinishedAt/
> releasedAt; old missing times stay UNKNOWN. Existing QA data, cost/hold/TTL,
> OAuth/public-access Authority, same-op UNKNOWN and hash drift rules are unchanged.
> Continue current work; do not repeat passed E2E. Confirm adoption when received.

## Acceptance and next natural example

Rules/package/receipt template fixed; Import adopted, Auth and Native acknowledged, MCP independently read the forwardable notice and acknowledged adoption. Ordinary authorized QA is no longer a
publication-lock request. This document authorizes no additional SQL, Role,
Provider, production access or scope extension.

**V2 DELIVERY PASS for the first natural release.** Owner approved Photo repair
9bc5dea4 was installed CLOSED on the original DEV, independently verified, and
its specific resource lock released before the normal Photo E2E. No extra release
was manufactured for this demonstration. Five actual UTC events:

| requestedAt | readyAt | acquiredAt | mutationFinishedAt | releasedAt |
|---|---|---|---|---|
| 2026-10-31T01:44:26.929496Z | 01:44:32.694603Z | 01:44:32.694866Z | 01:44:38.779959Z | 01:44:44.122507Z |

Exclusive section ~11.43s; this is a measured single release, not an average or
promised saving. [Actual receipt](universal-product-20261028/photo/first-lookup/v2-release-receipt.json)
and [independent readback](universal-product-20261028/photo/first-lookup/dev-install-readback.json).
Function identity/ACL and full graph/schema ACL preserved, PNG/PDF CLOSED,
no Host/main change. Native/Auth were told the resource had been returned.

Subsequent normal Photo Analyze acquired the same Source APPLIED but stopped on
a Native receipt decoding bug; its separate finite business session was safely
closed with compatible reader retained. That business failure does not invalidate
publication lock release and is not a Photo E2E PASS. No second environment or
new deployment platform was created. New protected changes still need exact Gates.
