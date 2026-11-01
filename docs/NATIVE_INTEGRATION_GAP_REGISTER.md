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
