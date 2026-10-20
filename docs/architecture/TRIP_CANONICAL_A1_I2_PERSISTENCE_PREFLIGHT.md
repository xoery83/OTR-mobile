# Trip Canonical A1-I2-P — Participation Lifecycle Persistence Preflight

- Status: **A1-I2-P PREFLIGHT COMPLETE — REVIEW PENDING**.
- Date: 2026-10-03 (Pacific/Auckland).
- Branch: `integration/ledger-polish-canonical`.
- Baseline HEAD: `fc6424ba94d846f8f34a2bc7827d95ce87655162`.
- Accepted A1-I1 commit `3c43572706f386d20b90568d9daeb6f42d39f8e8` is an ancestor.
  HEAD additionally commits the enrichment source-matrix document. The workspace
  was clean at this retry; no unrelated working changes were incorporated.
- Only this report is added. No application/schema/test/configuration change,
  migration, remote access, deployment or device build occurred.

CURRENT describes repository evidence at this HEAD, not live database state.
APPROVED describes the participation/identity semantics supplied in this task.
PROPOSED describes the persistence/projection/mutation recommendation awaiting
human review. No future column name, migration number or SQL is assigned here.

## A. Executive recommendation

Recommend **Option B: an independent participation-active field on the existing
`journey_members` row**, with only two business states. Prefer a Boolean physical
representation; ACTIVE maps to true and INACTIVE to false. Preserve every ID,
`user_id`, link `status`, `role`, access path and financial reference.

**Migration required: YES — additive migration recommended.** Server persistence
and the existing local projection must gain lifecycle information; transport and
reconciliation must deliver it reliably before actions/selection are enabled.
No migration is created or approved by this report.

Recommended decisions:

| Decision                                                              | Evidence / reason                                                                                       | Status                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Never overload `status` or `role`                                     | Their link/admission/permission meanings are active consumers, B                                        | DECIDED by approved semantics and source  |
| Independent Boolean on existing Person                                | Two orthogonal states needed; no new identity/table, E/F                                                | PROPOSED — review pending                 |
| Backfill existing Persons ACTIVE                                      | No deterministic travel-inactivity fact in current schema, G                                            | PROPOSED — review pending                 |
| Continue one local Member projection                                  | Existing hydration/read boundary sufficient; no independent Trip bootstrap, H/I                         | PROPOSED — review pending                 |
| Add lifecycle-only monotonic revision/evidence                        | Opposing transitions, stale replay and bootstrap reconciliation need ordering, J/L                      | PROPOSED — review pending                 |
| Refresh through scoped bootstrap with lifecycle snapshot invalidation | Current incremental contract has no Member event; existing controlled-bootstrap recovery is reusable, J | PROPOSED — review pending                 |
| Financial reads never apply a blanket active filter                   | Member FKs, historical snapshots, settlement input and repayment paths, C/D                             | DECIDED by approved preservation contract |

Implementation is not authorized. Exact persistence names, lifecycle command
storage and cursor extension require review in the affected future slice.

### Evidence index

These are repository-relative paths. SQL basenames in the following sections
resolve under `supabase/migrations/`. Line numbers are baseline evidence anchors,
not permanent API contracts.

| ID  | Source and scope                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | `supabase/migrations/20260910000100_canonical_production_baseline.sql`: Member definition 527–541, checks 1187–1191, creator insertion, invites/claims/removal, Member notes/RLS, update timestamp trigger                                                                                                                                 |
| E2  | `supabase/migrations/20260910000200_canonical_security_hardening.sql`: linked-role live-location helper/policies and authenticated claim/invite RPC grants                                                                                                                                                                                 |
| E3  | `backend/src/supabaseGateway.ts`: `capabilities`, `canReadTrip/canWriteTrip/canFinalizeSettlement`, receipt admission, Member validation, Settlement actor/coverage, My Ledger linked-account queries, `readLedgerBootstrap/readLedgerChanges`                                                                                             |
| E4  | `src/data/api/ledgerReadContracts.ts`: `ledgerMemberSchema`, bootstrap, capability and incremental schemas; `src/data/repositories/ledgerReadRepository.ts`: `applyJourney`, `listMembers/listHouseholds`, `applyBootstrap/applyChanges`, cursor storage                                                                                   |
| E5  | `src/data/db/migrations.ts`: migration 5 `ledger_members`; migration 19 scoped actor context/cursor compatibility; `src/domain/trip/person.ts`; `src/data/repositories/tripPersonRepository.ts`                                                                                                                                            |
| E6  | `src/features/ledger/LedgerExpenseEntryScreen.tsx`: `loadContext`, sharing payer/participant choices; `LedgerExpenseDetailScreen.tsx`; `expenseDraft.ts`; `expenseEntryPresentation.ts`                                                                                                                                                    |
| E7  | `src/data/repositories/ledgerReportingRepository.ts`: actor context, `listFilterOptions`, Journey/Member reporting/search joins; `src/features/ledger/LedgerSearchScreen.tsx`, `LedgerAnalysisScreen.tsx`, `LedgerStage6Screen.tsx`, `ExpenseConflictResolutionScreen.tsx`                                                                 |
| E8  | `src/features/ledger/loadEstimatedSettlement.ts`, `estimatedSettlement.ts`, `settlementSections.ts`, `SettlementReadinessScreen.tsx`, `SettlementStatementScreen.tsx`; `src/data/repositories/ledgerSettlementRepository.ts`; `src/features/ledger/PersonalPaymentSection.tsx`; `src/data/repositories/ledgerPersonalPaymentRepository.ts` |
| E9  | `supabase/migrations/20260911000100_ledger_2_domain.sql`: Member FKs, aggregate validation, change table/triggers, idempotency store; `20260912000700_ledger_2_stage_7_1_settlements.sql`: source Member snapshots; SQL families listed in B.2                                                                                             |
| E10 | `src/data/sync/ledgerReportingCoordinator.ts`, `ledgerReadTransport.ts`, `ledgerActiveSync.ts`, `ledgerOperationalSync.ts`, `ledgerPersonalPaymentCoordinator.ts`; backend cursor helpers; `20260917000600_ledger_journey_currency.sql` and `20260924000200_personal_payment_fx_projections.sql`                                           |
| E11 | `src/data/auth/accountGeneration.ts`, `accountSwitchCoordinator.ts`; A1-I1 report/tests; `src/data/repositories/itineraryRepository.ts`, `src/domain/itinerary/types.ts`; baseline itinerary/reservation participant tables                                                                                                                |
| E12 | `backend/src/stage9Import.ts`, `uiPolishFixture.ts`; `scripts/stage9/extract-production.ts`; Dev fixture/validation scripts; SQL and TS tests listed in B.4                                                                                                                                                                                |

