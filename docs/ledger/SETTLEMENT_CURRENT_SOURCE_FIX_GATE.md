# Settlement current-source fix gate

Date: 2026-09-29. **Fix gate PASS.** Hosted Dev only. Expense Consistency Closure remains preserved
in commit `019c389`; this follow-up is outside that checkpoint.

## Minimal source change

The shared Backend `calculateSettlementPreview` now reads the confirmed head first.
With a confirmed root it uses `ledger_adjustment_source_current_7_2c` at the requested
cutoff; without a confirmed root it retains `ledger_settlement_source_7_1`.
A missing confirmed aggregate or failed root source fails closed. No SQL migration,
data repair, policy change or equality relaxation was required. All shared callers
receive the corrected source; fingerprints, head/digest checks and confirmation
guards remain in place.

Normal UI hides refresh diagnostics unless the stored explicit Debug Mode is on.
Source verification failure uses neutral copy: “The latest amounts could not be
verified. Check for latest changes before confirming.” It no longer asserts an
Expense conflict merely because source verification failed.

## Automated evidence

- 15 affected suites / 191 tests plus one normal-UI rendering test PASS.
- 31 existing SQL suites / 640 assertions plus the new correction source suite /
  9 assertions PASS: **32 suites / 649 assertions** total.
- TypeScript, Backend build, scoped ESLint, formatting and diff checks PASS.
- Generic two-chain fixtures cover `1 → 2 → 3` and `4 → 5`, ROOT and ADJUSTMENT heads,
  exact ordinary/Adjustment source and change-set equality, repeated refresh and
  cold projection reload. Initial-settlement behavior remains unchanged; root RPC
  failure cannot fall back to historical raw input.
- SQL covers terminal successors, untouched historical inputs, repeat reads, cutoff
  rejection, missing root and RPC access restrictions. Local fixture writes roll back;
  automated acceptance does not execute Settlement Confirm.

## Hosted Dev deployment

- Target: `tuqigdxrvrerfewsxqgm`, `https://api-dev.xoery.art`, development environment.
- Linked migration tail verified **20260929000300**, unchanged. No migration applied.
- Release: `/opt/otr/dev-backend/releases/settlement-current-source-20260929`.
  Only the tested gateway source change was deployed over the accepted Phase 6 source.
- Gateway SHA-256:
  `17eed2fd759d4dc28f67450794d8b916a50b96c05cfdb2c355bb5580fbadb372`.
- Running Backend bundle SHA-256 matches local build:
  `aa9e9679a5f56c94e1fea15be16478bd684eb5d1b2773f02bf45aacb49dee963`.
- Image:
  `sha256:7937103e2c34c2952cac758da95c156c94148cd3ba2785a47c76a39d93bf837f`.
- Health returns `status: ok`, `environment: development`.
- Rollback retained: release `previous-source.tgz` and image
  `otr-dev-backend:pre-settlement-current-source-20260929`.

## Real Journey acceptance

Scoped evidence: `evidence/settlement-current-source-fix.json`.

| Journey                                         | Local / ordinary / Adjustment inputs | Added / NEW | Organizer net |
| ----------------------------------------------- | ------------------------------------ | ----------- | ------------- |
| LAWSON `2bb2624c-7cf1-48dc-9607-0f4110130388`   | 9 / 9 / 9                            | 6 / 6       | NZ$55.00      |
| ce SHi22 `e6e0955d-7f3c-4919-8801-8e6b4e05ce9f` | 6 / 6 / 6                            | 3 / 3       | NZ$34.72      |

Both ordinary and Adjustment APIs return 200 / ready / blockers []. Two read rounds
have stable source fingerprints; actual local repository sources equal the server
sources field for field. The corrected LAWSON Journey E1 predecessor is absent
from effective input and Added; its terminal successor remains authoritative.
Settlement heads/digests, Expense revisions, valuation identities and Settlement
audit identities are unchanged before/after acceptance.

Updated normal Release clients preserve the original iPhone and Simulator data.
The formal screens refresh successfully and enable Confirm after a reason is entered;
no Confirm action is executed. Simulator cold restart and reopening the same formal
route again pass, retaining the exact six-input fingerprint.

Original iPhone cold-start recheck PASS: owner reopened the same formal route and
confirmed NZ$55.00, six Added items, no source mismatch and an eligible button after
entering a reason. A final read-only repository snapshot retains the exact nine-input
fingerprint. Neither device required a local-only repair. Reason text was used only
to observe eligibility; no confirmation was submitted.

## Remaining limitation

The pre-existing refresh feedback “Settlement updated with the latest changes” can
sound like an actual confirmation. It comes from publication of a newer preview,
not a mutation. This copy issue is recorded separately; it is not proof that Confirm
was executed and does not weaken eligibility. No unrelated working-tree changes
were included in the Backend release.

Production was not accessed. No financial data patch, conflict-row repair or
Settlement Confirm was performed. Stop at this fix gate.
