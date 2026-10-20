# OTR Capture UX Architecture Baseline — Documentation Only

Date: 2026-10-07 (Pacific/Auckland). Status: **REPORT READY FOR OWNER REVIEW**.

Capture should make intake easy, preserve source material, and let the user continue with OTR while processing proceeds. The owner-approved direction below defines the product experience. It does not authorize implementation or change accepted Platform & Import contracts.

**APPROVED** means direction explicitly supplied in the owner discussion/request. **PROPOSED** means an implementation concept for later review. **OPEN** means an unresolved decision. Approved product direction does not imply that a capability is implemented, a runtime gate is open, or a schema/API is approved.

This checkpoint produces only this dedicated architecture/product report. Capture UI, Jobs, notifications, Documents, email/ChatGPT connections, AI processing, schemas, routes, dependencies and production behavior remain outside its implementation scope. No commit or push is authorized.

## APPROVED product direction

### Capture entry model

Capture is a capability; its internal name need not become a user-facing label. The primary Capture Sheet avoids a flat list of technical modalities and uses two categories:

| Category       | Primary experience                                                              | Scope                                                                                                       |
| -------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Direct Capture | Magic Input: one simple surface for typing, paste and push-to-talk.             | Interpret content without requiring a modality choice first. V1 concentrates on Add, Supplement and Update. |
| Add Files      | One first-level action, followed by Camera / Photos / Files after it is tapped. | Support both single and batch intake.                                                                       |

Magic Input may understand a broad range of requests, but V1 execution is deliberately narrow. It is not a general natural-language controller for OTR. Delete, Move, Reorder and general AI Planning are not primary V1 actions. When understood, those requests may guide the user to the appropriate existing UI instead of executing them directly.

Pasted text, URLs and supported pasted images are interpreted by content. Clipboard suggestions remain lightweight and contextual, without intrusive prompting. Supported formats and platform clipboard access are separate implementation questions.

### Persistent external intake channels

Email and ChatGPT are persistent external intake channels, not peer one-shot Capture modalities. They have a different lifecycle from Magic Input and Add Files.

| Channel                            | Before setup or connection                                                                           | After configuration                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Email forwarding                   | Lightweight discovery/setup entry.                                                                   | Expose the forwarding address and a fast Copy action where useful.                         |
| Email connected/synchronized inbox | Separate discovery/setup capability when available; forwarding does not imply inbox synchronization. | Show connected status/management rather than repeatedly promoting setup.                   |
| ChatGPT                            | Lightweight discovery/setup entry explaining that OTR can be connected from ChatGPT.                 | Reduce to connected status/management. Actual interaction normally takes place in ChatGPT. |

Do not encode transient external terminology such as “plugin” into the OTR domain model. Select the supported product terminology when implementation is authorized. As channels become configured, the Capture Sheet should become simpler, not more crowded. Their exact placement and visual weight remain OPEN.

### Contextual Capture and attachments

Global and contextual surfaces may invoke Capture. Trip, Day, entity and insertion context should reduce user work, but context is a hint rather than absolute truth. A mismatch must not prevent intake merely because the user opened Capture from a particular Day or Trip.

An ordinary attachment inside a Reservation, Expense or similar form should offer Camera / Photos / File directly. It should not reopen the complete Capture Sheet. Attached evidence may support AI suggestions or field filling, while the form remains the precise user-control surface. This future direction does not broaden current Ledger OCR permissions or replace form validation and Save.

### Job lifecycle and truthful progress

One user batch/intake action produces one user-visible Job. The core experience is:

**Capture → locally accepted → active processing job → result**

Once required inputs are durably accepted into OTR local storage, the user may dismiss the panel and continue using OTR. Processing must not depend on keeping the Capture UI open. The active Job remains discoverable through Activity/Notification UI and can be reopened.

“Locally accepted” means durable intake, not canonical Trip admission, successful upload, completed interpretation or acceptance of a suggested entity. Acceptance failures must remain visible; OTR must not claim that unavailable source material was saved.

The active panel exposes measured facts: item counts such as `6 / 10` when known, real processing stages/events, and useful time estimates only when defensible. It must not show fabricated percentages or simulated AI “thinking”. Unknown totals stay unknown. Source-item counts and resulting-entity counts must be distinguishable because they are not necessarily equal.