Repository instructions, required architecture/current-state sources, A0/A1-D,
A1-I1 report and terminology were read in this conversation. Relevant status,
role, projection, picker, financial and sync sources were rechecked. The legacy
Web repository was not reopened. No UI or glossary changes are proposed.

## B. Existing status / role semantics

### B.1 Persisted facts and the seven status questions

CURRENT `journey_members.status` is non-null text, default **`unlinked`**, with a
check allowing exactly **`linked`, `unlinked`, `invite_pending`**. `role` is
non-null text, default **`group_member`**, with exactly **`owner`, `group_member`,
`guest`**. UUID identity and unique `(trip_id, user_id)` remain separate (E1).
Later migrations re-create financial/Review consumers but do not add a travel
participation state or change those Member status/role checks.

| Question                                | Source-backed answer                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. What does status mean?               | Link/admission compatibility: unclaimed, invited placeholder, linked Account; not travel selection                                                                                                      |
| 2. Link/admission-related?              | Yes: accept/claim searches unlinked/invite_pending and sets linked; creator trigger inserts linked owner                                                                                                |
| 3. Used as permission?                  | Yes: backend capabilities/read/write/finalization/receipts/My Ledger; linked-role SQL finance/Review/location gates                                                                                     |
| 4. Are Members filtered by status?      | Yes server-side for authenticated Actor/Review coverage/My Ledger/claim candidates. Bootstrap/local general Person/member lists do not filter it                                                        |
| 5. Would adding INACTIVE break clients? | Current check rejects it; extending the check still makes linked comparisons false and breaks strict import enum readers. Old general DTO accepts arbitrary strings, but permission logic still changes |
| 6. Can an existing value be repurposed? | No. Setting inactive to unlinked changes claim eligibility/Review/private/financial authority; invite_pending changes invitation selection/order. Neither means stopped travelling                      |
| 7. Can linked and inactive coexist?     | Yes, approved linked inactive Organizer scenario. One overloaded status cannot preserve both facts                                                                                                      |

`status` is not a complete universal access authority: creator/legacy membership
paths also exist. Some tests deliberately set `unlinked` to model loss of linked
admission. That usage is evidence against reuse for participation, not evidence
that every unlinked person is inactive or that current leave/revoke is canonical.

### B.2 Status consumer inventory

The scoped search covered production TS, local schema, retained server migrations,
tests and fixture/extraction scripts. Grouping below includes all located Member
status uses; unrelated Expense/payment/Review/queue `status` fields are excluded.
Repeated SQL definitions retain their migration lineage; a later replacement is
not evidence that its earlier definition never mattered.

| Consumer family                            | CURRENT behavior / affected symbols                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation / invitations / claims — baseline | `add_trip_creator_as_journey_member` inserts linked owner; `accept_journey_invite` finds unlinked/invite_pending (email, then display-name=email fallback), prefers invite_pending, sets linked or inserts linked group_member; `claim_email_invited_journeys` filters candidates and removed markers, sets linked; `claim_journey_member` updates same ID to linked and projects legacy membership |
| Removal / markers / notes — baseline       | `remove_journey_member` checks last role-owner, deletes legacy membership, records `journey_removed_users`, revokes matching email invites and physically deletes Member. Financial RESTRICT may roll back. Notes update changes notes only; markers describe Account admission exclusion, not Person participation                                                                                 |
| Retained background/location helpers       | Baseline `can_manage_background_jobs` uses linked owner/group_member branch plus creator/legacy branches; hardening replaces `can_share_journey_live_location` with linked owner/group_member and its RLS policies (E1/E2)                                                                                                                                                                          |
| Member RLS / read RPC                      | Member CRUD uses legacy owner/admin helper; general select/read RPC uses membership/creator helper. RPC returns Member status; it does not select only active travellers. Link status is not a participation filter                                                                                                                                                                                 |
| Backend capability / admission             | `capabilities` requires status=linked, owner/group_member controls financial capability; `canReadTrip`, `canWriteTrip`, `canFinalizeSettlement`; receipt read/link admission; Settlement actor/coverage; My Ledger linked lookup and recheck (E3)                                                                                                                                                   |
| Backend complete Person validation/read    | `readLedgerBootstrap` selects every Trip Member and passes role/status to DTO/capabilities; `validateExpenseForJourney` and Review aggregate validation use all Member IDs, without link/travel filter                                                                                                                                                                                              |
| Expense / correction SQL                   | `ledger_create_expense_4a`, `ledger_mutate_expense_4b`, conflict record/resolve and propose/transition/accept correction functions require linked Actor; replacements in Stage 7 adjustments, hosted lineage reconciliation and `ledger_execute_expense_v2` keep linked Actor gates                                                                                                                 |
| Evidence / valuation / currency SQL        | Payment evidence and valuation actions require linked Actor; reference-demand readers select linked Accounts; Journey currency preview/claim/commit and claim-fix guard linked owner; economic-date completion keeps linked Actor gate                                                                                                                                                              |
| Settlement / Adjustment / payment SQL      | Finalization requires linked owner; linked Actor performs repayment. Organizer override depends on debtor/recipient not being linked, not on travel participation. Correction-successor/current-source replacements retain linked owner gates                                                                                                                                                       |
| Review SQL                                 | Eligible-user view, snapshot/user eligibility, projection reads/actions, human finding creation and checkpoints require linked Account/Member with existing source/role rules; latest definitions remain link-related                                                                                                                                                                               |
| Personal Payment SQL                       | Attachment/mutation linked-role authorization, role/owner/counterparty read predicate, and `ledger_grant_linked_personal_payment_history_1a` trigger on user_id/status changes; true account linking can grant historical counterparty read access                                                                                                                                                  |
| Local transport/projection                 | `ledgerMemberSchema` accepts nullable string role/status; `applyJourney` stores them unchanged in ledger_members. General Member query returns them but applies no status filter. TripPerson repository deliberately exposes neither (E4/E5)                                                                                                                                                        |
| Local feature/UI                           | Expense maps all raw Members to DraftMember, strips status/role; actor context separately gates operations. Detail resolves payer by ID. No current participation label/picker/status filter; menu/account role labels derive actor role, not travel state                                                                                                                                          |
| Extraction/import/fixtures                 | Stage 9 raw enum accepts linked/unlinked/invite_pending; target enum linked/unlinked; mapping derives link from User assignment only. Fixtures insert linked owner/unlinked people. Extractor copies legacy status. None establishes travel inactivity                                                                                                                                              |

Exact SQL lineage for financial status consumers (all under `supabase/migrations/`):

- `20260912000100_ledger_2_stage_4a_create.sql`,
  `20260912000200_ledger_2_stage_4b_mutations.sql`,
  `20260912000300_ledger_2_stage_4c_conflicts.sql`,
  `20260912000400_ledger_2_stage_5_1_financial_evidence.sql`.
