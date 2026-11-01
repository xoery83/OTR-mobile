# Account AI Usage Reader — exact owning gap

Status: **BLOCKED_BY_OWNING_INTERFACE** for Account-scoped server readback.
Golden Slice: Settings' committed Account reads existing persistent Meter receipts
through a trusted self-only reader, sees real provider cost/quality and cache facts;
unknown allowance stays null and enforcement remains off. No such reader is mounted.
This assessment reads fixed source only; it makes no Hosted or Provider request.

## Existing implementation to reuse

| Port / source | Actual capability | Boundary |
| --- | --- | --- |
| `src/data/auth/accountAiUsageReader.ts` | Existing injected reader validates Account/generation before and after IO, parses DTO and exact result Account | No default reader/HTTP route; missing port returns UNAVAILABLE, not empty or zero |
| `src/domain/auth/accountAiUsage.ts` | Existing bounded records, duplicate receipt rejection, Flight UsageSummary projection, nullable unknown cost and unconfigured allowance | Projection is not an authorized account history read or credit ledger |
| `backend/src/flight-enrichment/ports.ts` `UsagePort` | Account/Actor/Trip/request/digest-bound admit, observeStep and finish | Write lifecycle only; no read/list/history operation |
| `backend/src/flightUsage.ts` | Existing schedule-pinned completion command, exact prior-observation reuse and changed-observation rejection | `readCompletion(attempt)` is an injected worker exact-call read, not Account reporting; UNKNOWN→actual needs an owning contract |
| `backend/src/universalPersistenceHost.ts` | Existing normal Account/Actor and Task/Attempt/Call-bound usage append/settlement | No Account usage listing; do not expose raw retained Source/model material |
| `backend/src/externalIntegrationPersistence.ts` | Existing verified Account/Actor/context/command digest binding and protected persistence gateway | A verified caller field alone cannot turn an admin report into a self-only reader |
| `supabase/migrations/20261006000100_external_integration_persistence.sql` | Existing calls/usage events, immutable observations and `cp14_usage_projection(call)` handling corrections and measurement modes | Internal projection is not a normal-account authorized endpoint |

## First actual failure

The only existing aggregate command found in the bounded Meter source is
`external_integration_admin_report(context,command)`. It requires the dedicated
reporting gateway plus COST_READER qualification. Its strict command keys include
actor/integration/environment, not Account; its SQL aggregates calls by environment
and integration without `c.account_id=verified_account_id`. It may cover many
Accounts. It must not be called for ordinary Settings then filtered in Native or
an Auth array adapter. Adding an Account field to this command is rejected by its
strict key contract and still would not supply the missing owning authorization.

`external_integration_recover_exact` filters the verified Account but returns only
one call's dispatch/certainty/revision/fence and reservation metadata. It is a
SUPPORT_RECOVERY port, not usage amounts/history or a normal user report.

## Smallest missing owning difference

The existing Meter owner must provide one bounded, authenticated self-only read:
normal Account comes from trusted authentication; persistent calls are filtered
by verified Account (and applicable Actor) before projection/serialization. Reuse
existing usage observations, schedule/currency/quality and correction semantics;
no second token ledger, caller-auth flag, admin credential or client-side filtering.
Return only safe receipt/feature/token/search/fetch/cost/quality/tariff/cache facts,
with truthful incomplete/UNKNOWN status. Do not return raw prompts, Source IDs or
model prose. If paging is needed it belongs to this reader; the existing client
DTO bounds each snapshot to100 unique receipts, not an all-time completeness claim.
Any new protected function/GRANT needs its exact reviewed Gate before installation.

Once that qualified reader exists, inject it into `createAccountAiUsageReader` and
project its exact records through the already delivered DTO/View. No new wrapper
or guessed HTTP route is useful before that port exists.

Existing focused client tests already distinguish no-provider cache hits (zero
actual new provider usage) from unknown incurred cost, reject duplicate/missing
receipts and foreign/stale Account responses. Reuse that evidence unchanged;
provider cached-input tokens are not equivalent to a shared-cache no-call hit.
Failed business requests may still incur provider cost. Neither fact defines user
credits, billing units, periodic reset or entitlement. All such policy is unfrozen;
allowance values remain unknown and enforcement stays disabled.

No production code, test framework, Host/SQL/RLS/GRANT, Provider, Secret, Session,
Native shared file or payment behavior was changed for this gap assessment.

Import/Meter owning Writer confirmed this gap on2 November2026: no normal-Account
self-scoped history reader has been delivered. The minimum server-side filtering
and existing projection seam above is agreed; any new protected reader permission
still needs its exact Gate. UsageView remains UNAVAILABLE without that port.
