# Native integration gap register

2026-11-01 · Local hardening V2 · consumer source `8647a7e2`.
This register is an integration handoff, not authority to open a Gate or deploy.
Real Scan, private Realtime and public flight cache remain closed. No Hosted,
SQL/RLS/GRANT, paid Provider or Import authority changed in this work package.

## A — Native completed locally

| Capability | Current consumer / result | Remaining Native-only acceptance |
| --- | --- | --- |
| Realtime | Normal App lifecycle mount; `tripRealtimeTrigger.ts` → existing `tripDownstreamCoordinator.ts`. Account/Trip fences, signal coalescing, foreground/reconnect and dirty preservation across failed/skipped Pull. Joined backoff regression fixed `3701fedc`. | Hardware private-channel test requires the C ports below; synthetic lifecycle and actual SQLite pending/ABA regressions passed. |
| P3 Scan | `SyntheticFormScan.tsx`, `P3StayEditor.tsx`, `p3FormSuggestions.ts`: candidate choice, explicit Adopt/Keep/clear, current value, cancellable material selection, request/Account/Trip/Form/Item/UI/Core-base-revision binding. Real Form + call-through real SQLite/Core Save Create/Edit passed. | Device Edit of an owned Item and dark/Chinese remain unverified; keyboard opening and measured-width date panel passed; no permission bypass. |
| P2/P4/P5/P6 | One shared `FormFieldScan.tsx` / `formFieldSuggestions.ts` consumer, normal Forms and original Save. P2 same-airport terminal preservation, zone conflict checks; P4 structured supplier/class/model/plate; P6 structured session/admission note/entry. Actual SQLite single-field Edit preservation passed for P4/P5/P6. | Device representative draft adoption/Cancel recorded in the V2 receipt; no batch multi-object Save. |
| Enrichment | `FlightEnrichmentAction.tsx`: Create debounce/once, explicit Edit lookup, per-field empty adoption, Keep/Replace, cancellation and stale-context fences; partial/not-found/timeout/offline/budget/manual fallback. | Actual protected query/Usage verification belongs to B integration, not a new Native architecture. |
| Normal entry | P2–P6 Create/Edit render shared unavailable Scan entry when no interpreter consumer exists. No picker or submission in this state. QA-only explicit no-upload fixture is separately gated by DEV project and Bundle marker. | Real entry becomes available only with the formal consumer. Suggestions remain ephemeral; saved Item cold recovery uses existing Reader. No new durable unsaved Draft store. |

## B — Existing Backend paths to reuse

| Gap | Owning writer / existing interface | Prepared Native adapter | Smallest integration and real acceptance |
| --- | --- | --- | --- |
| FLIGHT-HOST | Native Backend + Provider/Usage writer: existing `backend/src/flight-enrichment` Auth/capability/request, Search+Extraction, budget/Usage/idempotency/UNKNOWN candidates and WebLab CachePort/TTL. Existing P2 Manual Repository/Core/Queue saves adopted fields. | Existing response projection and `FlightEnrichmentAction`; one field at a time, original draft and Save retained. No second DeepSeek client or ledger. | Compose reviewed Host into current approved baseline; authorized capability + one small Create query and one Edit conflict query; receipt, independent server readback, Usage/cost/idempotency and cold restore. Keep original request identity on UNKNOWN; public cache MISS/no writes. No activation performed here. |
| FORM-SAVE | Existing P2–P6 Manual repositories, Core commands, SQLite and Queue. | Shared suggestions only mutate the current original draft after explicit Apply. Private Repository CAS/creator/actor validation remains final Save authority. | Reuse prior Cloud Save evidence; when real interpretation arrives, verify one P3 adoption through the same Save and independent readback, rather than redoing all Cloud slices. |

## C — Formal owning-interface differences

