# Slice 6 UX conformance correction

Owner requested a second Blueprint check after the initial engineering-oriented preview. The original documents were actually reread, not inferred from current components:

- `/Users/xoery/Downloads/Document Module Design V1/OTR_Import_Activity_Product_Design_Delta_20261023.docx`, complete45 nonempty paragraphs: cross-scope Activity, source/status filters, compact rows, true outcomes, existing Batch detail and manual recovery.
- Same directory `OTR_Import_Activity_UI_Blueprint_20261023.docx`, complete25 paragraphs, especially Screens A/B and ¶18–25. Reference image `导入活动与 AI 会话界面蓝图.png` actually viewed.
- `/Users/xoery/Downloads/OTR_UPD_UX_01_UPDATES_PRODUCT_DESIGN_DELTA_2026-10-14.md`, full original: UPD-IA-01, READ-01/02, UX-03R/04/05/06 and notification semantics.
- Existing approved B2 plan and UX-C1/C2 correction records; canonical UI Foundation and terminology. Later Owner prohibition removes Activity keyword search. Local-First supersedes old permanent-original/proof assumptions; no new evidence workflow.

| Original contract | Initial preview defect | Correction |
|---|---|---|
| Activity A/B, neutral source icon + small status overlay; compact status controls | Large chip geometry and a vertically separate status icon | Canonical compact chips and actual small overlay badge; existing scroll/pager/source behavior retained |
| UPD-IA-01 / UX-06 single chronological email-like list | Separate intake and Import blocks; large explanation card and button stack | One Batch-keyed presentation over existing row nodes/cards; original creation-time ordering, compact title/status/time row and chevron; currently actionable intake keeps owning recovery |
| UPD-UX-06 minimal density | Repeated registered/update timestamp; repeated Refresh and Mark Read on each row | One original recorded time, one whole-row action; pull-to-refresh; failure-only retry; quiet local-history/Activity footer |
| UPD-READ-01 viewing does not read; opening does | Per-card explicit button clutter | Whole-row open marks only that observed material; global existing displayed-filter mark stays; mere scrolling/category/query does not mark read |
| Ordinary Processing does not become unread; READ-02 Batch aggregate badge | Waiting cards initially received unread state; old Bottom Shell counted only Intake failures | Waiting/Processing/UNKNOWN stay non-unread; existing badge unions Batch identities from same Import projection and existing intake authority, preserves unknown coverage, reuses device read preference |
| READ-02 correctness without read amplification | Missing Task/receipt observations could be mistaken for no attention | Separate internal observation-coverage fact, immutable version snapshot and late projection fence; remote reads occur on existing activity/navigation/foreground events, not every two-second preference poll |
| Activity manual recovery ¶38 | Results had no approved manual entry | Low-emphasis reminder + existing ManualItineraryContent; assigned Trip must be in normal authorized choices, unassigned requires explicit choice, no invented date or Batch/Document writes |
| Native return and origin | Filtered Updates inherited transparent Modal without native Back | Real iPad input showed a card pushed over transparent Batch Modal was unresponsive. Owning Stack now presents full-screen Modal with canonical native Toolbar Back; same Inbox, original Job/generation and return stack. Actual category selection and Back verified |

No new Admission, Save, Review, Queue, Receipt, notification service or database is introduced. Device read preference is metadata in existing SecureStore. The existing notification repository additionally returns Batch identities for aggregate dedup, without SQL/schema changes. Native route-level tests cover manual target absence, explicit choice and stale generation.

Automated checks and static independent Review are not Native UX acceptance. The final report records actual final-source full-App interactions separately from earlier screenshots and synthetic owning tests. Earlier Mark Read→Waiting screenshots belong to2424f556; final UX deliberately does not mark ordinary Waiting unread.

Hot Dynamic Type Native QA also exposed clipped chip/button text. Compact chips refresh only internal Text measurement; UiButton reuses existing UiText. Touch target/selection/action remain intact. Final source `2e751873` includes both corrections.