Offline presentation clearly distinguishes **saved on this device**, **processing locally**, and **waiting for internet**. Local acceptance does not promise uninterrupted execution when the OS suspends or terminates the app; background continuation details remain OPEN.

### Activity and completion

A batch Job owns one evolving Activity entry. Do not generate a notification per source item. On completion, the ongoing entry becomes a persistent result message, conceptually:

> 8 added · 1 needs review · 1 skipped

This is illustrative copy, not a finalized localization or counting contract. “Added” must mean admitted results, not discovered Candidates or prepared commands. A completed Job may retain unresolved or skipped items; perfect resolution of every item is not required for completion. Review-required messages can open focused dynamic review forms.

User-visible completion must preserve the distinctions already established by Import between intake/current-pass completion, outstanding resumable work, and uncertain execution. Completing a result summary cannot suppress later results, cancel reconnect work, release protected evidence or convert an unknown outcome into failure.

### Minimum review

Review asks only the minimum question needed to resolve the uncertainty. Typical questions concern ambiguous Trip assignment, missing blocking information, a possible duplicate, or conflicting evidence. The question should focus on the affected result or action rather than forcing the user through every source item.

Blocking missing information may prevent admission of the affected result. Non-blocking missing information may allow a Trip entity to exist and be shown only where useful. Day/Trip should not surface every incomplete metadata field. Exact thresholds remain OPEN and must respect existing action-specific admission rules; this direction does not weaken accepted Flight CREATE requirements.

### Documents and provenance

Documents is the durable user-facing record of source material and processing provenance, not merely an error inbox. Its conceptual surface supports:

- All captured/imported source material, including successfully handled sources.
- Processing/result status and links to resulting Trip entities.
- Review, conflict and skipped states with useful explanations.
- Enough provenance and coverage to verify that a large batch was handled completely.

One Document may produce multiple entities. One entity may be supported or updated by multiple Documents. A source is not “unused” merely because it supplements an existing entity rather than creating a new one.

Needs Attention / Inbox should preferably be a filtered view/state of this system, rather than automatically becoming a separate top-level module. “Document” here is a product concept; it does not approve a new production table or collapse Capture, Source, Representation, receipt and entity identities. Documents route/IA and retention remain OPEN.

### Presentation layers and ownership

| Layer      | Responsibility                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Activity   | What the user needs to know or act on now: active Jobs, meaningful results and focused review hooks.                   |
| Documents  | Complete intake/provenance/history, source access and batch verification.                                              |
| Trip / Day | Admitted, usable travel information. Proposals and pending preparation must not appear as accepted travel facts.       |
| Trip Home  | Eventually expose a discoverable Recent Imports/processing summary entry so users can return to recent intake history. |

Bottom Shell belongs to **Trip Experience**. Capture supplies only the requirement that Capture may occupy the Action Island in approved contexts. This report does not decide shell composition, navigation placement, renderer, motion, or permanent Capture prominence.

**Platform & Import** owns parsing, admission and runtime mechanics behind the agreed handoff, while retaining existing repository, queue, sync and owning-domain responsibilities. Capture presentation must not redefine those contracts or become another execution authority.

## PROPOSED implementation concepts

These concepts explain possible integration without approving storage shapes, APIs, routes, workers or visual designs.

1. **Job as a presentation of an intake Batch.** Map one user intake intent to one visible Job and one evolving Activity entry. Internal Captures, bounded Runs, Candidates and domain operations may be many. Confirm Job-to-Batch identity, manifest changes and continuation behavior with Platform & Import before implementation; do not add Job state to CP11 Capture rows.
2. **Reopen through durable facts.** A reopened panel could project retained intake membership, current progress and result dispositions through repository-facing interfaces. Existing lifecycle owners would continue work independently of panel mounting. No new feature queue, timer, uploader or direct database/API access is implied.
3. **Measure distinct counts.** Show received/accepted/failed source counts separately from discovered/admitted/review/skipped result counts. The projection could consume Import's presentation-neutral observations. Define units, coverage and deduplication before assigning a number to a completion summary.
4. **Focused review from attention facts.** Build a question from the affected action's unresolved predicates and retained evidence, preserving the user's edits. Any returned choice would still pass existing deterministic closure, explicit confirmation, exact revision/pin checks and owning-domain admission. A dynamic review schema/API remains OPEN.
5. **Documents as a projection over existing provenance.** Compose source material, processing history and entity associations without asserting one Document equals one Source or one Capture. Mapping, authorization, retained byte availability and retention need an agreed contract first.
6. **Compact channel management.** Configured channel status/management could replace setup promotion while keeping a forwarding address easy to copy. This is a presentation idea, not a connection-state enum, OAuth scope, mailbox adapter or ChatGPT mechanism.

