# Native five-bug correction — isolated candidate

Base: `1238a5c2a1c6b4e2c1a95974d25737068e3d7217`, latest approved P1/Experience integration. Independent workspace `/private/tmp/otr-native-five-bug-fix-20261023`, sole Writer `native_five_bug_fix`. Phase C worktrees, SQL, backend, auth and Native host untouched.

## Delivered / not delivered

| Owner issue                                               | Candidate result                                                                                                                                                                                                                                             | Evidence boundary                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty My Trips main Import button hides invoking screen   | Opens existing transparent `/import-plans` with `TRIPS` origin/generation, same path as Start Trip Import; no Capture tab navigation                                                                                                                         | Controller regression PASS; actual empty-account Native overlay/outside dismissal NOT_RUN                                                                        |
| Keyboard consumes first control tap                       | Added `keyboardShouldPersistTaps="handled"` to 52 missing production ScrollView/FlatList/SectionList containers, including TripScreen ancestors and nested pickers. Existing explicit handling unchanged. Blank unhandled taps retain RN dismissal semantics | AST coverage + existing form tests PASS; keyboard-open first tap/blank Native behavior NOT_RUN                                                                   |
| Preparation thinks multi-destination Trip has no location | Carries existing ordered `destinations` through metadata; same presentation helper as Hero determines missing setup. Does not rewrite list/scalar, or re-show completed setup rows                                                                           | Empty scalar + populated list regression PASS; Native NOT_RUN                                                                                                    |
| P1 participant picker only shows own name                 | **BLOCKED_BY_OWNING_INTERFACE** for local-only named people; intentionally no authority expansion                                                                                                                                                            | Real isolated SQLite reproduces two Trip Persons, one eligible Core option; selecting unadmitted local person is rejected `CROSS_TRIP_PERSON`, zero Item intents |
| Home/Day menus differ / unwanted actions                  | Shared menu removes Edit Trip/Open Day; localized Documents/Photos are truly disabled, grey and accessibility-disabled; Members, All Trips, Settings, Language and Logout retained                                                                           | Shared Home/Day controller and Pressable disabled behavior PASS; Native NOT_RUN                                                                                  |

No unapproved phone install, simulator switch/reload, account switch, database copy/reset or data deletion. Root inspected Device Hub read-only and found a different current QA host; GUI/Metro occupancy is unresolved, so this candidate does not claim simulator acceptance.

## Precise participant owning gap

Create Trip already records additional names through `initializeLocalTripPersons`: `ledger_members` with status `local`, role NULL and participation revision NULL, plus account/Trip-bound `TRIP_PERSON_CREATE` operations in `DEPENDENCY_BLOCKED` with `PERSON_CREATE_HOSTED_UNAVAILABLE`. `TripPersonRepository.listTripPersons` correctly exposes these as `LOCAL_PENDING` names in Members. They are not account members or invitations.

`readLocalManualSnapshotWithinTransaction` can establish the lawful local creator but its current actor person universe contains only the creator. Accepted Core snapshots instead use installed `trip_core_person_bindings`; no existing qualified adoption path turns those retained local Person-create intents into that Core roster. `manualPlanRepository.open` intersects names with this qualified universe, and Core `checkPeople` rejects a selected local-only ID. Removing the filter would expose selections that Save must reject; extending Actor IDs from bare Member rows would create unapproved authority.

Minimum Owning Delta: Core/Trip Person owner supplies a qualified local participation roster/adoption mapping from exact current account/Trip retained Person-create intents, or completes the separately authorized owning Person acceptance/install path. It must retain local identity provenance, current creator scope/generation, immutable queued intent, revocation/conflict behavior, and keep Actor/Account linkage and Hosted rights unchanged. Then Manual P1/P3 readers can consume that roster through existing Core Save; no new membership model, writer, queue or schema is proposed here. Current issue remains open, not fixed by presentation.

## Validation

- 13 focused suites / 165 tests PASS: MyTripsList, TripSetupRows, destination display, GlobalMenu return/model, keyboard policy, ManualPlan real SQLite, LocalTripWorkspace, TripScreen Home widgets, participants field, P1 editor, CaptureComposer, Capture origin.
- Additional AppNavigationMenu suite / 1 test PASS: disabled rows cannot dispatch or close the menu; enabled member action still works. Aggregate **14 suites / 166 tests PASS**.
- TypeScript PASS, UI guard PASS (473 legacy occurrences / 139 strict representative UI files); scoped lint zero errors, one unchanged CaptureContent `no-require-imports` warning; formatting and whitespace checks PASS.
- Expanded untouched `localTripPersonRepository.test.ts` cannot collect in the Node runner because React Native Flow parsing is unsupported. That existing collection limit is not hidden; the actual named-Person reproduction runs through the passing ManualPlan SQLite fixture without Native imports.
- Native/visual/keyboard timing/VoiceOver/Dark/large-type acceptance remains NOT_RUN; tests are not simulator PASS.

## Data Path Checklist

1. Ownership: menu, navigation and keyboard are Transient UI; Preparation is a read-only presentation of existing local destination data. Existing Item participation is Core-owned Cloud-shared data, unchanged here.
2. Local storage: no new field, SQLite migration or data rewrite; current destination list/scalar/Person intents retained.
3. Sync/backend: no DTO/Queue/transport/backend/schema/permission changes. Local-only named Person participation remains owning-blocked.
4. Conflict/offline: existing scope/generation/Save guards retained; no automatic upload, rebase or queued-intent promotion.
5. Evidence: isolated UI/domain/controller checks above; required actual Native L1 still pending. No new L3 needed for presentation-only fixes; no Cloud PASS claimed for participant gap.
6. Remaining Delta: independent Root Review and coordinated Native validation of issues 1/2/3/5; qualified Core/Trip Person roster mapping for issue 4. Current Phase C proceeds independently.
