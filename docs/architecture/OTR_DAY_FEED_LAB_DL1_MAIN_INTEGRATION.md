# DL1 controlled local-main integration

2026-10-12 · Owner accepted `81b2192` and `fb0aba7` for local integration only.

- Pinned canonical main/local origin/main/read-only remote: `12693e3`.
  Remote SSH required sandbox escalation; actual remote readback matched.
- Integration branch `codex/day-feed-lab-dl1-integration`, worktree
  `/private/tmp/otr-dl1-main-integration-20261012`.
- Accepted DL1 branch merges with its original two commits retained in ancestry.
  No product conflict. Only current-state prepend conflicted; retain DL1's
  exact checkpoint prefix followed by current main's complete tracked handoff.
- Backend-only intervening main changes left DayFeed, TripScreen, routes,
  localization and owning Flight adapter unchanged. No concurrent feature imported.
- All accepted DL1 files except the reconciled handoff are byte-identical to
  `fb0aba7`. Single G2 Composer, P1/P2, NOW/Focus, date/scroll, native Immersive
  inset and Release guards remain unchanged.
- Focused Day/Feed/Lab/Core/Flight:9 suites/124 tests PASS; typecheck, full lint/UI
  guard, touched format and whitespace PASS. Release guard test included.
- Exact current clean-main:3711 PASS/2 baseline FAIL/21 skipped. Integration:
  3718 PASS/same2 FAIL/21 skipped; all7 DL1 tests pass. Same navigationLayout and
  architectureBoundary failures; no guard weakening and no full-suite PASS claim.
- Accepted DL1 native screenshots/Fixture/Simulator evidence retained unchanged;
  Phase A adds no native claim or real-data/Hosted/provider operation.
- Eight concurrent worktrees pinned by HEAD/index/status/dirty-file hashes.
  Canonical dirty/staged/untracked work remains outside this commit. Handoff
  preservation is rehearsed with the original dirty working bytes kept as an exact
  suffix, only the new committed prefix prepended, then ordinary fast-forward.
  Recheck pinned main and all fingerprints immediately before advancement;
  assert no staged difference and preserve all unrelated hashes afterward.

Evidence: `/private/tmp/otr-dl1-current-main-baseline.json`,
`otr-dl1-current-main-integrated.json`, `otr-dl1-integration-focused.log`,
`otr-dl1-integration-typecheck.log`, `otr-dl1-integration-lint.log`,
`otr-dl1-integration-preservation-before.json`. Final main HEAD is the integration
branch tip, recorded by the DL2 follow-up handoff and completion response.

No push, deployment, schema/migration, Seed, canonical write, auth bypass,
Hosted/Production/provider or unreviewed Flight merge. After safe local-main
advancement, begin the Owner-authorized DL2 read-only slice on a separate branch.
