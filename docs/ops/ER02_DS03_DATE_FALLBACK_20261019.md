# ER02 DS-03 — Hermes compact date ranges

Fallback only when Intl.formatRange is unavailable: reuse Intl date parts and locale order, sharing the common year and (within one month) month. Never compress different years. No date, timezone, Reader or Calendar contract changes.

EN/ZH same-month, cross-month and cross-year fallback tests PASS. Combined five directed suites98 tests PASS; typecheck, scoped ESLint, UI guard PASS. Independent scoped formatter review found no issue. CODE_READY / NATIVE_PENDING.

Native ca7875a evidence separately identifies Day toolbar/body overlap and the floating Day bookmark return failure. An attempted shared Frame wrapper was rejected by Independent Review and fully removed before commit: existing routes can own a Frame, and the approved Day contract needs scrolling beneath native material. Date formatting alone does not fix that overlap. Coordinator owns the existing FLOATING adapter handoff; Experience must not guess a timezone.
