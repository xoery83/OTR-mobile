# Exact reviewed Source wake repair

Actual second-window progress: Source Candidate1 and READY Slot1, Core/receipt0. Native durable operation PENDING/attempt0. Its canonical intentSHAab17d1ab6179c624ab4300974b473de7764b6b4ec54fd16ba7b50716df1650ae equals the actual server Slot. Consumer had only enqueued/resumed and depended on an intentionally unavailable Manual QA dispatcher. Window closed12:32:21Z, policyfalse/scope null and defaultoff025 restored; independent900second watcher ROLLBACK_VERIFIED. Original Candidate/Plan/Slot/Queue preserved.

Minimal repair: existing data Sync module creates an operation-scoped entry into original Queue/Worker/Coordinator. Before selecting any queue it validates current AccountCtx, same pending operation/trip, CREATE_ITEM/ITEM, P1/P3, REVIEWED_SOURCE, nonnull SourceIntent and null policy. The queue is restricted to that Account/Trip/op; original atomic claim/lease/backoff, command/hash, receipt/capability and Source-finalization guards remain. No Manual QA scope change, Backend authority, second Queue/Mutation or feature retry loop.

Hook only composes data ports. Consumer only invokes sync after owning Prepare returns one exact expected command; success still requires FULL APPLIED/NO_CHANGE sameActorTrip/op/target receipt, applyReceipt, Source finalize and refresh. No receipt means SYNC_PENDING. Existing normal cloud-trip APPLIED readback also accepts P3 only in its Reviewed branch.

Directed first-fail P1/P3 consumer wake tests reproduced; five focused suites41PASS, types PASS, scoped lint/UIguard PASS. Positive P1/P3 dispatch while Manual QA scope remains malformed; Manual/operation/trip/account/target mismatches refused before queue selection; unrelated sameTrip queue untouched. Independent read-only /root/p1_source_review_independent NO_BLOCKER, no new cycle or feature-owned lifecycle. Initial reviewer capacity error was retried successfully; no model change.

Actual Core send/receipt/Day/cold restore remain NOT PASS, requiring a new precise duration approval for this existing READY operation. No new Candidate/Plan/Task/Provider.