- `20260912000700_ledger_2_stage_7_1_settlements.sql`,
  `20260912000900_ledger_2_stage_7_2a_payments.sql`,
  `20260913000100_ledger_2_stage_7_2b_adjustments.sql`,
  `20260913000200_hosted_dev_lineage_reconciliation.sql`,
  `20260913000300_ledger_2_stage_8_review_actions.sql`.
- `20260913000500_ledger_stage_9_import.sql`,
  `20260914000100_ledger_ui_polish_fixture.sql`,
  `20260917000100_review_v2_personal_decisions.sql`,
  `20260917000500_ledger_reference_valuation_guard.sql`,
  `20260917000600_ledger_journey_currency.sql`,
  `20260917000700_ledger_currency_preview_claim_fix.sql`,
  `20260918000300_ledger_settlement_fx_preflight.sql`.
- `20260922000100_settlement_2_phase_1a_personal_payments.sql`,
  `20260923000100_settlement_2_phase_3a_human_findings.sql`,
  `20260923000300_settlement_2_phase_3b_personal_review_checkpoints.sql`,
  `20260923000400_settlement_2_phase_4a_correction_successors.sql`,
  `20260923000500_settlement_2_phase_4a_preserve_review_observation.sql`,
  `20260924000100_settlement_review_three_state.sql`,
  `20260925000100_ledger_economic_date_completion.sql`,
  `20260925000300_settlement_adjustment_current_source.sql`,
  `20260926000100_my_ledger_lightweight_snapshot.sql`,
  `20260929000100_expense_consistency_v2.sql`.

### B.3 Role is also not participation

Owner drives current Organizer capability, finalization/currency and overrides.
Group member supports collaborator financial operations; guest is not normally
given those capabilities. Legacy `trip_members` owner/admin/member and creator
fallback do not map one-to-one to these roles (E1–E3; A0). Local Expense/attachment/
Review/Settlement guards depend on separate actor-role/context fields.

Changing owner to guest to encode inactivity would demote an Organizer. Changing
guest to group_member to encode activity could grant capabilities. An active
unlinked Person needs no role change or Account. PROPOSED participation mutations
touch neither role nor status, so existing authority paths remain independent.
The link-triggered private-history grant must not fire from participation updates.

### B.4 Tests and schema history

Repository evidence includes `supabase/tests/review_v2_personal.test.sql`
(unlinked status removes Review admission),
`settlement_2_phase_1a_personal_payments.test.sql` (historical payment grants survive
linked admission loss), `ledger7_2a_payments.test.sql` (linked-owner repayment
fixtures), currency/correction/checkpoint/import tests and strict Stage 9 TS
parsers. Existing A1-I1 TripPerson tests cover unlinked reads/duplicate names/
Account scope; local bootstrap tests preserve role/status hydration.

Baseline `journey_members_touch_updated_at` updates time, not lifecycle revision.
Local migration 5 introduced nullable role/status projection; subsequent actor
account isolation did not add participation. CURRENT no dedicated Member
lifecycle revision, command, audit or incremental hydration exists. Test sources
were inspected, not rerun as proof of a feature that has not been implemented.

## C. Current Member consumer matrix

Classification applies to INACTIVE Persons in a future lifecycle-aware release:
**A** visible regardless of participation, subject to existing privacy/access;
**B** hidden from default new choice but explicitly discoverable/selectable for
an appropriate financial/history context; **C** excluded from ordinary new
activity selection, with reactivation required for that normal path;
**D** mandatory resolution when a stored/draft/history reference exists.
These are selection semantics, not authorization. Combined rows have separate
reference-read and new-choice duties; there is no universal active filter.

| Current consumer / exact seam                                                 | CURRENT listing/selection                                                         | Proposed classification and boundary                                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TripPerson repository `listTripPersons`                                       | All Members in hydrated active Account+Trip context; no role/status filter        | A/D: retain complete canonical list, expose state later; a separate explicit default-candidate read may select active, never silently change list meaning                              |
| LedgerRead `listMembers`                                                      | All Journey Members, household join, ordered name                                 | A/D: keep existing Ledger reads complete; no global WHERE active                                                                                                                       |
| Expense Entry payer chips                                                     | All `context.members`; existing payer or actor seeds draft                        | B for new financial choices; D for existing/draft payer. Inactive actor must not be silently seeded as a new future participant; explicit financial choice is still allowed            |
| Expense Entry participant chips/splits                                        | All Members; selected IDs drive allocation, existing Expense IDs restored         | B for new choices; D for retained selected IDs/snapshots. Hide from new default, not from an edited Expense's selections; never drop/reallocate when lifecycle refreshes               |
| Expense Detail / presentation                                                 | Payer name by Member ID, participant snapshots                                    | D: show every referenced Person, including inactive; fallback display is not identity reconstruction                                                                                   |
| Expense draft allocation                                                      | Member IDs/household/share units provided by explicit selection                   | D for retained draft IDs; do not filter input arrays beneath split calculation or overwrite a draft on Person refresh                                                                  |
| Household `listHouseholds` / household Members                                | All stored Member associations/share units                                        | A/D: retain households and references; inactivity alone cannot alter household composition or financial shares. No current household-management UI was found                           |
| Reporting Journey lists/counts/member summaries                               | Complete member JSON/count/name joins                                             | A/D: total historical membership remains complete; any future active-traveller count must be separate and labeled                                                                      |
| Reporting `listFilterOptions`, Search paid/shared filters                     | All scoped Member labels                                                          | A/D: inactive historical payer/participant remains filterable/searchable                                                                                                               |
| Analysis/dashboard/Stage6 member breakdowns                                   | Report options / dataset Member labels                                            | A/D: include inactive money/history; no activity predicate in aggregates                                                                                                               |
| Conflict/correction resolution names                                          | Complete member label map plus actor-role gates                                   | D: references/proposed corrections must remain addressable; permissions unchanged                                                                                                      |
| Estimated Settlement loader                                                   | Passes all option Member IDs into calculation and maps labels                     | A/D: do not feed active-only candidates into Settlement; outstanding balances/transfers still apply                                                                                    |
| Server finalization source, finalized statement / Adjustment                  | All source Member IDs/display snapshots; persisted inputs/endpoints               | D: no lifecycle flag/revision in financial source digest, immutable snapshot or calculation. Do not mark statements/Review checkpoints financially stale merely for a lifecycle change |
| SettlementReadiness spending/share/payment tabs                               | Member labels, Actor first, endpoint names and Review coverage                    | A/D: preserve debtor/creditor and existing linked reviewer eligibility; inactive is not unlinked                                                                                       |
| Repayment / PersonalPaymentSection                                            | Existing transfer pair IDs; paid/received action derives from Actor matching pair | A/D: repayment to/from inactive Person allowed through current authority checks; inactivity neither grants nor blocks Actor/override authority                                         |
| Personal Payment repository `requireCounterparty` / history                   | Same Journey Member existence; Account-private projections                        | A/D: retain counterparties and grants. Do not require active or delete records; no blanket public lookup                                                                               |
| Review findings/ACK/decisions/human finding/checkpoints                       | Member source/target and linked Account eligibility, not travel selection         | A/D: preserve targets, personal decisions, coverage and history. Inactive linked Organizer/involved user retains current eligibility                                                   |
| Actor context, menu/account role labels, currency/finality/receipt capability | Scoped linked-role/provenance paths                                               | A: no lifecycle filter or role rewrite; these consumers are authority, not traveller pickers                                                                                           |
| `useLedgerStage3` acceptance/dev hooks                                        | First cached Members seed synthetic Expense; Stage4C/51 choose owner fixture      | B for any future synthetic new selection; D for existing fixture verification. Dev-only fixtures/count checks are not product policy                                                   |
| Current itinerary repository/type                                             | Title/date create/read; no Mobile Member participant field/picker                 | No current selector. Future new activity candidates C; historical `journey_member_id` resolution D                                                                                     |
| Retained itinerary/reservation participant tables / future Booking            | Nullable User and Member FKs, no new Mobile lifecycle integration                 | D for current records; C for normal future new activities. No retained-table migration or deletion here                                                                                |
| Stage9/Dev scripts and SQL fixtures                                           | Member insertion/counts and stable imported relationships                         | A/D for audits/history; future inserts default ACTIVE. They must not infer or reset state on unrelated updates                                                                         |

