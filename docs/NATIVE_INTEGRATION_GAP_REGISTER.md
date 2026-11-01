# Native integration gap register

One Native register for Owner-coordinated integration. No entry authorizes a
Gate, Schema/RLS/GRANT, Provider call, shared deployment or cross-account access.
Current work remains local/default-closed; existing Pending/UNKNOWN is preserved.

| Gap | Owner | Blocked Golden Slice | Prepared Consumer Adapter | Minimum owning service change |
| --- | --- | --- | --- | --- |
| RT-PRIVATE | Auth/Core | Real private signal → authorized Pull, including revoke/regrant | Reviewed trigger410a956b; normal App lifecycle mount in local verification; no default transport | Authorized Actor/Trip subscription with expiry/revoke/invalidation semantics and qualified prior-grant disclosure; known UUID/404/join is insufficient |
| RT-PUBLISH | Core/Backend | Remote committed edit automatically notifies Native | Payload-free invalidation callback → existing Downstream; reconnect catch-up fixture | Publish small authorized change hint only after physical Core COMMIT; no Item/evidence body and no new Event Bus |
| RT-VERSION | Core/Backend + Native | Low-cost foreground checks | Version transport/token candidate; main45s discovery+focused fallback retained; reviewedCore poolf70d69cf not deployed | Cheap actor-visible version read preserving existing Reader authorization; actual cold/warm performance and equivalence verification, no trip-global visibility shortcut |
| FLIGHT-HOST | Native Backend + Provider/Usage owning writer | Flight number/date → real metered Search/Extraction suggestions → existing P2 Save | WebLabV1/native/Host candidates preserved; default-closed capability + response/draft fences | Compose reviewed Host into latest baseline; qualify separate workload/Search transport, price/budget/Usage and durable idempotency/UNKNOWN via existing infrastructure. Public cache stays MISS/no writes |
| FORM-INTERPRET | Import interpretation + Backend | P2–P6 document → typed suggestions in current Form | P3 synthetic draft-confirmation work; existing Manual repositories/Queue/Core Save reused | Form-scoped response adapter on existing Source/Task/interpretation, binding Account/Trip/request/current Form/Item/revision, typed candidates and evidence. No auto Admission/Save and no second Parser |
| FORM-OPTIONAL | Respective Core/domain writer | Persist unsupported optional fields/identity associations | Consumer must retain unsupported fields explicitly, not hide in Notes | Only required owning ports: P3 Contact/Instructions; qualified Flight/Booking/Ticket/Person mapping; unsupported transport/admission structures. These are excluded from supported minimal local slices |

Profile77/People/Invite are not prerequisites for the above normal Account paths.
Private Profile caller/migration coordination is outside this Native delivery
scope; no file-Writer handoff was performed by Native in this sprint. No repeated
per-interface requests; Owner coordinates protected integration after resource release.

P3 local progress (2026-11-01): the existing Stay editor now accepts an opt-in synthetic scan consumer, with per-candidate/per-field choices, exact Edit target, Form instance + Account generation + Trip + Item + monotonic UI revision fences. DEV-only `/day-feed-lab?fidelity=p3-scan&tripId=<authorizedTrip>[&item=<ownedItem>]` uses the real existing repository and normal Save. No scan entry is enabled in the normal product. Multiple candidates are separately reviewed; Apply updates only the current draft, never creates the other candidates automatically. Real interpretation, evidence and multi-object import/save remain Import-owned. No Hosted/Provider qualification is claimed.

## Prepared field consumers (local only)

| Gap | Owning writer | Blocked Golden Slice | Prepared consumer | Minimum integration delta |
|---|---|---|---|---|
| Form interpretation response | Import | Real P2–P6 document → suggestions | Opt-in async/cancellable Form review, explicit field choice, exact context and target fences; original Manual Save | Return authorized, evidence-bound typed candidates for current Form/Item/revision; no reviewed-source authority borrowed by Native |
| P4 optional supplier/vehicle suggestions | Native field adapter + existing Core contract | Optional rental detail adoption | Minimal Pickup/Return consumer already working | Add explicit typed optional detail projection; keep pickup/return independent |
| P5 operator/service/check-in suggestions | Import/Transport owning port + Native | Structured service/admission-field adoption | Legal subtype/endpoints/name/schedule consumer, rejects unsupported field keys | Preserve structured identities in formal port; never concatenate into Notes |
| P6 admission/ticket suggestions | Import/Activity/Ticket owning port + Native | Structured ticket/admission adoption | Name/Venue/Schedule consumer preserves current admission details | Formal field-specific evidence/identity projection; no invented Ticket IDs |
| Multi-object document save | Import + Native | Saving several stays from one scan | Per-candidate independent selections; explicit Apply to current draft only | Separate object selection/save contract; never silently write other candidates |

Normal product Scan remains absent. DEV-only previews and headless tests do not prove real OCR/DeepSeek or Hosted E2E. See `docs/ops/native-independent-sprint-20261101/FIELD_ADAPTERS.md`.

Enrichment Native checkpoint: Create auto debounce/once and explicit partial Edit are prepared. Keep/Replace now checks revision/session, including an actual edit-away-and-back regression. No additional Backend interface was invented. The existing Host capability/price/budget/Usage/idempotency/protected-scope chain still gates real queries; those gates were not opened here. Cache remains closed. See `docs/ops/native-independent-sprint-20261101/ENRICHMENT_NATIVE.md`.

Qualification boundary: scan consumers bind the UI revision and exact repository draft identity. This does not expose or invent the repository's private Core semantic revision/proof. A real interpretation response must use its formal owning Item/Revision evidence; the existing repository remains the CAS/permission authority at Save. Batch local independent review `fa184b68` NO_BLOCKER, 13 suites/164 tests PASS; iOS JS export PASS, no signed device/Hosted qualification.
