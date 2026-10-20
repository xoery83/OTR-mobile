# Ledger Settlement Testability Audit

Date: 2026-09-15
Environment: Hosted Dev only (`tuqigdxrvrerfewsxqgm`)
Scope: read-only audit; no application code, Backend, schema, Supabase data, identity
mapping, or Production change

## Result

The Europe-derived financial data is Settlement-ready. Settlement is currently
not visible on entry because neither Journey has a finalized Settlement and the
Mobile cache deliberately stores and automatically displays finalized Settlement
aggregates only. A preview is non-persistent by contract, is fetched only after
the user taps **Prepare settlement**, is held only in React state, and is cleared
when the Journey projection loads or changes.

This is primarily a **data-state plus presentation/cache-policy** limitation, not
an authorization, repository-read, or main Settlement routing failure. The
remote preview path works for both Journeys. The unfinished P5 routing does,
however, prevent realistic focused transfer-detail testing because
`transfer/[id]` ignores the transfer id and renders the complete Settlement page.

## Evidence and method

The audit used the existing Backend preview/bootstrap paths and repository code.
One read-only Hosted Dev diagnostic queried counts that are not exposed by a
repository summary. It performed no mutation. Existing acceptance records were
cross-checked against the live result.

The current authenticated Dev setup has one linked organizer in each Journey and
seven unlinked members. Current Simulator/device acceptance uses that same
approved Dev account. The linked member ids are Journey-specific.

## Current readiness

| Check                                   |                             Europe 2026 Replay |                                                                  Europe 2026 UI Polish |
| --------------------------------------- | ---------------------------------------------: | -------------------------------------------------------------------------------------: |
| Journey id                              |         `ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65` |                                                 `41076e49-0005-599f-af68-5062fd5695f8` |
| Expenses                                |                                            126 |                                                                                    133 |
| Business states                         |                                 126 `ACCEPTED` |                                                      132 `ACCEPTED`; 1 `RATE_REQUIRED` |
| Settlement participation                |                   68 `INCLUDED`; 58 `EXCLUDED` | 72 `INCLUDED`; 61 `EXCLUDED` total (60 accepted plus the excluded `RATE_REQUIRED` row) |
| Rate snapshots                          |                                            126 |                                                                                    126 |
| Active valuation snapshots              |                               126/126 Expenses |     132/132 accepted Expenses; the excluded `RATE_REQUIRED` row intentionally has none |
| Included valuation coverage             |                                          68/68 |                                                                                  72/72 |
| Open conflicts / preview blockers       |                                          0 / 0 |                                                                                  0 / 0 |
| Settlement readiness                    |                                `PREVIEW_READY` |                                                                        `PREVIEW_READY` |
| Preview inputs / exclusions             |                                        68 / 58 |                                                                                72 / 61 |
| Preview member balances                 |                                              8 |                                                                                      8 |
| Remote preview available                |              Yes, after **Prepare settlement** |                                                      Yes, after **Prepare settlement** |
| Cached preview available                |                                             No |                                                                                     No |
| Finalized Settlement                    |                                             No |                                                                                     No |
| Root Settlement                         |                                             No |                                                                                     No |
| Persisted transfer count                |                                              0 |                                                                                      0 |
| Preview transfer count                  |                                              6 |                                                                                      7 |
| Current user role in preview            | Payer on at least one transfer; not a receiver |                                         Receiver on at least one transfer; not a payer |
| Settlement Payment lifecycle rows       |                                              0 |                                                                                      0 |
| Expense payer-cost `PaymentRecord` rows |                                              0 |                                                                                      0 |
| UI hides preview-only data on load      |                             Yes, intentionally |                                                                     Yes, intentionally |

The UI Polish `RATE_REQUIRED` boundary Expense is `EXCLUDED`, so it is an
ordinary visual test case but not a Settlement blocker. Both previews are
zero-blocker, deterministic, and fully valued for every included Expense.

## Exact read and presentation path

1. The Ledger screen embeds `SettlementReadinessScreen` with the committed
   Journey id (`LedgerStage6Screen.tsx`). The main route also forwards its
   `journeyId`, so Journey selection and the overview route are correct.
2. On mount or Journey change, `useStage7Settlement` calls
   `ledgerSettlementRepository.listFinalized(journeyId)`, reads actor/organizer
   context, and explicitly calls `setPreview(null)`.
3. `listFinalized` reads only `ledger_settlements`. It has no preview read because
   no local preview table or cache contract exists.
4. The hook refreshes bootstrap/pull and rereads finalized rows. Bootstrap and
   incremental `SETTLEMENT` changes persist only finalized aggregates through
   `applyFinalizedSettlement`.
5. With no finalized rows, the screen shows its explanation and **Prepare
   settlement**, but no balances or transfers.
6. Tapping **Prepare settlement** invokes the existing remote preview endpoint.
   The returned balances and suggested transfers then render correctly, but only
   in component memory. Leaving, switching Journey, remounting, or cold-starting
   removes that preview.
7. Payment controls are rendered only from finalized transfers because preview
   transfers have no persisted transfer/payment identities. With no root
   Settlement, there can be no Payment, Adjustment, or export lifecycle.