B for a new Expense acknowledges that financial entry may record past reality:
explicit inactive selection must not imply reactivation or app authority. This is
a PROPOSED policy for review, not a new mandatory picker UI or date inference.
Future Trip activity pickers normally use active candidates; an inactive/former
section can be designed later if needed. No copy, navigation or UI is designed here.

## D. Canonical participation semantics

APPROVED ACTIVE means normally available for **new/future participation** selection.
INACTIVE means normally omitted from that default; the same Person remains
historically addressable and may be explicitly reactivated. Neither is an Account,
link, invite, access, Organizer, finance inclusion, deletion or Trip date state.

An inactive Person can owe/receive money, have an unpaid balance, receive repayment,
appear in finalized Settlement, retain linked Account/access and remain Organizer.
E9 validates financial Member existence/Trip scope rather than travel activity;
repayment endpoint authority depends on linked Actor and current domain policy.
E3/E8/E9 show why changing participation must leave those consumers untouched.
This proves the preservation seam; it does not claim CURRENT code already knows
inactive as a persisted value.

Deactivation/reactivation MUST preserve ID, User link, role/status, shares/splits,
snapshots, balances, transfer/payment/history, Review decisions/audit and existing
booking/itinerary references. Do not fire unlink/removal/invite-revocation routines.
Financial source/currency/revision/finality must not be modified or recalculated.
Reactivation returns the same Person to normal new selection; it does not restore
access that was independently revoked or create another Member.

## E. Persistence options comparison

| Dimension            | A: reuse status                                          | B: independent Member field                                                            | C: separate lifecycle table                                                     | D: derive, no storage                                  |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Semantic correctness | Cannot represent linked+inactive independently           | Direct independent fact, same Person                                                   | Possible if keyed by original Person; separate access table would conflate axes | Existing relationships do not state current intent     |
| Link/status conflict | Breaks linked predicates/claim candidates                | None if status/role untouched                                                          | None if lifecycle-only; more joins                                              | Deriving from link/access is incorrect                 |
| Ledger compatibility | Authority/private/repayment meaning changes              | Financial rows/calculations unchanged                                                  | Mapping/join/absent-row behavior needed                                         | History presence forces wrong activity result          |
| Old clients          | Enum/permission break                                    | Ignore additive field; preservation guard needed                                       | Ignore new table; lifecycle writes isolated                                     | Different clients derive different answers             |
| SQLite impact        | Even reuse requires new meaning/read changes             | Add field and ordering metadata to current projection                                  | New table/hydration/joins, or mirror in both                                    | Repeated relationship scans; no reliable cached intent |
| Bootstrap/API        | Status wire changes unsafe                               | Add optional versioned lifecycle data to Member DTO                                    | New projection payload/adapter                                                  | Need complete relationships, still no intent           |
| Sync/feed            | Current Member changes absent; status alone does not fix | Scoped version-aware bootstrap proposed in J                                           | New projection delivery/invalidation required                                   | Relationship changes drive unstable guesses            |
| Offline              | Wrong authority after stale status                       | Cached selection fact, explicit convergence                                            | Another cache reconciliation path                                               | Partial caches misclassify people                      |
| Migration/backfill   | Check changes and unsafe reinterpretation                | Additive server/local fields, all ACTIVE                                               | New rows/FKs/backfill/defaults and local schema                                 | No field migration, but semantics unprovable           |
| Index/query cost     | Existing Trip index, semantic harm                       | Existing Trip index sufficient for normal small lists; no Boolean-only index justified | Extra joins and uniqueness/index costs                                          | Multiple business-table scans                          |
| Booking/Itinerary    | Inherits account/link ambiguity                          | Same Person key and state through canonical repository                                 | Same key possible, duplicate-source risk                                        | Old activities never prove current travel intent       |
| Reversibility        | Hard to repair confused link/authority                   | Disable feature/read adaptation; retain known state/revision                           | Projection/table cutover and retained evidence                                  | No authoritative decisions to recover                  |
| Complexity           | Small-looking diff, large hidden behavior change         | Smallest correct persisted model                                                       | Unnecessary storage/hydration boundary now                                      | Low storage, high ambiguity and product debt           |

Recommend B. C is not justified by this two-state attribute: a lifecycle-only row
is not a new Person registry but still requires missing-row rules, joins and sync.
An access/lifecycle table is specifically rejected because participation is not
access. D is insufficient: both a currently active and inactive person can have
identical historical Expenses, access/link/role and itinerary rows. A name/date/
relationship heuristic cannot distinguish their approved intent.

## F. Boolean vs enum decision

Two states are required; more are not. Prefer Boolean persistence with a clear
participation-specific name reviewed in the schema slice, not generic `is_active`
that might be mistaken for an Account/access flag. No exact SQL name is selected
from the examples in the request.

| Choice                                   | Benefit                                                                 | Cost / decision                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Boolean                                  | Exactly two states; straightforward server/local mapping and predicates | Name must express selection semantics. Recommended                                                         |
| Constrained text / enum ACTIVE, INACTIVE | Readable state values, explicit wire union                              | Valid but no extra capability; wider enum/extensions are not needed                                        |
| Multi-state enum                         | None proven in this task                                                | Rejected: invited/left/removed/archived/cancelled belong to other concepts or have no approved requirement |

