# Settlement 2.0 Final-version revision and clean-Trip acceptance plan

Date: 2026-09-23  
Status: Slices A–C and clean Hosted Dev V1/V2/V3 automated acceptance passed. Signed
Simulator gate passed; physical follow-up fixes are implemented. The separate human
two-account walkthrough has not begun. No schema or Production change was required.

## 1. Outcome

Revise Settlement so that every visible number has one explicit source:

- **Current calculation**: the latest canonical included Expense leaves;
- **Latest confirmed**: the newest immutable root/Adjustment version;
- **Previous confirmed**: an older immutable version selected from history;
- **Pending update**: a server-authoritative preview of current minus latest confirmed.

Summary, Paid, Shares, Payments, history, and correction screens must never silently
mix these sources. A confirmed version remains immutable. Later included Expenses or
authorized corrections create another confirmed version in the same lineage.

## 2. Non-negotiable product rules

1. Only the Journey Organizer/Owner can confirm initial or updated final amounts.
2. Members may review, raise a concern, and inspect changes, but member review never
   gates Organizer confirmation.
3. Initial confirmation creates one immutable root Final Settlement.
4. Only Expenses included in a confirmed version become protected from ordinary
   update/delete/restore. Excluded and post-Final Expenses are not retroactively part
   of that version.
5. A protected Expense is corrected only by creating a successor Expense and a new
   immutable Settlement version. The original Expense is never unlocked or rewritten.
6. A new post-Final `INCLUDED` Expense changes the canonical financial digest. The
   Organizer must be able to review the delta and confirm another Final version at any
   time once blockers are cleared.
7. A post-Final `EXCLUDED` Expense remains Spending but does not change Settlement and
   does not by itself require another Final version.
8. Personal Payment records, Review decisions, notes, receipt metadata, and other
   non-financial facts never change canonical Settlement totals.
9. Old Final inputs, balances, transfers, Payments, evidence, digest, and audit remain
   readable and immutable after every later version.
10. Offline or blocked state may prevent confirmation, but it must not make the update
    action disappear. The UI keeps the action visible and explains what must be fixed.

## 3. State and action model

| State                                                         | Member presentation                                                              | Organizer action                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| No Final; preview unavailable                                 | Current calculation and readiness reasons                                        | `Check final readiness`                                           |
| No Final; preview ready                                       | Current calculation                                                              | `Confirm final amounts`                                           |
| Final exists; current digest equals head                      | Current/latest first; quiet no-change state; last confirmed                      | Small `Correct a confirmed expense` link and `Settlement history` |
| Final exists; current digest differs; preview ready           | Current/latest, change list, last confirmed, exact delta                         | `Review & confirm changes` then `Confirm updated amounts`         |
| Final exists; current digest differs; blocked/pending/offline | Saved Current/confirmed values plus visible change and blocker state             | Visible `Review & confirm changes`; confirmation disabled         |
| Successor correction draft                                    | Previous confirmed remains authoritative; proposed old-to-new impact is explicit | `Confirm updated amounts`                                         |
| Updated version confirmed                                     | New Current/latest and last confirmed version; older versions remain in history  | Small correction link, `Compare versions`, `Settlement history`   |

“Final again” is not a second root and does not reopen the old root. It confirms a new
immutable Adjustment/version under the existing lineage:

- post-Final new/changed canonical input: existing Adjustment preview/finalize path;
- correction of a protected Expense: successor-correction preview/confirm path;
- both paths end in one new immutable current Final head.

## 4. Shared projection contract

Use the existing root/Adjustment lineage, current reporting projection, personal
statement, and preview contracts. Do not add a second calculation engine or state
framework.

The screen must first select one display mode:

- `CURRENT_ONLY` before any Final;
- `CONFIRMED_ONLY` when current equals the latest confirmed head;
- `CONFIRMED_WITH_PENDING_UPDATE` when current differs;
- `HISTORY_VERSION` when the user explicitly selects an older version.

Every module receives the same mode and version identities. A current personal
statement must never populate a card labelled `FINAL BALANCE`. A Final Summary must
never be paired with Current Paid/Shares rows unless the two snapshots are explicitly
shown and labelled.

