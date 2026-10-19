# TH05 pending Preparation Core — independent review

**PASS_FOR_UI_COMBINATION** for `9d0f8d94694b264ce718a4114a1d725d8d717f10`, direct parent `e59b88495ff5228bb8efabb98c15793da4862f9e`. Six-file scope confirmed; no blocking finding. UI wiring/Native remains separate.

- Pending-only reads keep epochnull and LOCAL_MANUAL fingerprint token; accepted and mixed reads retain the actual certificate/epoch. No fabricated certificate/accepted state or receipt. Default production composition installs the existing strict LocalManual reader, not arbitrary UI pending IDs.
- Account/Trip/generation of manual scope must exactly match captured scope. Core accepted certificate is reread after the separate manual transaction; changed collections throw instead of silently mixing. Existing strict reader rejects known revocation and retains creator/owner/provenance authority. Foreign/unknown pending values do not become an accepted count through the selector's default path.
- Accepted projected entries are actor-filtered. Same-ID pending authority suppresses the old accepted row even if a pending hide/cancel makes that item absent from the readable pending list. Selector deduplicates the owning pending version before hidden/cancelled/skipped filtering; thus the old accepted copy is not resurrected. Only explicit verified pending Item IDs qualify; unsupported/unknown pending do not mask accepted entries.
- `itemCreatedAt` exposes only metadata for actually readable projected items from the same graph. It does not expose the whole graph or arbitrary foreign rows. Missing/unparseable timestamps produce no invented Recent row; existing creation-time order/top3 stays intact.
- New `resolveItemFromSource` rereads full current authority and exact token (scope/certificate/fingerprint), then restricts to current Recent. Epoch-only legacy resolver is accepted-only; it cannot open pending rows by substituting an epoch. Account ABA, revoked access and changed fingerprint reject stale actions.
- No canonical/Schema/Sync/UI mutation. This capability covers the strict existing manual pending projection; it is not evidence that every local-source/journal/legacy Item kind is now covered.

## Independent verification

Three relevant suites (`tripPreparationRepository`, `tripPreparation`, `tripLocalManualReadRepository`), excluding only the previously established inherited Floating09:00 case: **22 PASS /1 filtered skip**, start10:30:51 NZDT,1.88s. Actual file-SQLite normal pendingP1/cold, mixed accepted/private filtering/pending status change, recent-tap/source change, Account/generation/revocation and duplicate-hide selector tests pass. Full `tsc --noEmit` PASS. No unrelated UI/P2/full-repository tests rerun. Inherited Floating failure is not counted PASS and no skip was added to source.

Runtime hashes: PrepRepo `4adeb5bfd373f86264d1871cefa39b70a722b63b4b22943e198bfa735f6124fc`; selector `041967e4446ed739fb8b9a623c1077a57ab7932504331289909c93e42a77b7b8`; strict Manual Reader `be3b0404c7619b8fa3fdd92364e35bffac1c4389faf0245fe9deea4fc822f545`. Exact commit pins all tests as well.

## Consumer gate

Experience must retain sourceToken with the rendered snapshot and use the new owning resolver at tap for pending/mixed rows, not cast null epoch to a string, invoke the accepted-only resolver, or navigate from cached Item data without a current authority check. Then verify real local pending count/Recent/detail, cold restart, mixed same-ID hide/cancel and account/source changes on the authorized Native candidate. Code/test PASS is not TH05 Native/UX acceptance.

No author code edit, live DB, device, GUI, Hosted or new permission performed by reviewer. Only existing isolated tests and this private report; stop at combination handoff.