Lifecycle revision/receipt/audit metadata is not another business state. Missing
wire data means an unavailable observation/version, not a third participation
state or an invitation/access state. SQLite Boolean storage must be validated as
two-valued when authoritative; exact physical representation remains a schema
review item. Domain can expose a Boolean or two-value semantic mapping after
projection support; avoid parallel writable representations.

## G. Backfill contract

PROPOSED deterministic server backfill/default: **all existing Persons ACTIVE**;
new Persons also default ACTIVE unless a separately authorized explicit lifecycle
intent creates an inactive state. Existing unlinked/invite_pending/guest Persons
remain active candidates under the new axis. No migration touches their IDs or
link/access fields. Initial lifecycle revision has one defined baseline value;
later real transitions monotonically advance it.

No repository field supplies deterministic stopped-travelling evidence. Do not
infer from `user_id` null, email/name equality, link status, guest role, old Trip
dates, no Expenses, no access or removed-user markers. A marker describes an
Account admission event; it cannot identify a surviving Person's participation
intent. A previously physically deleted Member cannot be reconstructed/backfilled
as an inactive Person; recovery of deleted identity is outside this phase.

Local upgrade preserves the existing cache/Account ownership and supplies the
legacy ACTIVE baseline only for previously unobserved lifecycle data. Once a
server lifecycle revision is observed, missing fields from an old server/client
must never reset it to ACTIVE or to baseline revision. A missing field in an
existing Member refresh means preserve the known state; it is not a command.
For a newly cached legacy Member, missing lifecycle data must be labeled legacy/
unobserved compatibility rather than claimed as verified current ACTIVE. Default
legacy selection may remain available until a supported snapshot is received;
this is the same stale-cache limitation in M.G, not a server mutation.

No remote row inspection is required or performed. Backfill is a conservative
semantic rule, not a claim that every real traveller is currently travelling.

## H. Server / local projection options

Minimum future flow:

```text
journey_members (same UUID + independent participation fact/revision)
  → existing authorized bootstrap, additive Member DTO fields
  → one local Member projection, compatible revision-preserving hydration
  → account-scoped TripPerson repository, complete Person reads
  → explicitly chosen default new-participation candidates
```

The backend Member select/map and DTO schema are clear extension points (E3/E4).
Do not expand capabilities or interpret the field in Actor/financial authorization.
Old clients' Zod Member object accepts known role/status fields and ignores an
additive unknown field; existing strings/UUIDs remain unchanged. New clients must
handle missing legacy fields explicitly, not apply a destructive default to each
bootstrap upsert.

| Local option                           | Advantages                                                                                                    | Costs / risks                                                                                                                              | Recommendation                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Extend ledger_members projection       | Same source UUID; one hydration path; existing offline cache and TripPerson boundary; no new Person authority | Physical name remains Ledger-oriented; full Ledger bootstrap can be expensive; must keep lifecycle out of financial filtering              | Use now, with lifecycle semantics owned by Trip domain/repository     |
| Neutral Trip infrastructure projection | Future modules independent of Ledger schema naming; could later support independent Trip bootstrap            | New SQLite migration/table, Account-scoped hydration and cleanup, possible duplicate Member mirrors, authority/drift and transition burden | Defer until an actual independent Trip read/sync boundary is approved |

A neutral projection is permissible later only as a projection of the same
`journey_members.id`, never a new ID namespace, mapping registry or second source
of identity. If introduced, one hydration owner must supply it and any Ledger
compatibility adapter; do not let two feature stacks author their own Persons.

TripPerson should **not expose a pretend state immediately**: no change occurs
in preflight. A later projection/read slice exposes the state when persistence,
wire support and absence/version behavior are in place. Expand/adapt the existing
Member transport narrowly; keep legacy role/status outside the canonical Person
permission surface. No mandatory linkedUserId/avatar projection is added for
completeness. Current complete `listTripPersons` behavior remains complete.

## I. Ledger coupling decision

**Continue through `ledger_members` for the next narrowly approved lifecycle
slice.** Physical projection reuse does not assign participation authority to
Ledger. The server Person remains the only identity source; the Trip domain owns
the meaning and the TripPerson repository hides storage from future modules.

A neutral table now would duplicate the same UUID/state or require migrating
Ledger consumers without a new product read path. It supplies no independent
offline hydration because current bootstrap is Ledger-scoped. Account isolation
still depends on authorized Account/Journey context, not the table's name.

Reconsider when Booking/Itinerary/Trip needs an independent bootstrap/change
boundary, when measured full-bootstrap cost is unacceptable, or when Member
projection ownership blocks an approved slice. Then compare a single neutral
projection plus compatibility adapter against duplicate mirrors. None of those
conditions is established by this phase. No table rename, retirement, mass Ledger
type migration or architectural work solely for naming purity is recommended.

## J. Sync / change propagation requirements

### J.1 CURRENT gap

1. **Member lifecycle is not in incremental pull.** Current feed triggers cover
   Expense/Household/correction/Settlement/payment and later domain additions;
   no Member lifecycle trigger/event exists. The latest feed check has no Person
   type. Public `ledgerChangesResponseSchema` and local `applyChanges` have no
   Member aggregate/handler.
2. **A participation-only change would not currently reach another cached device
   through normal incremental pull.** Bootstrap reads Members, but normal refresh
   with an existing cursor pulls deltas and does not refresh Members unless an
   explicit revalidation/INVALID_CURSOR occurs.
3. **A new public change type is not mandatory.** A typed Member delta would require
   coordinated feed, backend map, Zod union and local handler; shipping it to an old
   client would fail parsing. That is more machinery than a bootstrap adapter now.
4. **Manual bootstrap alone is insufficient.** An automatic, detectable lifecycle
   invalidation and coherent snapshot/cursor handoff are required.

There is a usable seam: shared Journey Currency changes trigger scoped
`INVALID_CURSOR` before ordinary delta delivery; `ledgerReportingCoordinator`
then calls bootstrap and transactionally hydrates the specific Journey. Existing
bootstrap reads sequence/settings before and after its aggregate, retries on
change, and account-generation checks protect local application (E3/E4/E10).
`ledgerReportingCoordinator.test.ts` exercises controlled bootstrap; backend
`ledgerCursor.test.ts` establishes cursor scope/version checks. These sources
identify the extension path; they do not prove a lifecycle implementation exists.

### J.2 Recommended reliable extension

PROPOSED **lifecycle-version-bound shared cursor + scoped bootstrap recovery**.
Keep the public incremental entity union unchanged for this first lifecycle slice.
Bind an opaque shared Journey cursor to a stable Person lifecycle snapshot
fingerprint as well as its existing Account/Trip/financial-sequence scope. A
fingerprint can be deterministically derived from the Trip's sorted original
Person IDs and monotonic lifecycle revisions/state; it is projection freshness
metadata, not financial evidence, authority or a Person identity key.

