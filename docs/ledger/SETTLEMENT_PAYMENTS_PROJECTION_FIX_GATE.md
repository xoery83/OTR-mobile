# Settlement Payments projection fix

Date: 2026-09-29. Local regression and original-iPhone UI gate PASS.

## Cause and implementation

The latest confirmed Adjustment contains the full financial snapshot in `inputs`,
but `transfers` contains only that version's delta. Payments previously displayed
the latter directly. An unchanged net therefore produced an empty Payments screen
even though the current total remained NZ$55.00.

`currentSettlementTransfers` now uses existing `balancesFromSettlementInputs` and
`buildTransferPlan` for confirmed Adjustments. ROOT/legacy mapping is unchanged.
The existing screen memoization responds to a new confirmed snapshot; no new
refresh lifecycle or persisted financial state is introduced. Personal payment
history/progress continues through its existing projection, without reducing the
recommended financial plan or changing canonical obligations.

No Backend, API contract, migration, valuation, confirmation guard or financial
mutation change. No incident-specific branching.

## Automated evidence

- 9 related suites / 65 tests PASS; selector suite 22 tests PASS.
- Added coverage: zero and nonzero Adjustment deltas, Mine/Everyone, existing
  received-payment progress, repeated refresh / JSON cold snapshot reconstruction,
  replacement by a later full snapshot, balanced empty plans and ROOT metadata.
- TypeScript, scoped ESLint/Prettier and `git diff --check` PASS.
- Signed Release native build and original-device installation PASS; data retained.
- Existing original snapshot reproduction changes empty cards to one NZ$55.00
  recommendation while retaining historical obligations totaling NZ$55.00.

## Original iPhone acceptance

Leon’s iPhone16pro, iOS 26.6, `com.xoery.otrmobile`, normal signed Release.
Installed JS bundle SHA-256:
`99274a1900819560d939e655883bd64d4da0de3b029444b88b644325e29acfba`.

Owner supplied a screenshot after opening the affected Journey. Agent subsequently
read the same formal screen through iPhone Mirroring and switched Everyone,
Summary, then Payments. No payment-entry or confirmation action was taken.

- Mine and Everyone: one NZ$55.00 recommendation to You.
- Expanded history: seven existing records visible, including foreign currencies.
- Existing progress: Received NZ$37.09 / 67%, consistent across navigation.
- Summary current balance and last confirmed amount: NZ$55.00.
- Returning to Payments retains the recommendation and history.

Read-only device database copy verifies 9 effective inputs, unchanged source
fingerprint `ebb48cd8b1414fd8c99983f68f8357949229caf41b0fab2624243a8633c28765`,
no pending financial operations and unchanged confirmed head:
`c9e746e7-f47d-47e0-907c-9159a459b602`, sequence 3, full inputs 9 / delta transfers 0.
The owner confirmed this head at `2026-09-29T03:55:35.165805+00:00`; the agent only
observed it. Immutable inputs/transfers and all 20 stored personal-payment financial
records match the pre-fix read-only snapshot. Normal pull refreshed projection
visibility; it did not create payment records.

## Boundaries and limitations

No automated Settlement Confirm or payment write. Production untouched. Hosted Dev
Backend remains `adjustment-lossless-source-20260929`, migration tail
`20260929000400`. This client-only fix needs no server deployment.

Real-phone navigation/re-entry verified; cold reconstruction is automated, with
no additional native force-quit test after the owner's successful screenshot.
Personal-payment progress remains informational under the existing policy.
