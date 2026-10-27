# P1 move Native R3 — 25 October 2026

Device Hub GUI explicitly returned by Universal; restored only Forms QA AppWindow-2 through Window menu. AD5/MT Correction business UI untouched. Forms QA had a blank scene after an intermediate hot-update error (missing catalog value while source was changing); cold-launched only com.xoery.otrmobile on C0C23E00-5016-4289-B806-92C5484BD5BA using own Metro8096, then opened the P1 future fixture. Current scene loads successfully.

Native recording exposed two real layout defects: absolute flex-wrapped clock text fell outside the date pill and crossed the line; overlay-only insertion covered the preceding location text. Repaired with one native Text paragraph (13pt date plus16pt clock), an actual64pt temporary destination gap in the existing measured row/header wrapper, and line offsets within that gap. The initial pickup selects the actual destination immediately, avoiding a Day-header gap flash. No shared Reader/list/authority API changes in this repair.

Actual simulator hold/release verified: 3.5–5second stationary holds arm the floating card, semantic light mask, bright destination band and date/clock insertion line; release removes them and restores normal content. Metro records arm then end changed:false/status:READY. Final R3 frame7 visually confirms one-line date/clock, line inside the gap, preceding/next Item content unobscured, no left ruler.107 directed tests/Typecheck/UIguard/scopedlint pass after the repair.

Evidence root (outside repository):
`/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/p1-move-v1/`
- native-hold-r3.mov (actual simctl native screen recording while CUA holds/releases)
- r3/frame-7.png (held)
- r3/frame-10.png (released)

Limits: CUA supports discrete hold and drag but not a combined sustained hold+drag touch. A normal drag attempt did not arm pickup and is not counted as Move PASS. Continuous single-finger cross-date motion, follow smoothness, precision changes while held, moved release/confirm and physical haptics remain pending direct device verification; pure/hook tests are not substituted for it. No real Reader mutation or Cloud claim. Source is still a synthetic non-saving Native fixture.

Forms QA latest scene remains open for Owner inspection. Do not minimize it or switch to another simulator without the next explicit GUI handoff. No QA records/queues were changed by this display test.
