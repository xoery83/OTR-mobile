# Auth → Native: exact client-only handoff

Source: `676065f878c8bf568eae2f48703dde094986a17f`. Comparison base: accepted main
`4e1bedfc`. Do not merge the long Auth branch or replace Native-owned files.
`HANDOFF_MANIFEST.json` pins the patches/public copy. Both patches applied in a
fresh disposable set of base files; Profile files exactly match the source commit.
No Backend, SQL, migration registry, startup, navigation or Settings file is patched.

## First Golden Slice: Profile

Native owns all final edits to Settings, navigation, startup and SQLite registration.
Apply `PROFILE_SETTINGS_CLIENT.patch` against the matching base or reconcile only
its listed files with current Native. Add only missing public copy from
`CLIENT_UI_KEYS.json`; preserve newer catalogs and existing values. No new dependency.

1. In normal Settings, mount `AuthSettingsSection`. Its `onOpenProfile` callback
   navigates to the normal Profile route; leave it absent/disabled when unavailable.
2. The new normal route renders `AccountPrivateProfilePage` with `onCancel` using
   existing navigation back. It reads the committed Account, initialized DB and
   existing AccountProfileRepository.local. No HTTP or Profile worker is called.
3. The SQLite unique Writer registers `privateAccountProfileMigration` (77), only
   after checking the actual Source76 definition/order. Do not renumber either.
   Verify 75→76→77, repeat startup and any supported late-76 path against actual
   migration runner semantics; preserve representative existing rows/queue hashes.
   No table creation outside the startup-owned migration runner.
4. Startup retains existing `hydrateUiLocale` and adds `hydrateUiAppearance` next to
   that local preference hydration, with existing nonfatal startup error handling.
   Do not make Auth launch wait for network. Preferences remain device-local.
5. Use a current legitimate QA Account and a non-Photo device. No new OTP is needed
   if a valid remembered QA Session exists. Do not copy credentials or containers.

Actual acceptance: normal Settings→Profile→optional Display/Document names/AKA
private draft→Save→visible on-device saved feedback→process restart→same Account
exact Unicode readback. Cancel must preserve the previously saved draft; blank
Display Name is valid. Account B never sees A's private fields/draft; retain stale
callback negatives. Global AKA is draft-only, never an Account connection proof.
Record device/build/source, actual DB migration readback and screenshots. A unit
SQLite reopen or embedded JS build alone is not Native acceptance.

Focused tests: AccountPrivateProfileScreen.test (includes page),
PrivateProfileNameFields.test, privateAccountProfileLocal.test,
defaultAccountProfileRepository.test, privateAccountProfile.test,
AuthSettingsSection.test, uiLocalePreference.test, uiAppearancePreference.test.
Run typecheck/scoped lint/ui:guard after shared-file integration.

## Second Golden Slice: adopted Trip editor

`PERSON_DRAFT_ONLY.patch` brings the existing Sheet's optional `draft` prop, scoped
private draft data source and Native SecureStore adapter. The PersonRepository
change is only its optional fourth `draftStorage` argument and `.drafts` member.
It intentionally excludes the later closed server-parent reader/create additions
from the long Auth branch. Existing ordinary create/queue/worker stays unchanged.

Native's unique owning caller loads `loadTripPersonEditorDraft(context)` with the
opening committed `{accountId,tripId,generation}` and passes its bound result as
`AddTravelerSheet.draft`. Fence async loading/unmount/Trip and Account changes;
a foreign/missing/stale port must not fall back silently to an unscoped editor.
Keep the existing normal `onSave` repository call and receipt/queue semantics.

Entering/editing a private draft does not require or grant server authoring. If an
adopted Trip has no existing qualified parent for save, do not open the closed
Backend reader or pretend queue acceptance. Report that exact caller qualification;
Auth will supply a draft-only submit guard if needed, preserving normal create.

Actual acceptance: existing adopted Trip→Add Traveler→type private name→restart
without submit→same Account/Trip draft restored. Explicit Cancel clears only an
unsubmitted draft. If an already submitted attempt exists, Close preserves its
exact Person/operation IDs and recovery cannot allocate a second traveler. Unknown
or corrupt draft is preserved, never silently deleted. Account switch/Trip switch
must not expose or apply an old draft. No real cloud Person acceptance is implied.

Focused tests: AddTravelerSheet.test, tripPersonEditorDraft.test,
Native tripPersonEditorDraft.test; existing normal Person tests unchanged. Native
adds the precise caller/integration and actual local device readback evidence.

## Closed capabilities / return receipt

- No Hosted private Profile, protected SQL/RLS/GRANT or production changes.
- No formal Invite/Claim activation; synthetic preview stays unmounted unless an
  explicit DEV preview is wanted, and never renders accepted/connected authority.
- AI Usage stays unavailable without its qualified reader; no allowance/price or
  enforcement rule is introduced. No new Meter, Repository or Sync Engine.
- No Photo Backend/Provider/config/main release or AD5 request.

Return one unified code SHA and actual build/device/SQLite cold evidence for each
Golden Slice, preserving earlier UNKNOWN operations and all unrelated changes.
Cloud differences remain in AUTH_CLIENT_INTEGRATION_GAPS.md. Auth reviews only the
new Account/draft boundary in the integrated diff, not the full architecture.
