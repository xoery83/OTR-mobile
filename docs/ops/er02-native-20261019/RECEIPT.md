# ER02 first read-only Native qualification — 19 October 2026

## Actual binding and scope

Original AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`, iOS 27.0,
`com.xoery.otrmobile`; Metro 8083 source
`043ed5668270d5f6d9002c7ae5a137e915206fca`.
No newly installed binary/build SHA is claimed. Source/process/cwd were checked
before the window; no installation, Metro switch, account change or Session copy.
Owner confirmed the approximately 15-minute read-only foreground window.
Device Hub management window, selected AD5, was checked before actions.

The compact window exposed screenshots but no iOS AX and rejected coordinate
clicks. Coordinator restored the normal full management window and original App.
This is an automation-resource limitation, not a proven product bug. Do not use
compact-window failures as product VQA failures or bypass with reset/reinstall.

## New scoped evidence

- **ET-01/02 (partial):** Japan Editor opens one top Cancel/Edit Trip/Save row.
  Original range Feb 1–12 remains after picker Cancel. Selecting Feb 2 and Feb 10
  then Done returns that range to the Editor draft and enables Save. Editor
  Cancel returns Home with original Feb 1–12 Hero. Business Save was never tapped.
  This does not repeat or expand prior Save/cold-persistence acceptance.
- **TH-06 (partial):** Japan Members entry opens a real Sheet reporting unavailable;
  Close returns Home. It does not fabricate names or invitation status. On the
  existing local ER02 QA Trip, the settled aggregate displays `Named people: 1`.
  Its initial unavailable state was transient while reading, not proof of absent
  data. A later Members tap was refused by the tool after foreground user change;
  fresh state was checked and further actions stopped. No named roster Sheet PASS.
- **TH-08:** Japan Home and Editor report actual unavailable currency. No real
  currency/settings or finalized-lock Native PASS is claimed from this case.
- **TH-11/12 (partial):** Japan Home visibly shows name/date/destinations in order,
  full-bleed Hero and square-pen control. This does not verify scrolled title,
  all contrast/Dynamic Type or all icon touch targets.
- **DS-04/05 (partial):** Day tab enters the normal feed. Calendar Feb 12 lands on
  `Day 12 · Feb 12, 2027` below the navigation header; Home then Day restores that
  same day. Calendar Day 1 returns the full textual Trip introduction, with blank
  initial top-bar center and Day 1 below it. See `japan-feb12-landing.png`,
  `japan-home-day-restoration.ax.txt` and `japan-day1.png`.
- **DS-07 (partial):** Calendar has real February dates and qualified category
  descriptions; Feb 1 and Feb 12 are selectable. No trusted place-transition label
  was established and the owning label-source gap remains.
- **DS-08 (partial):** Real forward drag hides left Navigation Island while Capture
  remains; reverse drag restores navigation. Stable AX captures distinguish the
  two states. Actual continuous travel distance/performance and idle semantics
  were not qualified; this is not the 60–120-day performance gate.
- **DS-09 (partial):** Trip Menu All Trips returns a `My Trips` heading/list,
  not legacy Today. The existing ER02 QA Trip opens normally from that list.
  Right-edge swipe and cold-root recovery were not tested in this window.

## Reproduced remaining behavior

TH-03 remains incomplete: Day→Home briefly rendered `Reading saved itinerary…`
before the real 30-Plan Preparation aggregate returned. The existing hook preserves
mounted same-scope content, but Home remount loses it. Do not introduce a global
cache without permission/epoch/data-version invalidation. Existing action-time
revalidation is necessary but does not authorize stale presentation.

TH-07 Japan Menu exposed Edit, Open Day and global account/All Trips/settings/
language/logout. Members/Documents were not observed in that menu; the persistent
Members entry is present on Home. Do not mark the full Trip-menu clause complete.

## End state and remaining gates

Ended on existing `ER02 Local Edit QA · Saved` Home, original
Dec 30, 2026–Jan 3, 2027 / Auckland. No business Save/Create/Expense/Import action
was performed; only drafts were selected and discarded. Presentation bookmarks
can change through normal navigation. No fresh SQL before/after equality check
was made in this window. Resident043/8083 is preserved; no rollback was needed.

Original fixed043 tree remains the preview recovery source. If a later source
update fails, Coordinator serially restores that source on its dedicated8083 and
normally reopens the original App, preserving installation/account/database.
Do not reset the device or replace it with main/f87 without exact coordination.

Not yet qualified: offline/cold launch, checkout-date Today, empty Active/Spending,
named Members Sheet, actual currency/settings/lock, cross-year/long-calendar drag
in this window, continuous 60–120-day scrolling, locale/appearance/Dynamic Type,
Immersive return, scrolled Hero title, right-edge back and Release packaging.
Historical prior receipts remain scoped evidence, not automatically new PASS.

No product-code changes or new Independent Review were needed for this read-only
qualification. Five baseline directed suites / 65 tests passed. Existing owning
contract gaps and full 26-clause status remain in Coordinator's single tracker.
This receipt is not ER02 UX Accepted. Only Owner can accept or approve deferrals.