- Before shared pull advances any cursor, compare that lifecycle fingerprint to
  current committed Person state. A mismatch/missing required version invokes the
  existing scoped `INVALID_CURSOR` recovery, not an unknown Member event.
- Bootstrap must associate the exact returned Person state with its fingerprint:
  read lifecycle snapshot/version before and after aggregation and retry/fail
  without advancing cursor on mismatch, alongside current consistency checks.
- Preserve the original fingerprint throughout financial pagination. A lifecycle
  commit after a successful check/response is detected by the next pull even if
  financial sequence advanced; do not stamp a newer fingerprint without hydrating
  its Person state. ACTIVE→INACTIVE→ACTIVE is detectable through revision change.
- This does not rely on a raw timestamp or an event sequence allocated before
  transaction commit. A marker-only `sequence > cursor` adaptation would need
  proof against a late-committing marker being overtaken by another event; the
  lifecycle snapshot check directly detects committed state independently.
- No separate Trip-wide identity registry or counter is required merely to compute
  this fingerprint. The Trip index supports the small scoped Member read. The
  additional O(Person-count) check and rare full-bootstrap cost must be measured
  in the future slice; do not assert an unmeasured maximum Trip size.

Cursor bytes are opaque to current Mobile transport/Zod storage. A future backend
shared-cursor adapter can accept old scoped v1 cursors via one controlled bootstrap
and return a lifecycle-bound token without changing financial calculations. Exact
encoding/version is a review item, not assigned here. Private Personal Payment
cursors use their own Account-scoped local store but share backend encode/decode
helpers: isolate the shared-cursor extension and preserve private cursor behavior.
Do not bump a global cursor version blindly, expose private data in a Person
fingerprint, bypass scope checks, or reinterpret a private cursor as shared access.

A server-only feed invalidation event patterned after Journey Currency remains an
alternative if its commit/continuation safety is proven; a typed Person delta can
be evaluated later if bootstrap cost justifies it. Neither is automatically part
of the first proposal. Repeated full bootstrap on every ordinary sync would work
but unnecessarily reloads financial/private aggregates; it is not recommended.

### J.3 Offline and reconciliation

An offline device keeps its last observed participation selection. Another
device's deactivation is not instant offline revocation; it does not invalidate
local session/access. On the next successful authorized refresh, lifecycle-bound
cursor recovery fetches a coherent Person snapshot and updates the one local
projection. Reactivation converges the same way, under the same UUID.

Apply only supported/newer authoritative lifecycle revisions. Omitted fields,
stale bootstrap, old device metadata updates, late response and old idempotent
receipt cannot restore an earlier state. Local application is transactional,
Account/Trip-scoped, and cancelled across generation/Account changes. Complete
Person reads remain available; default candidate lists can invalidate/re-render
after state refresh without rewriting historical/draft references or money.

Participation is a default selection policy, not financial Member validity.
Previously selected offline/draft/financial IDs remain valid even if later inactive;
do not reject repayment or ordinary historical Expense attribution solely on this
flag. Future new Booking/Itinerary mutations may require explicit reactivation/
candidate confirmation in their own approved contract; no such server validation
or feature is implemented here.

## K. Old-client compatibility

| Older behavior                                                | Safe contract for future lifecycle release                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ignores lifecycle field and shows all people in new pickers   | Tolerated UX limitation; Person/history valid. Old client cannot undo server lifecycle. New default selection comes with lifecycle-aware release                            |
| Reads/edits historical Expense with inactive Member           | Preserve ordinary domain authorization and references; no migration/filter-induced deletion or reallocation                                                                 |
| Claims, accepts invite, updates notes/profile/Member metadata | Existing field-specific writes preserve participation/revision; linking never implicitly reactivates an existing Person                                                     |
| Inserts genuinely new Member without lifecycle field          | Server default ACTIVE; no guessed historical Person or reused ID                                                                                                            |
| Sends unrelated full-row update/upsert                        | Missing lifecycle fields mean preserve; stale explicit fields cannot bypass revision/command guard. An upsert default must not reactivate existing rows                     |
| Replays a prior deactivate/reactivate receipt                 | Return historical receipt/current canonical state separately; never reapply an old transition after a newer opposite transition                                             |
| Uses old shared cursor                                        | Scoped INVALID_CURSOR→bootstrap with compatible additive payload; no new unsupported public entity enum                                                                     |
| Uses private payment cursor                                   | Preserve its current separate store/protocol/domain admission; shared extension cannot force endless private refresh or leak data                                           |
| New client receives old server payload after rollback         | Retain known state/revision, treat absence as unsupported observation; disable lifecycle writes until compatible server returns. No per-refresh true/default-zero overwrite |

Server lifecycle fields must be protected from arbitrary legacy table writes while
preserving currently authorized writes to existing columns/RPCs. Exact column/
command protection requires a narrow schema/security review; it must not rewrite
legacy membership, creator bypass or Organizer/access semantics. Service/import/
fixture upserts need the same preserve-on-conflict behavior. Do not depend solely
on TypeScript hiding a field while RLS allows broad Member updates.

Lifecycle-state storage, revision/receipts and omission rules must remain intact
on rollback. Disable lifecycle features or roll back an adapter; do not drop data,
return to overloaded status or reset inactive Persons. No claim of perfect old
picker UX or universal historic-client support is made; supported build/cursor
compatibility must be proven before enabling mutation.

## L. Future mutation contracts

PROPOSED narrow domain actions only; no universal Action Layer and no code/SQL.

| Property                 | deactivateTripPerson                                                                                                                                   | reactivateTripPerson                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Actor                    | Authenticated current linked-owner Organizer for the Trip                                                                                              | Same current Organizer boundary                                                               |
| Target                   | Exact `(Trip ID, existing Member ID)`                                                                                                                  | Same existing ID                                                                              |
| Preconditions            | Target exists in Trip; current actor authorization; observed lifecycle revision; valid idempotency intent                                              | Same; no name/email/User lookup substitutes for target                                        |
| Result                   | Participation INACTIVE only                                                                                                                            | Participation ACTIVE only                                                                     |
| No side effects          | Keep user_id/status/role/access/history/financial state                                                                                                | Same; no grant/rejoin/claim/new Member                                                        |
| Idempotency              | Same key+same intent returns original outcome; changed payload/key intent conflicts; no replay state mutation                                          | Same, including replay after a later deactivation                                             |
| Concurrency              | Serialize target transition; exact observed revision/CAS; stale opposing intent returns conflict/current state                                         | Same; no silent LWW or toggling command                                                       |
| Already in desired state | Authorized explicit set may return no-op if observed revision matches; no false revision bump/state-change event                                       | Same; stale revision does not become authorized merely because desired state happens to match |
| Audit                    | Actor Account/contextual Member, exact target, prior/new state and lifecycle revision, operation/outcome/time; preserve meaningful transition evidence | Same                                                                                          |
| Offline expectation      | First mutation slice is server-confirmed; offline command cannot manufacture canonical success. Cached reads remain usable                             | Same                                                                                          |