## Existing architecture and integration boundaries

This is a focused audit of the canonical checkout, not a production capability certification. The current handoff and implementation reports distinguish closed foundations from activated runtime; historical reports retain their original checkpoint status.

| Existing evidence                                                                                                                                                                       | Conflict or integration boundary                                                                                                                                                                                                                                                                                                    | Required treatment                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CP11 Capture report](TRIP_CHECKPOINT_11_LOCAL_CAPTURE_INBOX_REPORT.md), [data model](../DATA_MODEL.md), and `src/domain/capture/localCapture.ts`                                       | Durable Account-owned originals support FILE/IMAGE/TEXT and only INBOX/ASSIGNED. Current limits, dedup, quotas, revision CAS and Account fencing are already defined. There is no batch Job or processing state in these rows.                                                                                                      | Keep these contracts intact. Batch/context/progress records and voice or other acquisition adapters require a later agreed design. “Saved on this device” follows successful durable intake, not picker selection or an external URI.   |
| [Import engine architecture](TRIP_IMPORT_ENGINE_ARCHITECTURE.md) and [Import contract](TRIP_IMPORT_CONTRACT.md)                                                                         | One Batch can contain many Captures and bounded immutable Runs. N↔M evidence supports many Candidates/entities. Batch is neither Source nor an all-or-nothing booking transaction.                                                                                                                                                  | Preserve per-input success/failure and original evidence. One visible Job must not force one Source, one Run, one Candidate or one entity per input. Exact partial batch acceptance/retry UX remains OPEN.                              |
| Import contract sections “Context Snapshot at intake” and “Confirmation and commit”                                                                                                     | Intake context is historical and labelled; admitted Source/Run preparation requires Trip scope and admission. READY does not mean ACCEPTED.                                                                                                                                                                                         | Permit Account-only intake without inventing a Trip. Resolve assignment before Trip admission. Keep explicit reviewed intent, target revisions, immutable identities and capability gates.                                              |
| Import contract sections “Offline durable continuation” and “Presentation-neutral progress”                                                                                             | Pass completion can retain deferred work. Processing quiescence is separate; neither proves Source IO terminality. UNKNOWN cannot authorize a competing create or evidence release.                                                                                                                                                 | The Job/result vocabulary must describe the observed scope honestly. Completion copy and later updates require integration agreement; do not replace exact recovery or execution ownership.                                             |
| [CP13B integration report](TRIP_CHECKPOINT_13B_FINAL_INTEGRATION_REPORT.md) and [current handoff](../CURRENT_IMPLEMENTATION_STATE.md)                                                   | Flight interpretation, review/closure and CP13A preparation are integrated foundations but unwired. Preparation queues no dispatched canonical mutation. Supported update shapes do not include every booking/passenger dimension.                                                                                                  | Add/Supplement/Update are approved UX goals, not a claim that every V1 action or entity type can execute today. Do not open gates, use legacy fallbacks or invent unsupported writers.                                                  |
| [Receipt OCR C0 design](../ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md), [attachment design](../EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md) and [Product scope](../PRODUCT.md) | Current New Expense OCR reviews Title/Amount/Currency; Confirm copies them into the form and Save creates the Expense. User edits win. Existing Expense attachments do not run OCR; current capacity is three. Temporary scan drafts have their own cancel/restart lifecycle.                                                       | Ordinary attachments stay contextual. Global Capture Job persistence must not silently replace form draft/Save semantics. General AI-assisted forms, financial import and persistent Documents integration require later authorization. |
| [Trip Experience E0 report](TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md) and inspected `app/(tabs)/capture.tsx`                                                                  | Capture route is a FoundationScreen routing boundary. The focused route/domain/repository inventory exposes no dedicated Capture Job Activity/Notifications or Documents surface; Ledger queue announcements and loading indicators are not such a surface. General Event-ticket/document access is not a complete Mobile contract. | Treat new Activity/Documents navigation and Recent Imports as future integration, not existing destinations. Retain Trip Experience ownership of shell and admitted Trip/Day presentation.                                              |
| Import contract section “URL and email”                                                                                                                                                 | A captured URL proves a locator, not fetched page content. Email body and attachments retain acquisition/part relationships; email metadata cannot establish booking identity. No forwarding or mailbox service is supplied by that contract.                                                                                       | Content interpretation must respect actual saved evidence. Forwarding, sync and ChatGPT connection mechanics are separate future channel work; do not infer implemented connectivity from evidence contracts.                           |