One render also carries a lightweight read-model identity; no database field is
required:

- `comparisonId`;
- `projectionAsOf`;
- `currentDigest`;
- `confirmedHeadId`;
- `confirmedDigest`.

Summary, Paid, Shares, and Payments must receive the same identity. They may not each
select a different refresh moment. Current freshness is one of:

- `CURRENT_SERVER`: refreshed current server projection;
- `CURRENT_LOCAL_PENDING`: local-first financial changes are included but await sync;
- `CURRENT_CACHED`: refresh failed and saved current data remains visible.

These are internal states. User copy remains plain language such as
`Latest calculation`, `Includes changes waiting to sync`, or `Showing saved data`.

The minimum shared comparison result is:

- root/head/version IDs and confirmation time;
- current and confirmed input digests;
- per-member current and confirmed paid/share/net;
- signed delta per member;
- changed Expense count and identities;
- added, replaced, removed/excluded, participation, payer, split, amount, and valuation
  reason groups;
- preview readiness/blockers and whether the result is authoritative or cached.

## 5. Module revisions

### 5.1 Summary

- Summary uses three ordered modules rather than mixing Current and Final in one card:

  ```text
  1. CURRENT BALANCE · Latest calculation

  2. CHANGES SINCE LAST CONFIRMATION
     Added / corrected Expense list
     View all changes >
     [ Review & confirm changes ]   Organizer only

  3. LAST CONFIRMED
     Confirmed date, balance and version
     Correct a confirmed expense > Organizer only, small link
  ```

- The first module is always the latest canonical Current state. Before the first
  Final it also owns the initial readiness / `Confirm final amounts` action.
- The second module appears after a Final. When differences exist it shows a concise
  added/corrected/removed list, changed count, signed member delta, and a link to the
  full comparison. With no differences it collapses to a quiet no-changes state.
- The Organizer's prominent post-Final action lives only in the second module. Its
  label is `Review & confirm changes`; it confirms the complete eligible current
  change set as one new Settlement version after preview, never individual Expense
  rows and never a partial client-side subset.
- The third module is the previous/latest confirmed historical snapshot. It contains
  no large primary correction button. Organizer gets only a small
  `Correct a confirmed expense` link; regular members get version/history access.
- Final with pending changes therefore shows Current first, differences second, and
  the last confirmed baseline third. Final with no changes still keeps Current and
  Last confirmed source labels explicit even when their values are equal.
- Never label a Current value as confirmed.
- A new included Expense must populate the second module and make the Organizer action
  appear after refresh; blocked/offline state keeps it visible with an explanation.
- Regular members see the same authorized comparison but never a confirmation action.

### 5.2 Paid

- The formal Settlement tab name is `Paid`, not `Spending`. Ledger Spending includes
  every accepted Journey Expense, including `EXCLUDED`; Settlement Paid is the selected
  member's payer credit from included shared Expenses in the selected Settlement
  snapshot.
- Use the same selected version/mode as Summary.
- With pending changes, show `Latest`, `Last confirmed`, and `Change` for the selected
  member inside the Hero card.
- Category totals, counts, and expanded rows must be derived from the corresponding
  snapshot. Do not put current rows under a confirmed total.
- `Review changes` filters the comparison to payer-credit changes for the selected
  member.

### 5.3 Shares

- Mirror Paid with current/confirmed share and signed delta for the selected member.
- Expanded rows show exactly the inputs supporting the selected snapshot.
- `Review changes` filters to inclusion/split/share changes affecting that member.

### 5.4 Payments

- Recommended Transfers belong to the selected confirmed/current comparison state.
- Personal Payment records remain a separate overlay and never change Paid, Shares,
  balance, or whether an updated Final is required.
- When a new confirmed version creates new transfer obligations, retain old-version
  transfers and their payment evidence in history instead of netting or rewriting them.

### 5.5 Review changes

One comparison screen, reachable from Summary, Paid, and Shares, shows:

- added Expense;
- protected source replaced by successor;
- removal represented by an excluded successor;
- old and new amount, payer, participants/splits, participation, and valuation;
- old and new contribution for the selected member;
- signed member balance delta;
- link to current Expense and read-only historical source where authorized.

Metadata-only changes must not appear. If cached data cannot prove the delta, show that
refresh is required instead of inventing a comparison.

### 5.6 Confirm changes, correct confirmed Expenses, and history

- The prominent action for post-Final added or otherwise current-unconfirmed Expenses
  is `Review & confirm changes` in Summary's second module. It uses the general
  Adjustment preview/finalize path.
- Replace the large page-level `Make corrections` button with the small
  `Correct a confirmed expense` link inside Summary's `LAST CONFIRMED` module.
- Explain the required reason before the list; do not silently disable every row.
- A missing reason produces inline validation and focuses the field.
- Selecting a protected Expense opens a prefilled successor editor.
- Saving shows the server-authoritative old-to-new preview before confirmation.
- History rows open the selected version, not a generic latest statement.
- Add an explicit `Compare with previous version` action.
- Keep the correction path for protected inputs separate from the general
  post-Final-new-Expense update path.

### 5.7 Expense detail and editing

- A Final input displays `Included in final settlement` and remains read-only to
  ordinary edit/delete/participation actions.
- Organizer correction enters only through the dedicated successor flow.
- Excluded or post-Final unconfirmed Expenses retain their ordinary permission-based
  edit behavior.
- Expense detail links identify whether the user is viewing a current leaf or a
  historical frozen source.

### 5.8 Sync, cache, and offline states

- Load cached confirmed lineage first, then current projection and comparison preview.
- Preserve confirmed history when refresh fails.
- Do not replace a confirmed number with a newer Current number unless both source and
  state label change together.
- Open conflicts and pending financial operations remain visible blockers.
- Cross-device acceptance requires the same account/member/version, not merely the
  same Journey title. Screenshots must record active account and selected member.

## 6. Current gaps to close

1. Summary currently may prefer the current personal statement while labelling it
   Final whenever any Final exists.
2. Paid/Shares may use a different cached lineage head than Summary.
3. The general Adjustment preparation path exists but has no user-facing post-Final
   update flow.
4. `Make corrections` silently disables Expense rows until a reason is entered.
5. The correction screen covers protected Final inputs but not newly added post-Final
   included Expenses.
6. History rows do not open a version-specific statement or comparison.
7. Cached refresh failures and conflicts can leave devices on different projection
   times without enough version/source explanation.

## 7. Implementation slices

### Slice A — one source contract

- Correct Summary source precedence and introduce the minimal shared comparison helper
  over existing lineage/current-preview data.
- Make Summary, Paid, and Shares consume the same mode and version IDs.
- Add focused tests that reproduce `confirmed +2` versus `current +9` without allowing
  a Current value to carry a Final label.

### Slice B — post-Final update action

- Wire the existing Adjustment preview/finalize path into Settlement Summary.
- Build the ordered Current / changes / last-confirmed Summary modules.
- Show `Review & confirm changes` prominently inside the changes module whenever the
  confirmed digest differs from eligible current inputs, including a newly added
  included Expense.
- Keep the action visible with explicit offline, conflict, pending-sync, FX, or Review
  blocker state.
- Confirm a new immutable lineage head; never create a second root.

### Slice C — correction and history UX

- Replace the large `Make corrections` action with the small
  `Correct a confirmed expense` link in the last-confirmed module.
- Fix reason validation and row affordance.
- Finish protected-Expense successor editing, preview, and confirmation.
- Add version-specific history and previous-versus-current comparison.

### Slice D — device polish and release gate

- Verify member dropdowns, large text, VoiceOver labels, offline cached wording, account
  switching, and both-device convergence.
- Run the clean-Trip acceptance below before committing the release gate.

No schema change should be added unless implementation proves the existing root,
Adjustment, correction successor, and checkpoint projections cannot supply an exact
comparison. Record such a finding before proposing a migration.

## 8. Clean two-role Trip acceptance design