| Gap / owner | Exact minimum request and response | Identity / permissions / errors | Consumer ready / blocked Golden Slice / minimum real acceptance |
| --- | --- | --- | --- |
| RT-VERSION · Core/Backend | Existing authenticated Reader context + Trip + optional prior opaque visible-version token → unchanged or new opaque actor-visible version. Conditional cheap read; never substitute a Trip-global counter for per-user visibility. | Current Account/Actor/Trip membership and Item visibility apply. Explicit auth/revocation contract; offline/retryable distinct from denied. Ordinary 404 is not revocation proof. | Version adapter/token candidate retained; current normal Pull fallback unchanged. Need measured cold/warm cost + authorized equivalence with visible collection before replacing frequent full reads. Core pool candidate `f70d69cf` preserved, not deployed. |
| RT-PUBLISH · Core/Backend | Existing physical Core COMMIT/APPLIED → small invalidation hint for authorized Trip scope; no full Item, private evidence or sensitive body. | Publish only after commit; duplicates/out-of-order allowed, no invented global authority. Hint is not data or a receipt. | Existing signal callback → existing Pull only; no direct SQLite or uplink write. Verify remote P3 Edit → hint → Pull → SQLite → Day Feed with duplicate/disconnect catch-up. |
| RT-PRIVATE · Auth/Core | Existing normal authenticated account subscribes to authorized Trip; owning transport supplies grant identity/generation, expiry and explicit invalidation/revoke behavior. | Known UUID, successful join and 404 cannot certify authorization/revocation. Account/Trip switch/unsubscribe cancel old callbacks. Shared scenario stays closed until safe revocation/expiry is proven; no new RLS/GRANT authorized here. | Client lifecycle and generation fences ready, default private transport absent. Verify A→B→A, revoked user receives no private hint/data, reconnect re-authorizes and catches up through existing Reader. |
| FORM-INTERPRET · Import/Backend | Existing authorized Source custody/task interpretation → versioned typed candidates bound to request, Account generation, Trip, Form instance/type, current Item and original Core base revision + UI revision; candidate target/evidence, supported field values and explicit Unsupported/Needs Input. Explicit null clear differs from omitted. | Use existing Auth and custody; never trust device temporary URI as cloud evidence. Mismatch/stale/denied/no-result/retryable errors distinct. No automatic Admission/Core Save. | `formScanResponse.ts` is a bounded synthetic advisory consumer validator, not a Source parser. Shared material-picker and typed field adapters ready; Core base revision now read-only draft metadata. Real source/task/material transport must be supplied by Import owning path. First real E2E: one P3 file → evidence-bound suggestions → explicit Apply → existing Manual Save. |
| FORM-OPTIONAL · respective Core/domain writer | Only missing formal manual owning fields: P3 Contact/Instructions; P2 Qualified/Segment/Journey/Booking/Ticket/Person associations; P5 Operator/Service/Check-in semantic structures; P6 Ticket/Voucher identities. | Preserve distinct identities and evidence; current legal P5 subtypes only. Unsupported fields are shown, never appended into Notes or fabricated. | P4 and P6 supported structured detail mappings are already done; do not reopen them as gaps. Expand only after a specific owning port exists; each requires one field-preservation Save/readback case. |

## D — Product decisions

No new Owner product decision is required for the supported local V2 slices.
Saving several candidates as separate objects, unsupported identity associations,
shared-cache commercial permission and durable unconfirmed Form drafts remain
outside this package. They do not block the prepared single-draft consumer.

## Smallest subsequent integration order

1. Core actor-visible version read, then safe private authorization + post-commit hint;
   verify the same P3 change through existing Downstream, including revocation.
2. Import formal P3 scoped interpretation through existing custody; connect the
   prepared consumer and one normal Save/readback. Other type adapters follow only
   their changed field/identity risks.
3. Existing Enrichment Host protected capability/Usage chain, small Create/Edit
   queries and manual fallback. No public cache or new table prerequisite.

No per-interface requests were sent during this local package. Profile/People
migration and shared Shell are unchanged. Local/fixture/device evidence is listed
under `docs/ops/native-local-hardening-v2-20261101`; none certifies real AI,
Hosted Provider or private Realtime E2E.
