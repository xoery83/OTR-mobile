# CREATE-TRIP-01 — Preparation Setup Reader

Candidate based on reviewed Day `72ec39a`. This is read-only owning data preparation,
not Preparation UI integration or Native acceptance. No Schema, Hosted, Sync mutation,
new Person identity, invitation or financial rule is introduced.

## UI consumption

Use `await (await readTripPreparationSetupRepository()).read(tripId)` from
`src/data/repositories/tripPreparationSetupRepository.ts`. The factory matches the
existing `readTripPreparation` / Home Ledger Repository pattern and uses only an
already initialized local DB. It performs no bootstrap, network refresh or writes.

- `context` binds account, generation and exact Trip. Consumers must retain their
  existing request/account-generation guard before committing returned UI state.
  Load on the same owning refresh as Preparation; no second timer/platform.
- `currency.state === AVAILABLE`: `code` and `scale` are actual Ledger settings,
  not `Trip.baseCurrency`, app display preference or inferred destination currency.
- `permission` reflects existing Ledger Settings owner/read-only rule. It is
  presentation context, not server authorization. `lock === FINALIZED` uses the
  existing permanent historical-settlement lock, including superseded history.
  `NOT_OBSERVED` means no finalized history in this local read; it is not proof
  that online commit is allowed. A failed history read yields `UNKNOWN`.
- Reuse `/expenses/settings?journeyId=<exact tripId>` for the existing online
  preview/digest/confirmation flow. Do not change a currency locally, bypass
  preview, infer access or promise offline currency changes. A newly unaccepted
  Trip may need normal Hosted creation before preview; this Reader does not
  manufacture that capability. Unknown lock must never render “Unlocked”.
- `members.state === AVAILABLE`: `people` are existing nonblank Trip Person
  display names/IDs; `namedCount` counts these actual rows, not entered form slots
  or connected Accounts. An actor must be present in the loaded Person roster.
  This may include a separately required creator owner: it is not a count of
  newly entered Traveler names. Blank display rows are omitted, not deleted.
- `invitations` and `connections` remain `UNKNOWN` because current Person DTO
  does not expose those authorities. Never convert local/unlinked/invite_pending
  cache values into invented invitation/connected counts or red attention badges.
  Missing actor/Trip/roster/settings yields UNKNOWN, never another Journey or zero
  fake members. Independent unavailable sections retain the other real section.
- This adds no Members page or invite action. Experience must use a real owning
  Members destination once available and report unavailable functionality honestly.

The read is a single existing SQLite transaction under the account apply gate;
account ID/generation are checked before and after awaits. Account changes fail
rather than returning a stale scope. Network availability is not a prerequisite.

## Validation / remaining boundary

Targeted tests use current migrations and real in-memory SQLite queries through
existing reporting, settlement and Person repositories. They cover actual JPY/0,
owner/read-only, finalized/superseded lock, unavailable lock/settings/roster/actor,
missing Trip/account isolation, orphaned actor, blank names and stale account or
generation. The DB adapter rejects writes. Existing Home Ledger/Person regressions
run alongside; these tests are component evidence, not Native acceptance.

Travelers name creation remains a separate precise GAP: CreateTripInput and its
strict request have no name list/Person creation intent or Hosted Person receipts.
The existing local creator→Hosted owner mapping cannot publish arbitrary names.
No new schema necessity is claimed; authorized owning delivery must prove stable
IDs, cold persistence, create dependency and canonical roster reconciliation before
counting the seven-slots/three-names scenario as completed.

Experience owns only downstream Widget/form presentation. Coordinator remains sole
TripScreen/navigation integrator. This candidate changes neither file family.
