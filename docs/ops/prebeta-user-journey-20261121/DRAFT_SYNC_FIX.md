# Local-First draft repair candidate

Actual Build14 P3 and P4 Create showed the existing unavailable message after a long-open draft; reopening succeeded. The UI combines several error causes, so it alone does not prove an exact exception code. Deterministic SQLite/repository cases then reproduced the specific defect: an unrelated Item mutation expires an unsent Create/Edit through a Trip-wide fingerprint. P3 fails MANUAL_PLAN_CONFLICT; P5 fails MANUAL_TRANSPORT_CONFLICT; formal P2 fails MANUAL_FLIGHT_READ_CHANGED.

The fingerprint includes all local operations and the Accepted certificate. It conflated unrelated synchronization progress with this Item's draft validity.

Minimal Native-only repair:

- Existing read seam returns its already-validated local Person roster; a shared selector retains certificate epoch/access revision/Actor binding/roster and that full local Person intent. No new database table, queue, authority or HTTP contract.
- Keep exact Account/generation/Actor checks and current canonical validation.
- An unsent draft survives unrelated operation/certificate business-version changes only when authorization and this target's facts remain unchanged. Same-Item semantic revision/facts changes still fail; P2 retains full endpoint/time/terminal evidence and Sparse/provenance eligibility.
- Existing attempted/UNKNOWN retry paths and operation IDs remain unchanged. No auto-rebase of an already dispatched request.
- Existing P1 initial Accepted transition remains separately constrained by its old exact graph/operations/binding proof.

Red cases were observed before repair. Current six affected repository suites:196PASS; immediate shared Reader collateral suite:17PASS. Includes certified refresh Create/Edit, real access revision change rejection, full local Person intent mutation rejection, same-Item stale Edit, Creator/Source/Qualified/Booking negatives and exact replay/rollback cases. Two old tests requiring unrelated new Creates to conflict were updated to the Owner's Local-First behavior while retaining same-Item stale rejection and no-duplicate assertions. Scoped lint PASS; TypeScript retains only the same three Main baseline errors; UI guard PASS473legacy/180representative.

No Hosted/Schema/Auth authority change. No main merge/push. Fixed candidate SHA, independent review, signed Build15 and actual simulator retest are next; these local tests are not device/Hosted PASS.
