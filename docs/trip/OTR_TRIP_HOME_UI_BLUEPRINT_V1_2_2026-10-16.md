# OTR Mobile 2.0 — Trip Home UI Blueprint V1.2

**2026-10-16 · Replaces V1.1 presentation details where explicitly changed**

## 1. Page hierarchy

```
Trip Home — native vertical scroll
  Full-bleed square Hero, image behind status bar, ~30% screen height
    Floating Menu [left]                       Edit + Search [right]
    Lower gradient: Trip name / destination summary / dates
  Contextual Widget Workspace
    Small named tabs ONLY if 2+ qualified widgets
    Selected rich widget, CONTENT-ADAPTIVE height
  More: compact working module links only
  Persistent Bottom Shell: Home | Day | Ledger | Updates*   [+]
```

No `Trip Home` title or separate white top bar. Use My Trips Hero typography tokens. Edit uses the **same native Edit icon as Ledger**, not a generic pencil. Tapping Hero title/dates/destination opens same authorized basic Trip editor; cover editing belongs there, not in More or Photos. Controls remain readable as Hero scrolls away without overlapping underlying text.

## 2. Host behavior — Owner-approved revision

- **0 widgets:** no empty giant host; truthful contextual fallback.
- **1 widget:** render widget directly, **hide tab strip**.
- **2+ widgets:** small 11–13pt named tabs, subtle selection; horizontal scroll when necessary; tap and horizontal pager swipe synchronized. No automatic cycling, no dot-only replacement.
- **Different widgets may have different natural heights.** Remove 420–550pt forced equal height. Do not add blank spacers to make one-expense Finance match a rich Preparation. Content grows naturally, outer page scrolls vertically; avoid nested competing vertical scrolling. Switching pages must keep a sensible viewport anchor and selected widget identity.
- Bottom Shell may overlay the page visually, but every last row and CTA must be scrollable completely above it, with safe-area inset and correct touch targets.
- iOS native **left-edge right-swipe** returns Trip Home → My Trips; inner horizontal widget paging works away from the edge. Preserve My Trips scroll position; Menu All Trips is fallback.

## 3. Widget layouts (business contracts unchanged)

### Preparation — Upcoming
Empty: two equally prominent functional paths `Import travel plans` and `Build your itinerary`. Populated: dynamic truthful business-type counts, up to 3 most recently created/admitted formal Items (not drafts or import Candidates), compact Import more / Open Day. No fake counts, no arbitrary fixed height. Undated uses truthful planning fallback until exact reuse is confirmed.

### Today's Journey — Active
Title, trusted Trip-local date, prominent `Open Today` → **today's Day Header**. With accepted/locally committed eligible formal Items: one primary, up to 3 later entries, conditional Tonight Stay, direct existing Immersive. Empty valid day: `Nothing planned for today` with real Day navigation and optional authorized Add Plan, not technical error text. Missing time/read: honest short availability state, not invented Free Day. A locally committed manual Item must appear through owning local-first reads while sync pending when qualified. Bottom Day tab separately restores its bookmark.

### Journey Snapshot — Past
Truthful Days / Places / Activities, up to 20 deterministic accessible formal Item tags, direct Past Immersive, `Review Full Itinerary` → first Past Day Header. No photo dependency, no attendance inference, no rainbow palette.

### Expense & Settlement — Upcoming / Active / Past
Ledger-owned Group/My Spending, authorized counts/categories, up to 3 recent expenses in Upcoming/Active, Past Settlement if available. Real Spending/Analyze routes only. With one expense, compact height and no duplicated headers/buttons. No finance data → omit.

## 4. Lower page — More

`More` is a quiet section heading and a compact list/grid of **working** secondary module links: Documents, Members, Photos, Trip Settings when owning route/permissions actually exist. Neutral icons, concise labels, no huge `Unavailable` tiles or dead chevrons. Do not hide legitimate destinations merely because they lack a Widget. Do not turn a local cover picker into a Photos module. Remove the standalone `Trip cover` footer; move to Trip Edit. A raw `Saved itinerary` debug list should not become an alternative Day Feed; surface committed pending-sync Item in owning Day/Trip context.

## 5. Trip Basic Editor

Authorized Edit opens basic Trip form: title, start/end dates or undecided, destination summary and cover selection; cancel/save; offline local save; update My Trips and Home consistently. User-selected cover overrides automatic suggestion. Destination is **Trip-level place summary**, not street address; auto-generated suggestions may be offered but must not silently overwrite manual input. UI agent does not create new DB columns or AI service.

## 6. App navigation and shell

Authenticated App Root = **My Trips**, not legacy standalone App-level Today. Trip-level Home/Day/Ledger tabs **always visible** for selected Trip regardless of items/dates/network; Updates fourth when available; right contextual Action Island. Menu All Trips always returns My Trips. Hero Edit/Search/Menu over photo. Deep links retain target, and back from item Immersive restores widget and scroll without overwriting Day bookmark.

## 7. Cover image matching — planned separate workstream

Audit current cover catalog and licensing; add a bounded, curated offline collection tagged city/region/country and urban/coastal/mountain/rural/nature/activity. Prefer deterministic local destination normalization/tag matching, stable fallback and manual override; optional local/remote model only after privacy/cost/quality evaluation. Do not assume asset count or automatic image generation is approved by this blueprint.

## 8. Acceptance checklist

- App launch My Trips across merged code, offline and session restoration.
- New empty Trip retains Day tab, right-swipe back, correct Free Day vs unavailable distinction.
- Offline committed hotel appears in Day and qualified Today without cloud sync; Candidate not fabricated as admitted.
- One widget hides tabs; two+ small named tabs swipe/tap sync; different heights do not clip CTA.
- Finance one expense compact; Preparation rich Japan CTA visible; Past Snapshot honest.
- More has only legitimate functional links, cover in Editor, correct Ledger Edit icon, Hero tap targets.
- Light/dark, iPhone sizes, Dynamic Type, bottom shell glass, status bar, scroll-bottom and gesture conflicts pass Native QA.

## 9. Reference and change control

Use the accompanying **VQA R2 screenshot evidence board** as *observed defects*, not as a target UI design. V1.1 remains authority for full-bleed Hero, low-emphasis named tabs and shared OTR visual language; V1.2 supersedes its equal-height requirement and single-widget selector. Original four Widget Deltas retain semantic authority.
