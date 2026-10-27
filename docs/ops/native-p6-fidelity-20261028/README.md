## Serial intake candidate — supersedes historical pending status below

P6 is now wired in isolated branch `codex/native-p6-activity-integration` based on Native `2253dc34`, including actual owning port `e1270e21` replayed as `5785d680`. Create/Edit/content replay commits are `557f5a8b` and `646bfe33`. See [host integration receipt](HOST_INTEGRATION.md). Actual18 suites488PASS; types/UIguard/scopedlint PASS. **LOCAL_CODE_AND_REPOSITORY_PASS / PARENT_INTAKE_PENDING / NATIVE_NOT_TESTED / CLOUD_PENDING**. `HOST_UI_INTEGRATION.patch` is an alternative to the final host commit, not an additional patch to apply afterwards.

## Owning port follow-through — supersedes the initial closed-Gate candidate below

P6 Manual Batch is now implemented only in this independent branch after the explicit unique-Writer handoff. Actual11 suites361PASS, including P1–P6/shared Core Repository7 suites121PASS. See [local SQLite receipt](MANUAL_BATCH_PORT.md). Status: **LOCAL_REPOSITORY_PASS / HOST_INTEGRATION_PENDING / NATIVE_NOT_TESTED / CLOUD_PENDING**. UI entry and shared Reader handoff patch remain unapplied; do not reapply the historical Gate patch or replace current tests with the old proposal artifact.

# P6 Native Activity — isolated candidate, 28 October 2026

Status: **LOCAL_CONTENT_AND_FORM_CANDIDATE / MANUAL_BATCH_PORT_PENDING / HOST_INTEGRATION_PENDING / NATIVE_NOT_TESTED / CLOUD_PENDING**.

Form fixed `9d11859a`; content commit follows separately. Base `b78b4a4c`, branch `codex/native-p6-activity`, Worktree `/private/tmp/otr-native-p6-20261028`. No main merge, Metro, device, simulator, DEV, Backend, Schema/RLS, Auth or shared navigation/scroll mutation.

## Frozen references

`OTR_P6_ACTIVITY_NATIVE_FIDELITY_V1.zip` SHA256 `d98fae7379cad93a59ac3f71752589a9597b957296bb62822fe78d93b08995d5`; package source `d6ecb569bf75bdceca79b57dcdf3a2342f47a907`. All73 SHA256SUMS entries checked,51 final screenshots;24 cases and43 Native acceptance rows. Source fixtures copied byte-for-byte to `src/features/day-feed-lab/fixtures/p6-fidelity-v1.json`. The final28Oct corrections supersede old Past photo-count and photo-before-title behavior.

## Implemented

- P6 Create/Edit uses existing canonical SheetHeader form Cancel/Save, shared Trip calendar, compact Participants, P4/P5-style time picker, account/trip/draft/generation-bound Apple full-screen place search and free text. Keyboard avoidance/Notes scroll, opaque Draft/Cancel and frozen retry preserved. Minimum Name+Start Date; no venue or invented clock. End optional. Entry location/session/admission note use existing lawful fields, not a fabricated Entry clock.
- `manualActivityRepository.ts` is only a family adapter over the same `createManualItemRepository` transaction/queue/identity path. The shared Repository extension adds P6 fields and existing CREATE_ITEM/SET_ACTIVITY_DETAILS mapping. Venue and entry place stay distinct. An unchanged qualified entry-place tuple is retained on unrelated detail edit; a new entry label does not inherit the venue's coordinates.
- `TicketedActivityRow` content follows final nine-state hierarchy, explicit required-arrival display priority without changing projection, same-Item END, no Past Browse photos/count, own matched seat only in Future/Today Focus, Past long people collapse, title before compact max3 photos, collapsed admission history, conditional cards and the existing four footer actions. No duplicate Ticket identity/seat authority, unknown time/venue/price or synthetic image is manufactured.
- `activityReadPresentation.ts`, P6 Detail/read and native route reuse the normal Reader, generation/revision checks and read-before-slower-Edit pattern. Expense Add passes actual Trip ID, Item date and Item name. Missing owners keep footer actions disabled.
- Frozen24-scenario fixture adapter and `P6FidelityPreview` are diagnostics only. Fixture visible/matched/canOpen flags never become production ACL, Core facts or local data. Fixture photos without an actual URI retain counts but are not rendered as fake photo swatches.

