# Universal P1 explicit Source Review — 26 October 2026

Owner approved a bounded P1 ACTIVITY review: the authenticated QA user reads the original and current Trip, explicitly chooses NEW and confirms title and civil date. Confidence remains advisory. Booking, entitlement and P2–P6 are excluded.

Reuse the existing Source candidate seal, Source Plan, Lifecycle qualifier and Admission/Core queue. A review binds the exact Result digest and Source revision. The server checks current Actor, original UTF8 spans, selected title and deterministic civil-date conversion; it stores the review inside the immutable candidate body and revalidates it on Admission/recovery. Changed review replay must conflict. No default NEW or manual-write fallback.

Preserve original date text and locator. A narrowly typed ENGLISH_MONTH_CIVIL_DATE normalization may derive an ISO civil date; it must round-trip against the original month/day/year and may qualify only the P1 START.local_date field. No timezone or event time inference.

Existing legacy HIGH_CONFIDENCE inputs without a genuine owning relationship remain closed. New explicit reviews produce a version-2 candidate seal. No new review table, authentication system or queue.

This is implementation authorization, not protected database or mutation activation. Prepare exact schema/RLS/GRANT and capability changes for separate Owner approval; Native Save remains disabled until then.

Data path: Cloud-shared immutable review in existing candidate → Source Plan → Admission → Core receipt → independent readback → repository/Day recovery. Native form draft is transient. Required evidence: L1 review and cold recovery; L2 forged/stale/cross-scope/changed replay/normalization tests; L3 exact approved synthetic P1 mutation and independent readback. L3 and main scoped integration remain open.