P5 has not been implemented. The conservative behavior came from P1's
committed-Journey/stale-response work: cached/finalized state and async results
are gated by the active Journey, and preview is cleared rather than risk showing
another Journey's financial result. It does suppress useful preview content on
initial/offline display, but it does **not** suppress a valid preview after the
explicit button tap. Changing this behavior would require an approved preview
cache/read model; it is not a missing row bug.

The focused routes are still placeholders:

- `app/(tabs)/expenses/transfer/[id].tsx` ignores `[id]` and renders the whole
  `SettlementReadinessScreen`.
- `app/(tabs)/expenses/balance.tsx` does the same.

This routing/presentation gap affects P5 transfer-detail usefulness, not preview
calculation or authorization.

## What Europe data can test now

| State or task                              | Replay            | UI Polish         | Notes                                                                       |
| ------------------------------------------ | ----------------- | ----------------- | --------------------------------------------------------------------------- |
| Large realistic preview                    | Yes, read-only    | Yes               | 68 and 72 included inputs respectively                                      |
| Included/excluded explanation              | Yes               | Yes               | UI Polish also has an excluded rate-required visual row                     |
| Multi-member balances                      | Yes               | Yes               | Eight members                                                               |
| Transfer direction/density                 | Yes               | Yes               | Six and seven preview transfers                                             |
| Current-user owes UI                       | Yes, preview only | No                | Replay must never be used to create obligations                             |
| Current-user is owed UI                    | No                | Yes, preview only | Current linked organizer is a receiver                                      |
| Finalized/offline-cached overview          | No                | No                | No root exists                                                              |
| Focused transfer detail                    | No                | No                | Requires finalized transfer ids and the P5 route implementation             |
| Mark paid / confirm received               | No                | No                | Requires finalized transfers and lifecycle records                          |
| Full, partial, waiting, rejected, disputed | No                | No                | Semantics exist; data does not                                              |
| Adjustment required/blocked                | No                | No                | Requires a finalized root followed by a controlled canonical change/blocker |

## States that require synthetic Dev fixture facts

The Europe spending topology can supply the underlying balances and transfers.
The following lifecycle facts must be intentionally created in a mutable Dev
fixture; they must never be fabricated in Replay:

- a finalized root and persisted transfer identities;
- one fully confirmed transfer (`SETTLED`);
- one partially confirmed transfer (`PARTIALLY_PAID`);
- one active Paid assertion (`AWAITING_CONFIRMATION`);
- one rejected Payment and/or one disputed Payment (`DISPUTED` at transfer level);
- a second linked actor when true payer and recipient UI must both be exercised;
- an adjustment-required or adjustment-blocked canonical change.

Rejected and disputed Payment states are already supported. Rejection releases
the awaiting reservation and normally returns the transfer to its remaining-debt
state; dispute projects the transfer as `DISPUTED`. Confirmed partial discharge
projects `PARTIALLY_PAID`; a full confirmed discharge projects `SETTLED`.

Adjustment/blocker examples should remain in the existing synthetic Stage 7 test
fixtures or a small sibling fixture. Mutating an accepted Europe-shaped Expense
after finalization merely to force a blocker would make the UI Polish baseline
less stable.

## Option assessment and recommendation

| Option                                            | Assessment                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Remote preview only                            | Safest and already working. Covers readiness, balances, transfer direction, and exclusions, but cannot cover offline preview, focused persisted transfer detail, Payment, export, or Adjustment.                                                                                         |
| B. Dev-only cached preview                        | Not recommended. There is no preview persistence contract; adding one creates a new cache/repository lifecycle and still does not create canonical transfer ids for Payment testing.                                                                                                     |
| C. Separate full Europe-shaped Settlement Journey | Safe but duplicates 133 Expenses and another large fixture when UI Polish is already explicitly mutable. Use only if UI Polish must remain a pristine spending fixture.                                                                                                                  |
| D. Finalize UI Polish through normal flow         | Viable. Its preview is ready, the current actor is an authorized organizer, and finalization changes no Expense, split, participation, rate, or valuation fact. It creates the missing canonical transfer identities.                                                                    |
| E. Hybrid                                         | **Recommended:** keep Replay preview-only and immutable; use remote preview for both Journeys; finalize UI Polish through the normal Backend/domain flow for realistic Europe-derived transfer and Payment testing; keep contrived blocker/adjustment edges in small synthetic fixtures. |

The hybrid is the smallest path that covers the requested UI without inventing a
preview cache or cloning the complete Europe dataset again.

## Minimal future implementation and data steps

No step below was performed by this audit.

1. Freeze and verify the Replay fingerprint before any fixture command. Keep all
   commands hard-rejected for the Replay Journey id.
2. For UI Polish, call the existing preview endpoint with a fixed cutoff after
   the fixture's last Expense. Assert `PREVIEW_READY`, 72 inputs, 61 exclusions,
   zero blockers, eight balances, and seven transfers.
