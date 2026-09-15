# Ledger UI Polish Fixture Acceptance

Date: 2026-09-14
Environment: Hosted Dev only (`tuqigdxrvrerfewsxqgm`)

## Result

PASS. Exactly one dedicated Dev Journey named `Europe 2026 UI Polish` was
created with ID `41076e49-0005-599f-af68-5062fd5695f8`. No UI/UX product work
was started, Production was never accessed, and the approved `Europe 2026
Replay` remained read-only.

## Source and privacy boundary

- The 126 baseline Expenses preserve Replay dates, categories, payer topology,
  participants, exact splits, original amounts/currencies, valuation amounts,
  rate snapshots, and INCLUDED/EXCLUDED semantics.
- The source reader deliberately does not select Replay Expense titles,
  descriptions, or member display names. None of that text can be copied into
  this fixture.
- All eight display names and every Expense title/description are synthetic.
  A final email/phone-pattern scan returned zero hits.
- The Replay canonical snapshot remained
  `50c8125a45d23f75a8df7de63256fdb5bff21943b109aa64166c2f7c23b42e7d`
  before and after fixture creation and every verification run.

## Fixture profile

- Members: 8 synthetic labels; only the existing approved Dev organizer user is
  linked. No additional identity mapping was manufactured.
- Expenses: 133 total: 126 structurally cloned baseline rows plus 7 synthetic
  boundary rows.
- Business status: 132 ACCEPTED, 1 RATE_REQUIRED.
- Settlement participation: 72 INCLUDED, 61 EXCLUDED. The RATE_REQUIRED visual
  fixture is EXCLUDED so settlement preview remains valid.
- Participants / exact splits: 565 / 565.
- Rate snapshots: 126.
- Active valuation snapshots: 132. The table also retains 18 inactive snapshots
  as immutable append-only repair lineage; no inactive snapshot is read as the
  current valuation.
- Receipt assets: 1 synthetic PNG, uploaded and linked through the normal Backend
  receipt lifecycle.
- Settlement currency: CNY, scale 2, inherited from Replay.

### Synthetic text distribution

- Title language groups: English 18, Simplified Chinese 18, Traditional Chinese
  18, French 18, Nordic 18, Chinese + English 18, Latin + accents 18.
- Baseline title lengths: short 32 (25.4%), normal 57 (45.2%), long 25 (19.8%),
  extreme 12 (9.5%). All 126 baseline titles are unique.
- Baseline descriptions: none 65, short 25, multi-line 12, long 12, mixed 12.
- Synthetic member labels cover very short, long Latin, Simplified Chinese,
  accented French, Icelandic/Nordic, and mixed Chinese + English forms.

### Boundary rows

The seven additional rows cover an extreme English title/description, long
Chinese text, long accented French plus a large amount, a one-unit zero-decimal
JPY amount, a three-decimal KWD amount, a valid RATE_REQUIRED state, and a
receipt-ready Expense. They use the existing Expense aggregate validator and
equal-allocation logic; no second financial implementation was introduced.

## End-to-end evidence

- Hosted Dev transaction and final read-only verification: target name count 1;
  all expected row counts and exact synthetic text/status/participation values
  matched. Other Journeys and Replay were unchanged.
- Existing Backend gateway: bootstrap returned 133 Expenses; Analysis returned a
  positive authoritative total; Settlement returned `PREVIEW_READY`.
- Mobile pull / SQLite v17: 133 Expenses, 565 participants, 565 splits, 132 active
  valuations, and 1 receipt; `integrity_check = ok`. My Ledger cached 14 member
  summaries and incremental pull converged at sequence 696.
- Release Simulator with prototype disabled: normal Journey selection displayed
  Replay and UI Polish separately; Ledger home, Search, wrapped multilingual
  titles, and long text rendered from repository-backed data. Repository search
  found Chinese, Latin, and emoji examples.
- Offline cold start: after Backend and Metro stopped, force-quit/relaunch opened
  the same cached UI Polish Ledger and Search data.
- A physical iPhone run was not required: Simulator covered CJK, accents, emoji,
  wrapping, navigation, pull, SQLite hydration, and offline rendering without a
  device-only ambiguity.

## Regression and safety

- TypeScript and ESLint: PASS.
- Vitest: 54 files / 198 tests PASS.
- PostgreSQL pgTAP: 10 files / 200 checks PASS.
- The one-time fixture repair RPCs were removed after their append-only repairs
  completed. The retained fixture loader is service-role-only, fixed to the
  approved Dev source/name/count contract, and the CLI hard-fails for any project
  ref other than Hosted Dev.
- Final target snapshot:
  `d3973518a19cd1fd2442089ffe9df490d499fa626cdc67572e09eee7705192d7`.
- Production network access: zero. Production schema/data mutation: zero.

## Handoff

`Europe 2026 UI Polish` is ready as the dedicated visual audit baseline. This
work stops here; UI/UX audit and polish require a separate approval.
