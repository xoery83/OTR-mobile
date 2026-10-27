# P2_SOURCE_REVIEW_SAVE_GATE — proposed, not authorized

Only this exact P2 business slice needs Owner approval. The consumed `02a061e1` resource repair and `ce2da465` dormant-airport install approvals do not authorize this Save. Ordinary default-closed software deployment remains covered by the Standing DEV Deployment Authorization.

## Exact scope

- Original DEV service `otr-dev-backend`, project `tuqigdxrvrerfewsxqgm`; no Production or real-user data.
- QA Actor `f4b059c5-8241-4ffb-aa15-37fa25474543`, Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a`.
- Retained Batch9 `a9be165b-5a90-4244-add7-d4977c9e7ba5`, Task `7338329a-46eb-8050-9bec-96376f08b296`, Run `8af82103-55f2-84ea-8e6f-445a15321cf6`, token `i1`; Source `66f7d254-9cf7-4915-82a2-fd526d633864`, original SHA `898bccf74ea63279b1aa43b49b8539625b97027e61c3e35dad14e6df2ed9d068`.
- Owning SETTLED result SHA `7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94`.
- Sole Core Item `ec73e4fd-c580-8063-96a8-ef7accda3748`, operation `50bfe576-c16d-8645-8cde-a355da5f13f9`, slot `0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4`.
- Source candidate `a85c1ab1-8dc4-8ff2-b0b7-4887a394b465`, Publication `2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f`, Plan `990d9af8-2a69-86ec-a827-2e1a337a9b09`.
- Exact Publication request SHA `42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40`; complete Plan SHA `30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f`. Full requests/identities are fixed in `P2_SOURCE_PROPOSAL.json` and `P2_REVIEW_SCOPE.json`.

Normal Native QA user reviews original and current Trip, explicitly selects NEW and confirms literal `NZ501` / civil departure date `2026-11-02`. Existing Source publication → Source Plan → owning Flight evidence/Admission → `CREATE_SPARSE_FLIGHT` creates only one PRIVATE/SELF P2. Core qualification remains **SPARSE**. Origin/destination text stays Source evidence; no confirmed endpoint, Place, clock, zone, Journey, Booking/PNR, Ticket/Entitlement or passenger binding is created. HIGH and generic `service` are not Admission; sealed LLM minimumFacts remains INCOMPLETE.

## Protected changes requested

Install `P2_REVIEW_DEV_INSTALL.sql`: replace exactly five existing functions, preserving OID, owner and ACL with NULL-safe pre/post hash CAS:

1. `trip_sustained_import_p1_capabilities(uuid,uuid)` — only this exact P2/Sparse/reviewed scope.
2. `trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)` — exact retained publication/Plan/target/operation, immutable accepted receipt and Source journal.
3. `trip_core_publication_guard()` — owning Universal binding required even if a Run is READY; only the retained PENDING Run can use this P2 publication exception.
4. `trip_core_guard_historical_source_association()` — exact same P2 binding plus actual accepted receipt for Source evidence closure.
5. `trip_core_finite_read_state_guard()` — normal read-revision increment only for this exact accepted Sparse operation/slot/intent/target.

Temporarily enable only the two already-installed airport identity rows in version `otr-dev-universal-p2-airports/20261027/1`, manifest SHA `19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9`: IATA_AIRPORT:AKL and IATA_AIRPORT:CHC, single QA date `2026-11-02`. Their installed resolver remains unchanged at MD5 `666ff90bad5c706a6007691a3328df75`, restricted to this Actor/Trip/date. This admits the Owner-reviewed airport identities for owning Source proof; it is not operating-flight or timezone proof.

Reuse existing policy JSON with family=P2 and all exact pins; one absolute expiry, no new table/column, RLS, GRANT, role membership, Secret scope, account/trip access, input objects, DeepSeek call or budget increase. Preserve the old UNKNOWN call, hold and actual consumption. P1/P3/P4–P6 permissions are not reused or enabled.

## Preconditions and one finite window

- Independent Review and exact-package isolated PG qualification pass; preflight still matches retained original, Task publication, Source revision, actor/trip access, function/ACL hashes and both dormant registry rows. Any drift aborts.
- Default-closed source Commit `088b49e51a36a5c699e3257d34ba8764398c1208`, image `sha256:77c7055e5dea1e89ac2e595e6890058ec7b14689105d692143a56e65d566dbef`, must first be healthy on the original DEV with normal QA Results200 and independent deployment handoff. Record its actual accepted container/config/mount hashes; it is the compatible rollback baseline for this business window.
- Coordinate short AD5/Metro8097 input use. Original/Trip/NEW review must be ready before timers. No Session/Keychain copy or other Worktree changes.
- Reuse the existing finite-window controller and independent remote watchdog pattern, with a fresh durable one-use run directory and fixed package hashes. Arm before activation; SQL deadline is the same fixed start+900s. Local close starts at +660s; watchdog restores the compatible default-closed container by +900s. No extension/rearming/reset. Existing Source Review Backend composition and independent Native P2 opt-in are temporary for this scope only.
- `P2_REVIEW_ACTIVATE.sql` refuses any existing Publication, candidate, Plan, slot, Item or operation receipt. If anything exists or outcome is UNKNOWN, reconcile the same IDs; do not open another window or replace IDs under this approval.
- Normal App performs the formal chain. Collect actual Item/Mutation Receipt, independent Supabase Item+flight-intent readback, Source evidence completion, Day Feed and full App restart, same-operation replay/duplicate protection. Unselected candidates remain unsaved.

## Close and rollback

Success/error/UNKNOWN/+660s runs `P2_REVIEW_CLOSE.sql`: exact scope/registry CAS, policy disabled/scope=NULL, both rows disabled. Independent verification is mandatory. It retains original, candidate, Plan, accepted Item and receipts. Source SQL permits only the already-accepted same-operation journal to finish after SQL scope closure; no new Core Create/Qualify is allowed. Isolated closed-SQL tests retain the existing Source Review runtime composition, and do not claim availability after default runtime restoration. If recovery cannot finish within the approved runtime window, close first and report the exact retained state rather than silently extending it.

Watchdog restores the healthy default-closed **77c7055e** container at +900s. It must not revert accepted new publication data to an incompatible older runtime. Ordinary deployment failure before this business window may roll back to retained healthy **0d50d567**, with no new business data involved.

`P2_REVIEW_DEV_ROLLBACK.sql` reverses exact five postimage hashes only after policy/registry closure. It refuses an accepted Core operation whose Source is not COMPLETE; preserve default-closed postimages until that same receipt can be legally reconciled. No deletion or data reversal. Resolver stays at the separately approved dormant version and both airport rows remain disabled. Any function/ACL/state drift stops rollback for precise reconciliation.

## Evidence

`P2_REVIEW_PACKAGE_SHA256.json` fixes install/activate/close/rollback and exact requests. `P2_REVIEW_ISOLATED_PG_RESULT.json`: one actual PG case, 27 assertions and five package checks, network none/256 MiB; complete Source/Core/readback, close-before-finalize/replay, wrong receipt/hash/lineage and wrong operation/slot/target rejects. Per SQL 290ms + per lease 1s: Prepare18.5s, Core25.9s, finalizer14.7s plus2.5s identity lookup, within unchanged30s leases. Code/SQL independent Review is fixed separately. None is a hosted P2 Save PASS.