## Validation and real limits

Current isolated source:8 suites293 assertions PASS (Form, final Row,24×9 fixture matrix/identity/access/privacy, read-before-edit Details, current closed Batch boundary and P1/P3/P4 Repository regressions). TypeScript, UI guard, scoped ESLint, Prettier and diff-check PASS. A temporary shadow with only the proposed Manual Batch port applied ran3 Repository suites40PASS, including normal minimum Create/same-ID Edit/restore, rollback/retry, stale Account and wrong-family detail rejection. This shadow is **proposal validation only**, not an accepted port, Native or Cloud receipt.

The shadow host UI patch also typechecks. Two existing Stay tests intentionally assert that all P6 Manual batches are rejected; they correctly remain passing in the actual isolated source. They intentionally fail under the new proposed P6 capability and must be reconciled by the owning Writer with the new P6 positive/wrong-family tests, not silently weakened or counted as PASS there.

No physical appearance, Dynamic Type, VoiceOver, real Ticket/custody, Media, Ledger link mutation or Backend/Supabase E2E was tested. `NATIVE_ACCEPTANCE.csv` remains all NATIVE_NOT_TESTED.

## Minimal serial integration

1. Review the shared Manual Repository family extension in this commit; existing P1/P3/P4 paths and tests remain intact. Do not copy a new Queue/Core root.
2. Unique Core Writer reviews/applies `MANUAL_BATCH_OWNING_CANDIDATE.patch`: add existing SET_ACTIVITY_DETAILS to manual command allowlist, P6 to Create and actual-family allowlists, and enforce SET_ACTIVITY_DETAILS only for P6. No Core command/schema change is proposed. Production/this Git tree's `tripCoreV2Repository.ts` is unchanged. Current normal P6 Save is correctly rejected as MANUAL_BATCH_INVALID, with zero intent writes.
3. After that port is accepted, use `manualActivityRepository.after-owning-port.test.txt` as the positive Repository test source (copy into the normal test location), reconcile the two former P6-closed assertions and rerun relevant boundary tests. Never enable entry based on fixture tests.
4. Serially apply `HOST_UI_INTEGRATION.patch`: existing chooser→P6 Form, local/accepted P6 content and detail handoffs, mixed-Focus family qualification, insertion callbacks and diagnostics preview registration. It adds no Shell/scroll/controller. This patch is not applied to this isolated tree and must be rebased onto the parent's latest Focus repairs without overwriting them.
5. Parent performs independent review and device Vision on Forms QA/Mirror after its current Writer window. Preserve P1–P5 and all QA data. No automatic main integration.

## Owning gaps

| Gap                                                                          | Owning work                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry/Meeting independent required flag/date/time/zone                       | Public Core/Temporal unique Writer must provide accepted fields/read projection; current trip_activity_details only has session_label/admission_note plus separate entry Place. Do not serialize a clock into Notes or move the Activity root date. |
| Contact, source dynamic labels/language/evidence/mapping                     | Instructions/Contact owning port; retain source provenance separately and supply legitimate create/edit/read mutation before exposing editable controls.                                                                                            |
| Ticket/Voucher/Booking classification, holder/seats, original/custody access | Existing Booking/Ticket/Document owners provide authorized association and real opener/readiness. Booking reference does not establish Ticket.                                                                                                      |
| Photos and Ledger associations                                               | Media/Ledger owners supply authorized URI/link/Edit/Link capabilities; no per-person/day cost or fake totals. Add Expense uses existing form only.                                                                                                  |
| Cloud P6 mutation                                                            | Normal Core/Backend owning Writer, account rollout and authorized DEV L3 window; local Form/fixture PASS grants no Cloud permission.                                                                                                                |

Scan/update-from-document, multi-activity recognition and remove/cancel mutations were not fabricated; they await their actual owning ports. This is a bounded Native candidate and proposed local port, not an E2E-complete activity editor.