### 8.1 Environment and identities

- Create a brand-new Hosted Dev Journey with a unique acceptance name and ID.
- Settlement currency: NZD, scale 2.
- Member A: linked Organizer/Owner.
- Member B: linked regular member.
- Suggested device allocation: signed Simulator logged in as A; signed physical iPhone
  logged in as B. Later switch accounts to verify isolation and equivalent selected-
  member views.
- Start with zero Expenses, Settlements, Review findings, Personal Payments, conflicts,
  pending operations, and stale cursors for this Journey.
- Do not use Stage 9 or any prior reusable fixture.

### 8.2 Deterministic Expense set before Final V1

| ID  | Creator/payer |    Amount | Participants/split | Participation | Purpose                                 |
| --- | ------------- | --------: | ------------------ | ------------- | --------------------------------------- |
| E1  | A / A         | NZ$100.00 | A NZ$50, B NZ$50   | INCLUDED      | Owner-paid equal split                  |
| E2  | B / B         |  NZ$60.00 | A NZ$20, B NZ$40   | INCLUDED      | Member-created/member-paid exact split  |
| E3  | A / A         |  NZ$40.00 | A NZ$20, B NZ$20   | EXCLUDED      | Spending that must not enter Settlement |

Expected Current/Final V1 canonical values:

| Member |      Paid |    Share |   Balance |
| ------ | --------: | -------: | --------: |
| A      | NZ$100.00 | NZ$70.00 | +NZ$30.00 |
| B      |  NZ$60.00 | NZ$90.00 | -NZ$30.00 |

Spending includes NZ$200.00 across E1–E3. Settlement V1 includes only E1 and E2,
nets to zero, and recommends B → A NZ$30.00.

### 8.3 V1 flow

1. A creates E1 and E3; B creates E2.
2. Both devices converge and show the correct personal perspectives.
3. Verify B can edit E2 before Final but cannot directly edit E1.
4. B raises one human Review concern with an optional title note; verify reporter name,
   visibility, and that member review remains non-blocking.
5. A opens readiness, previews exact inputs/exclusion, and confirms Final V1.
6. Verify Summary/Paid/Shares all use V1; Payments recommends NZ$30.00.
7. Verify E1/E2 ordinary update/delete/restore are rejected locally and by Backend;
   E3 remains outside V1.

### 8.4 Post-Final included Expense and V2

Create E4 after V1:

| ID  | Creator/payer |   Amount | Participants/split | Participation |
| --- | ------------- | -------: | ------------------ | ------------- |
| E4  | B / A         | NZ$30.00 | A NZ$15, B NZ$15   | INCLUDED      |

Expected latest calculation before V2:

| Member | Latest paid | Latest share | Latest balance | V1 balance |     Delta |
| ------ | ----------: | -----------: | -------------: | ---------: | --------: |
| A      |   NZ$130.00 |     NZ$85.00 |      +NZ$45.00 |  +NZ$30.00 | +NZ$15.00 |
| B      |    NZ$60.00 |    NZ$105.00 |      -NZ$45.00 |  -NZ$30.00 | -NZ$15.00 |

Acceptance gates:

1. Summary shows Current first, E4 in `Changes since last confirmation` second, and V1
   in `Last confirmed` third.
2. A sees the prominent `Review & confirm changes` action inside the second module
   without opening a debug or hidden screen.
3. B sees the current-versus-confirmed change but no confirm action.
4. Summary, Paid, and Shares show the same V1/current comparison and `Review changes`
   identifies E4 as added.
5. The action remains visible offline/blocked and explains why confirmation cannot run.
6. Online, conflict-free confirmation creates V2 under the same root lineage.
7. V2 becomes latest confirmed; V1 remains byte-stable in history.
8. After both devices pull V2, `currentDigest == confirmedHeadDigest`, the changes
   module collapses to no-change, the confirmation action disappears, Current equals
   Last confirmed, Paid/Shares use V2, and both clients report the same head ID.

### 8.5 Protected Expense correction and V3