Existing Ledger Review is a financial workflow. It must not silently become the global Documents/Needs Attention system or share resolution semantics merely because both use the word “review”. Existing terminology, permissions and financial boundaries remain authoritative.

## OPEN questions for owner and workstream review

| Question                         | Decision needed                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context Resolution               | Rules for no Trip, one Trip, overlapping Trips and conflicting Day context; when to suggest versus ask; treatment of explicit insertion/entity context. No automatic rule is chosen here.                  |
| Admission thresholds             | Exact blocking versus non-blocking fields per entity/action, including differences between Add, Supplement and Update. Reconcile with current Flight policies rather than weakening them.                  |
| Dynamic review schema/API        | How a minimal question, alternatives, evidence, user edits and exact revision/pin checks travel between presentation and closure.                                                                          |
| Activity/Notification navigation | Exact placement, reopen path, persistence and delivery policy; distinction between in-app Activity and any OS notification.                                                                                |
| Documents route and IA           | Global versus Trip-scoped discovery, source-to-entity associations, filtered Needs Attention/Inbox, authorization and relationship to tickets and Ledger evidence.                                         |
| Retention policy                 | Original bytes, derived material, history, skipped inputs and deletion behavior; preserve required evidence and existing protected-resource rules until settled.                                           |
| Capture Sheet visual design      | Exact layout, lifecycle/preferences weighting, channel status placement and progressive simplification. Trip Experience retains Bottom Shell ownership.                                                    |
| Clipboard behavior               | Privacy, permission/access triggers, platform constraints and contextual suggestion policy, including supported pasted images.                                                                             |
| Email synchronization            | Permissions, security, forwarding versus connected inbox behavior, acquisition bounds, disconnection and recovery.                                                                                         |
| ChatGPT connection               | Supported connection mechanism and current external product terminology at implementation time. No mechanism is selected or terminology hard-coded here.                                                   |
| Background execution and ETA     | Platform suspension/restart limits, safe continuation/wakeup, progress event availability and evidence required to show or withdraw an ETA.                                                                |
| Job-to-Batch mapping             | Job identity across manifest versions, bounded Runs, retries and deferred work; completion scope and how later results update the persistent entry.                                                        |
| Batch coverage and counting      | Source/result units, partial intake failures, duplicates, supplements/updates, skipped dispositions and completeness verification. Define how the user learns that some selected inputs were not accepted. |
| Magic Input V1 capability matrix | Which owning domains/actions are available, what needs confirmation, and how understood unsupported requests guide users to existing UI. Push-to-talk and other new adapter contracts remain unapproved.   |
| Contextual forms and Documents   | Which attachment/evidence interactions can share provenance while retaining current form drafts, user edits, precise Save and financial rules.                                                             |
| Recent Imports handoff           | Placement and scope on adaptive Trip Home, including unassigned intake and account-isolated results.                                                                                                       |

## Review checkpoint

Owner review should confirm that the APPROVED section faithfully records the Capture direction, then resolve or assign the OPEN integration questions before a separate implementation checkpoint is authorized. The PROPOSED section remains provisional. Accepted Platform & Import, Ledger and Trip Experience contracts retain authority over their domains.

**Documentation-only checkpoint complete. STOP FOR OWNER REVIEW.**