3. Finalize that exact digest through the existing organizer-authorized Backend
   endpoint with a stable fixture idempotency key. Do not insert Settlement rows
   directly. Bootstrap the result through the existing repository path and
   verify one root plus seven persisted transfers locally.
4. Use the existing Payment commands on separate transfers to create: one full
   confirmed discharge, one partial confirmed discharge, one awaiting Payment,
   and one disputed or rejected Payment. Use stable idempotency keys and normal
   actor authorization; do not insert lifecycle tables directly.
5. Link one existing second Dev identity to a debtor member through an approved
   member-link path, then switch between that payer and the current receiver to
   test actor-specific controls. If no normal member-link command exists, stop
   and use a small isolated synthetic role fixture; do not direct-update member
   identity mapping.
6. Implement P5's focused transfer route using the existing finalized repository
   result. The route must consume and validate the transfer id instead of
   rendering the entire overview. No Settlement semantic or schema change is
   needed.
7. Keep adjustment-required/blocked cases in the existing synthetic Stage 7
   fixtures, or add one minimal sibling fixture only if real-device routing needs
   it. Do not alter UI Polish's accepted Europe-derived Expense structure solely
   to manufacture an edge state.

## Current-user conclusion

The current Dev user does have meaningful transfer roles, so lack of personal
involvement is not the root cause:

- Replay: payer on a preview transfer;
- UI Polish: receiver on a preview transfer.

Switching between the current account and one existing second Dev account linked
to a UI Polish debtor is the cleanest real-device payer/receiver test. Linking a
second member in Replay is prohibited. A separate synthetic role fixture is the
fallback if there is no approved normal member-link flow.

## Safety constraints

- Treat `Europe 2026 Replay` as immutable: no finalization, Payments, Expense
  changes, participation changes, rate changes, identity changes, or synthetic
  lifecycle history.
- Do not cache Replay preview by writing synthetic local rows.
- Use only existing Backend/domain commands for UI Polish finalization and
  lifecycle facts; no direct financial-table mutation.
- Never reopen or rebuild a finalized Settlement. Adjustment lineage is the only
  product path after finalization.
- Keep fixture commands fixed to Hosted Dev, exact Journey ids, expected names,
  expected counts, and pre/post Replay fingerprints. Production must fail before
  client/network creation.
- Preserve the existing integer-money, input-digest, idempotency, actor,
  authorization, immutable audit, and confirmed-discharge semantics.

## Reset and rebuild strategy

Finalized Settlement and Payment history is intentionally immutable, so reset
must mean **replace the whole Dev-only UI Polish fixture**, never reopen or edit
its Settlement lineage.

Add one guarded fixture reset mode only when implementation is approved. It
should require the Hosted Dev project ref, exact UI Polish id/name/version, and
the expected current fixture digest; remove only that dedicated Journey in a
single dependency-safe fixture transaction; rerun the existing deterministic UI
Polish builder; replay preview/finalization/Payment commands with stable fixture
keys; and verify the Replay fingerprint before and after. It must refuse partial
cleanup or an unexpected digest. If whole-Journey teardown cannot be made safe,
create a versioned UI Polish Settlement fixture id and retire the prior fixture
instead of deleting individual immutable facts.

## Suggested real-device acceptance paths

1. **Replay safety and preview:** sign in as the current Dev organizer, open
   Replay, tap **Prepare settlement**, verify 68 included / 58 excluded, eight
   balances, six transfers, and a personal payer direction. Leave without
   finalizing; verify the Replay fingerprint remains unchanged.
2. **UI Polish preview:** open UI Polish, verify the initial finalized cache is
   empty, tap **Prepare settlement**, verify 72 included / 61 excluded, zero
   blockers, seven transfers, and the current user's receiver direction.
3. **Finalized cache after approved fixture seeding:** cold-start online to
   bootstrap one root and seven transfers, then force-quit and reopen offline.
   Verify the finalized overview and lifecycle rows remain visible from SQLite.
4. **Payer path:** sign in as the linked debtor identity, open a focused transfer,
   mark a permitted amount Paid, and verify `Saved on this iPhone—will sync` when
   offline plus normal convergence after reconnect.
5. **Receiver path:** switch to the current organizer/receiver, confirm one full
   and one partial Payment, reject or dispute the designated example, and verify
   remaining/awaiting/confirmed amounts and next actions.
6. **Lifecycle scan:** verify one each of `SETTLED`, `PARTIALLY_PAID`,
   `AWAITING_CONFIRMATION`, and `DISPUTED` or rejected evidence without exposing
   raw ids or enum-only wording in ordinary UI.
7. **Adjustment edge:** use the isolated synthetic Adjustment fixture to verify
   required and blocked presentation and navigation; do not modify Replay or the
   Europe-shaped UI Polish inputs for this check.
8. **Journey isolation:** rapidly switch Replay/UI Polish/synthetic fixtures and
   confirm no stale preview, finalized row, transfer, or actor action appears
   under the wrong Journey.

## Stop point

Audit complete. No fixture finalization, identity mapping, Payment creation,
Expense/rate/participation change, code change, Backend/schema change, Supabase
mutation, or Production access was performed.