Use the small `Correct a confirmed expense` link in `Last confirmed` to replace E1
NZ$100.00 with successor E1′ NZ$120.00, retaining the equal A/B split.

Expected V3 values:

| Member |      Paid |     Share |   Balance | V2 balance |     Delta |
| ------ | --------: | --------: | --------: | ---------: | --------: |
| A      | NZ$150.00 |  NZ$95.00 | +NZ$55.00 |  +NZ$45.00 | +NZ$10.00 |
| B      |  NZ$60.00 | NZ$115.00 | -NZ$55.00 |  -NZ$45.00 | -NZ$10.00 |

Acceptance gates:

1. Reason is visibly required; missing reason is explained rather than silently
   disabling rows.
2. E1 opens prefilled; ordinary mutation of E1 remains rejected.
3. Preview names E1→E1′ and shows exact A/B deltas before confirmation.
4. Confirmation atomically creates E1′, the immutable successor link, and V3.
5. E1, V1, and V2 remain readable and unchanged; current source uses E1′ only.
6. `Compare with previous version` shows the E1 amount change and both member deltas.
7. After both devices pull V3, `currentDigest == confirmedHeadDigest`, changes and the
   confirmation action disappear, Paid/Shares use V3, and both clients converge to the
   same head ID.

### 8.6 Non-triggering and blocker cases

- Add an EXCLUDED E5 after V3: Spending changes, Settlement digest and Final-update CTA
  do not. Explicitly verify Ledger Spending increases while Settlement Paid, Shares,
  Current balance, confirmed digest, and confirmation action remain unchanged.
- Add/edit a Personal Payment: payment UI changes, canonical totals and CTA do not.
- Change only title/category/note/receipt metadata on an unfinalized Expense: no
  canonical balance delta.
- Create an included Expense with unresolved FX: update action remains visible but
  confirmation explains the FX blocker.
- Create a pending financial operation and an intentional revision conflict in a
  disposable Expense: confirmed history remains visible; update confirmation is
  blocked until synchronization/conflict resolution.
- Force offline cold start on both accounts: cached Final/version labels remain honest;
  no Current value is presented as confirmed.

### 8.7 Cross-device and account-isolation matrix

For V1, pending V2, confirmed V2, pending V3, and confirmed V3:

1. Record active account, selected member, root/head IDs, and data-source label.
2. Compare A on Simulator with A selected on the Organizer view elsewhere.
3. Compare B on physical iPhone with B selected on the Organizer dropdown.
4. Do not compare A's personal balance directly with B's and call the sign/value
   difference a parity failure.
5. Switch A→B→A on each device; verify no previous-account frame or member selector
   leaks across the transition.
6. Confirm both clients converge to the same lineage head, Expense count, digests, and
   zero pending/conflict residue after each online checkpoint.

### 8.8 Required evidence and PASS gate

Retain a concise acceptance record containing:

- Journey/member/Expense/Settlement version IDs;
- exact server inputs, balances, deltas, transfers, successor link, and digests;
- local SQLite counts/cursors/queue/conflict status for both accounts;
- screenshots of Summary, Paid, Shares, Payments, Review changes, history, correction
  preview, and Final-input Expense detail on both devices;
- offline/reconnect timestamps and convergence result;
- automated tests and signed Release build/install identifiers.

PASS requires exact arithmetic above, one immutable root plus ordered V2/V3 lineage,
visible Organizer update action after E4, version-consistent module rows, protected
source rejection, no duplicate input/transfer/action, and two-device convergence.

FAIL on any Current value labelled Final, wrong Summary module order, hidden post-Final
update action, large page-level correction button, silently disabled correction path,
old-version mutation, missing successor lineage, personal Payment changing canonical
totals, cross-account frame leakage, or unresolved queue / conflict residue at the
final online checkpoint.

## 9. Next checkpoint

Slices A–C are complete. The clean Hosted Dev acceptance passed on Journey
`e6e0955d-7f3c-4919-8801-8e6b4e05ce9f` with one root and two ordered Adjustment
versions. Finish Slice D device presentation checks and the release gate; retain the
fixture for cross-device inspection. Production remains out of scope.