The Actor's own participation need not be ACTIVE: an inactive linked Organizer
may deactivate/reactivate others and retain financial responsibilities. Use the
current linked-owner predicate without adding lifecycle to it. Legacy admin/
creator-only membership is not silently promoted to financial Organizer; exact
new-action admission and legacy-column guards remain review items before code.

Use an explicit desired-state operation, not toggle. State and monotonically
increasing lifecycle revision, durable idempotent outcome and transition audit
must commit atomically. Existing `ledger_idempotency_keys` supplies a scoped
command/hash/response pattern; do not assume its financial store or Expense
revision-evidence tables are suitable unchanged for Person commands. Reuse the
pattern narrowly, and review the smallest receipt/audit persistence needed.

Return canonical state separately from an old receipt. A no-op/replay cannot
clear later evidence. Lifecycle-only revision must not increment Expense,
Settlement, valuation/settings revision or mutate financial digests. `updated_at`
alone is inadequate as lifecycle CAS: notes/link writes also touch it and state
can change twice back to the same Boolean.

Durable offline lifecycle writes are deferred: they would require Account-owned
queue/dependency/CAS reconciliation, conflict handling and cached optimistic state
distinct from confirmed state. The minimal server-confirmed pair of commands is
viable without inventing that subsystem. No leaveTrip, revokeTripAccess, delete,
unlink or ownership action is folded into either command.

## M. Golden scenario walkthroughs

Results below are APPROVED semantics under the PROPOSED persistence/delivery
contract, not runtime-test claims.

| Scenario                                           | Deterministic result and edge boundary                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Tina stops travelling, owes money, has history | Set T's independent flag false at new lifecycle revision. Same T, all Expense/itinerary references and unpaid balance remain. New normal candidates omit T; repayment/current financial authority still works. No removal/settlement recompute                                                |
| B — Tina rejoins three months later                | Set T true with current revision. Same T and history; no new Member. An old deactivate replay cannot undo this transition                                                                                                                                                                     |
| C — Leon inactive traveller + Organizer            | Flag false only; linked/owner/User and access unchanged. Leon remains current Organizer, may finalize/pay/act under existing domain checks; inactive is not an override reason for unlinked-person repayment                                                                                  |
| D — Caroline active, unlinked                      | True flag with no Account/email/phone; appears in normal participant candidates. No auth/permission created                                                                                                                                                                                   |
| E — Bob inactive, unlinked                         | False flag; complete reads resolve B and historical relationships. No Account/access action or deletion. Explicit reactivation uses B                                                                                                                                                         |
| F — Inactive Person in finalized Settlement        | Stored Member endpoints/snapshots/inputs/digests and immutable financial/Review evidence stay unchanged. Statement and repayment resolve the same UUID; lifecycle is not added to final evidence                                                                                              |
| G — A deactivates; B offline caches active         | B remains stale offline and can retain an existing draft. Next authorized refresh compares lifecycle snapshot version, triggers scoped bootstrap, applies newer flag/revision and updates default choices. Later reactivation repeats this flow. No instant offline access revocation promise |
| H — Old client ignores new field                   | Can still show inactive Persons; its old-field writes preserve lifecycle, unsupported lifecycle writes cannot bypass guarded CAS. Opaque shared cursor recovers by bootstrap; missing fields/new-state receipts do not reset server/local known state                                         |
| I — Two Davids: D1 active, D2 inactive             | Full reads include both exact IDs; normal new candidate filter includes D1 only, historical D2 remains resolvable. No name-based filtering, merging or account inference                                                                                                                      |

## N. Migration necessity

**YES — additive migration recommended for correct A1-I2 implementation.**
Existing status/role/relationships cannot store the orthogonal user intent.
Required conceptual changes, only after human approval:

- Server: independent two-valued participation fact on existing Member, conservative
  default/backfill; lifecycle revision and guarded mutation receipt/audit evidence.
  No new Person ID/root, financial FK remap, role/status widening or trip_members
  change. The existing financial change-feed enum need not gain a public Person
  type for the recommended snapshot-invalidation approach.
- Local: add participation/revision observation support to the existing Member
  projection, safe legacy/omission handling and Account-scoped reconciliation.
  Existing identity/cache/queue data remains. No neutral mirror is required now.
- API: additive bootstrap Member fields and compatible lifecycle observation
  contract; future canonical TripPerson read mapping; shared opaque cursor adapter.
- Sync: lifecycle snapshot comparison/coherent bootstrap and transactionally
  newer projection application; unchanged private cursor/financial scope.
- Compatibility: preserve omitted fields/known revisions; guard lifecycle writes
  from stale/unrelated updates; old clients may retain old selection UX safely.

No SQL, executable migration, migration number, remote backfill or schema change
is included. A future schema plan must prove default/upsert/privilege/receipt
behavior before migration approval; this preflight is not that approval.

## O. Recommended future implementation slices

Each requires separate authorization/review. Schema/read slices must not expose
lifecycle actions before safe propagation is ready; no automatic bundled rollout.

| Slice                             | Narrow deliverable                                                                                                                                                            | Gate / deliberately deferred                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| I2A — Persistence contract/schema | Review exact server Boolean/revision, lifecycle-write protection and minimal receipt/audit storage; existing Member ACTIVE backfill; local additive projection plan/migration | No action exposure/default filtering; no Hosted Dev apply without later gate; verify old-column/RPC preservation                          |
| I2B — Projection and freshness    | Additive Member bootstrap/local hydration/TripPerson state, omission/revision rules, shared lifecycle-bound cursor recovery, coherent snapshot/account-generation handling    | Prove two-device convergence, ABA/late response/pagination, old cursor and private payment compatibility; no mutation feature yet         |
| I2C — Explicit lifecycle commands | Server-confirmed deactivate/reactivate, current Organizer gate, desired-state/CAS/idempotent evidence/audit                                                                   | New actions only; replay/opposing transition and preservation tests; no leave/revoke/link/delete/role changes or offline optimistic queue |
| I2D — Selection integration       | Apply reviewed consumer matrix at specific new-candidate seams; preserve complete historical/reference/draft reads                                                            | Separate product/UI review; foundation/glossary rules when UI is touched; never global financial Member filtering                         |

Later neutral projection, typed delta or offline lifecycle command queue is a
separate proposal justified by an actual consumer or measured limitation, not a
required extra I2 slice. A schema deployment/release gate comes after code and
compatibility validation; it is not inferred from completing I2A on a local branch.

## P. Risks / unknowns and review gates

