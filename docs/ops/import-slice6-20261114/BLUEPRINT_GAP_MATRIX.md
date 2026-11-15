# Slice 6 — Activity / Updates Blueprint conformance

Baseline: remote Main `691189669e33d6eb5399f50c11dcbddf901536a6`. Authority: complete 2026-10-23 Import Activity Product Delta and UI Blueprint, existing Updates/Review contracts, approved B2 plan, later Owner Local-First/automatic-admission decisions. The later Owner prohibition overrides Activity keyword search. Product changes stay on `codex/import-v3-slice6-activity`; no Main merge/push, SQL or shared DEV change.

| Approved requirement | Implementation / owning code | Verification / remaining limit |
|---|---|---|
| Normal three-page Documents / Inbox / Activity entry | `DocumentsScreen`, existing pager; `CaptureActivity` directory mode | Full App iPhone/iPad normal navigation, no Harness |
| Actual Batch history, source/status filters, recorded time and Trip | `ImportActivityList`, `projectImportActivityRow`, existing account-fenced reader | iPhone 20→25 actual local registered Batches, real retained bytes; iPad original7. Source chooser and empty Review filter exercised |
| Batch counts, no candidates counted as saved | Existing V3 projection enriched with owning plan and formal deduplicated Receipt results | Owning projection tests; iPad original14:43 Batch actually settled to Created1/Linked1 on96474; final rebuild read can remain UNKNOWN when Backend observation is unavailable, never false success |
| Collapse chrome; keep source in native bar and status chips sticky | Existing Documents chrome + Activity ScrollView | Actual iPhone drag; source control available when collapsed |
| Independent filter/scroll and exact Batch return | Parent presentation state + existing `/import-plans` overlay; loaded depth retained | Actual iPhone older-page→original Batch→Close returns same position; tab switch preserves Files/Review filters. Cold launch rediscovers persisted Batches; filter offsets are screen presentation state, not a new persistent Batch store |
| Loading / empty / offline uncertainty / actual failure | Existing task/observation facts; absent observations remain uncertain | Isolated tests cover uncertainty, UNKNOWN, rejected NEW, pending association, ABSTAIN; Native Waiting/empty observed. No forced server outage |
| Updates true Needs Attention only | `projectUniversalImportUpdates`, `ImportUpdatesSection`, existing Inbox | Waiting does not enter Needs Attention; real REVIEW and FAILURE owning cases covered in tests. UNKNOWN has no resend action |
| Read is separate from resolve | Existing intake read repository + small device-local Account/Batch version preference in existing SecureStore | Final UX keeps ordinary Waiting non-unread. Device preference cold persistence was observed on2424; final version-bound read/resolve behavior, hidden21st notice and stale Account cases verified by owning tests; no current positive Native Review notification fabricated |
| No duplicate Batch success cards | Batch-keyed projection, local-intake fallback suppressed when formal card exists | Projection/component tests; no duplicate canonical object/association writes |
| Results→filtered Updates→Review/recovery→Back | Existing Results button, same Inbox via native `import-updates` full-screen Modal, original Job and generation retained | Actual iPad found card-over-transparent-Modal input failure; f159 switches to native full-screen Modal + Toolbar Back. Actual Needs Attention filter changes and Back returns same Batch; manual chooser opens/closes without Save |
| Documents / Activity / Updates search boundaries | Documents retains own full-screen search; Updates keeps own local search; Activity no keyword search | Source/static + Native Activity header/source menu |
| Account/Trip fencing | Existing reader/reopen guards; generation checks before/after await; read preference key includes Account | Targeted cross-account/stale-generation tests. Phone PhaseA Updates excludes Recovery Trip fixtures; Activity cross-Trip labels reflect authorized local priors. No fresh multi-account login/Member E2E claimed |
| Existing Slice5 Documents / original files | No owning Document/Core/Sync changes |9 iPhone +30 original iPad baseline hashes match; Core Documents9/links14 and existing queues13/33 unchanged |

## Explicit gaps / out of scope

- AI/MCP/email sessions without a current producer are not fabricated as Activity Batches. New APNs/email notification infrastructure is not implemented.
- Read preference is device-local; no cross-device notification read sync is claimed. Older-than-recent Updates history is opened through Activity; an exact Results Batch bypasses the recent20 limit by original Job lookup.
- Document Cloud Sync remains approved deferred. Rename/Share/Move/Safe Remove remain independent owning-command backlog, not Cloud Sync deferral.
- Full UPDATE and Auth C04 Invite/Claim implementation are not part of this change.
- Physical iPad acceptance, fresh multi-account login and forced network-failure Native scenarios are not performed here. UNKNOWN and isolation are tested with existing owning fixtures, without new model requests or replaying historical operations.
