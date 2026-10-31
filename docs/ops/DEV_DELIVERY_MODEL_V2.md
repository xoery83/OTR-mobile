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
| Native | Chat notification sent successfully | Confirmation pending; normal Core/downstream/iPad QA does not reserve service. Publisher/subscriber/version changes retain own Writer/Authority checks. Existing outer-COMMIT candidate Writer unaffected. |
| Auth | Chat notification sent successfully | ACK / ADOPTED in reply. OTP/Adoption/Person QA parallel under existing grants; Parent8079+dc43121b remains candidate, not READY pending owning Review/new EXEC Gate. |
| MCP | NOT SENT: automatic approval rejected direct messaging twice, including after citation of Owner attachment | Forwardable notice below. Do not claim delivered or adopted. OAuth/public access/new grants remain separately gated. |

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

Rules/package/receipt template fixed; Import adopted, Auth acknowledged, Native
notified, MCP has a forwardable notice. Ordinary authorized QA is no longer a
publication-lock request. This document authorizes no additional SQL, Role,
Provider, production access or scope extension.

**PROCESS ADOPTED / LIVE RELEASE VALIDATION PENDING.** No artificial deployment,
SQL activation or paid call was performed to demonstrate V2. Next natural eligible
release must record all five actual times and prove short lock release before its
business E2E. Photo pin repair is currently a candidate, not an approved release.
No new Owner policy decision is needed for the procedural change; any new protected
Photo function body/maintenance delta still needs its precise owning approval.