| Item                                                                      | Status / handling                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence/projection choice adoption                                    | PENDING human review; Option B/Boolean/current one-projection recommendation is complete enough to assess                                                                             |
| Exact schema names, default/observation mapping and receipt/audit storage | PENDING I2A; no migration identifier/type proliferation invented                                                                                                                      |
| Current broad authenticated Member table writes                           | Must guard only new lifecycle fields while proving all existing column/RPC semantics unchanged; exact privilege/command mechanism PENDING I2A. If this needs an access redesign, STOP |
| New action Actor policy and explicit inactive financial selection         | Current linked-owner Organizer recommended; B-class financial exceptions proposed. PENDING review before I2C/I2D, not represented as current behavior                                 |
| Shared lifecycle fingerprint/cursor format and supported builds           | PENDING I2B specification/validation; current source supports opaque cursor and controlled bootstrap, but no implementation exists                                                    |
| Full-bootstrap cost / O(Person-count) freshness check                     | Measurable future cost; no large Trip-size claim. Evaluate delta/neutral transport only if required; no new optimization layer now                                                    |
| Financial fingerprint/Review freshness accidental coupling                | Lifecycle state/revision must not enter existing financial source/digest/statement checks; regression gate before rollout                                                             |
| Stale or absent fields overwrite local INACTIVE                           | Preserve supported/newer observation; omission is not ACTIVE. Test old backend response, reinstall/upgrade and rollback                                                               |
| Legacy invite/claim and fixture upsert reset state                        | Preserve on existing rows; new-row default only. Trigger guards must not accidentally grant private history or change role/link                                                       |
| Person deleted by existing removal routine                                | This lifecycle does not repair legacy deletion; do not route new action through removal. Retained-data recovery/hard-delete redesign stays out of scope                               |
| Unknown real remote data/deployed versions                                | Not inspected and not needed to recommend all-ACTIVE backfill. Deployment compatibility/data proof belongs to later explicit gate                                                     |
| Offline stale selection                                                   | Expected eventual state until network succeeds; preserve local trust, drafts and Account queue ownership; no false revocation promise                                                 |

No current source contradiction requires a new identity, Member-ID migration,
permission redesign or remote access to choose this model. A reliable future
propagation path is identified in J, with implementation proof gates explicitly
pending. Stop if a future slice cannot enforce snapshot/ordering/scope safety or
requires a second Person authority; do not patch that by silently expanding scope.

## Q. Acceptance matrix and local validation

PASS means the preflight question has evidence and a defined recommendation; it
does not mean a migration is approved or future implementation tests have passed.
All persistence/mutation/selection proposals still require the review gates in P.

| #   | Criterion                                | Evidence                                                                   | Result |
| --- | ---------------------------------------- | -------------------------------------------------------------------------- | ------ |
| 1   | Current status semantics mapped          | B.1/B.2/B.4, E1–E5/E9/E12 inventory                                        | PASS   |
| 2   | Relevant role semantics mapped           | B.3; current actor/financial/legacy divergence                             | PASS   |
| 3   | Participation separate from link/access  | B/D; linked inactive Organizer and unlinked active Person                  | PASS   |
| 4   | Existing Member consumers classified     | C complete read/reference/new-choice matrix                                | PASS   |
| 5   | ACTIVE defined                           | D; normal new selection, not authority                                     | PASS   |
| 6   | INACTIVE defined                         | D; omission from default, retained identity/history                        | PASS   |
| 7   | Financial identity preservation          | C/D/E9; no FK/digest/finality remap                                        | PASS   |
| 8   | Reactivation same Member ID              | D/L/M.B                                                                    | PASS   |
| 9   | Reuse-status option evaluated            | B/E Option A rejected with concrete linked predicates                      | PASS   |
| 10  | Independent-field option evaluated       | E/F/N, recommended Option B                                                | PASS   |
| 11  | Separate-table option evaluated          | E/H/I, extra projection cost/identity boundary                             | PASS   |
| 12  | Derived/no-storage option evaluated      | E/G, no deterministic intent evidence                                      | PASS   |
| 13  | Boolean vs enum evaluated                | F, exactly two approved states                                             | PASS   |
| 14  | Backfill defined                         | G, all existing ACTIVE, preserve later observed state                      | PASS   |
| 15  | No identity inference                    | B/G/M.I; no names/emails/link/date/activity heuristic                      | PASS   |
| 16  | Local projection impact                  | H/N, additive single Member projection and observation semantics           | PASS   |
| 17  | Ledger coupling explicitly evaluated     | H/I, interim reuse versus neutral single projection                        | PASS   |
| 18  | Account isolation preserved              | E5/E10/E11, J.3; scoped cache/cursor, generation and no queue reassignment | PASS   |
| 19  | Sync requirements defined                | J.1–J.2, current gap plus lifecycle-bound bootstrap proposal               | PASS   |
| 20  | Offline convergence defined              | J.3/M.G; stale until next authorized refresh                               | PASS   |
| 21  | Old-client behavior evaluated            | K/M.H; omission/upsert/replay/private cursor safety                        | PASS   |
| 22  | deactivate contract defined              | L; exact Person/Actor/CAS/result/audit/offline                             | PASS   |
| 23  | reactivate contract defined              | L; same UUID and ordered state, no regrant/claim                           | PASS   |
| 24  | Migration necessity decided              | N: YES, additive, no SQL/number supplied                                   | PASS   |
| 25  | Future slices narrow                     | O, separate schema/freshness/commands/selection gates                      | PASS   |
| 26  | No application/schema/test/config change | Only this report; final git status/diff validation                         | PASS   |
| 27  | No remote access/mutation                | Local source reads/report only; no remote tools/commands                   | PASS   |

Required preflight matrix: **27 PASS / 0 PENDING / 0 BLOCKED** for answered
questions. Separate persistence decision/implementation approval: **PENDING**;
specific schema/cursor/action/selection review items are in P. Maximum status
remains **A1-I2-P PREFLIGHT COMPLETE — REVIEW PENDING**.

Validation is local source/contract inspection, source-path and section/scenario/
matrix checks, report formatting and whitespace/scope checks. No automated feature
test, database test or device build was required/run solely for this design phase;
prior A1-I1 test results are not presented as lifecycle validation.

```sh
npx prettier --check docs/architecture/TRIP_CANONICAL_A1_I2_PERSISTENCE_PREFLIGHT.md
git diff --check
git diff --no-index --check /dev/null docs/architecture/TRIP_CANONICAL_A1_I2_PERSISTENCE_PREFLIGHT.md
git status --short
```

Only the new report is expected in status. For the untracked-file whitespace check,
exit 1 with no diagnostics means the expected addition, not a whitespace failure.
The current-state/handoff and historical architecture documents are unchanged
because this task explicitly permits only the preflight report. Their A1-I1
"no commit yet" wording is historical; Git proves the accepted commit above.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**. Migration
created/applied: **NO**. Application code changed: **NO**.

**STOP — do not begin A1-I2 implementation.**
