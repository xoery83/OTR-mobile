# ER02 TH-08 — Currency return navigation

## Actual first break

Fixed043 on original AD5: existing local QA Trip shows `NZD · Change`, and the
normal action opens the official Currency page with the correct Trip/NZD. That
page has no visible native Back; an edge-return drag did not leave it. See
`er02-native-20261019/local-currency-settings-settled.ax.txt` and
`currency-no-visible-back.ax.txt`. No currency or business Save was performed.
Normal App Switcher closed only OTR; original icon cold-launched My Trips, original
QA Trip/name/dates/destination retained. No install/reset/Session or Metro change.

The entry crosses from root Trip Home into the nested expenses Stack. With no
index anchor, a settings-only nested stack has no native predecessor. The
installed Expo StackRouter reproduces that no-Back state; Native qualification
of the corrected route remains required.

## Minimal correction

- `app/trip-currency.tsx` re-exports the existing Ledger settings screen.
- Root Stack registers that one route with the canonical Currency title/header.
- Home Preparation and Editor keep the same `journeyId` but target the root
  Currency route. Trip Home remains beneath it as the native Back destination.
- No Ledger settings implementation, currency authority/lock, financial value,
  Repository, Core/Reader/Sync, Schema, original expenses route or catalog change.

Coordinator confirmed the four product files' exclusive Writer in this isolated
tree. Shared integration with LocalP0 remains by exact hunk, not a whole-tree merge.

## Validation / readiness

- Three directed suites / 29 tests PASS. Root/Ledger JSX registration is exercised
  with the actual installed Expo StackRouter: parent native history restores the
  exact original Trip route/key/params, and settings-only nested history cannot
  go Back. Home and Editor entry tests retain Trip identity, no implicit Save and
  reject late account-generation callbacks.
- Typecheck PASS; scoped ESLint, UI guard, Prettier and diff checks PASS.
- Independent scoped Review PASS, no P1/P2. Reviewer independently ran 29 tests.
  Subsequent test-only interop/harness lint corrections did not change product
  behavior and the 29 tests were rerun.
- CODE_READY / NATIVE_PENDING. New source not yet loaded or installed at receipt
  creation. Existing AD5 preview is still043/8083.

Next Native gate: Home→Currency→visible native Back→same Trip; repeat from
unchanged Editor and verify no accidental Save, correct NZD and existing lock
behavior. Do not count router/unit tests as Native UX acceptance.

Recovery: preserve fixed043 tree and original installed App/account/database.
The correction has no migration or data rollback. Preview source updates use
only coordinated8083 with existing public DEV configuration and exact candidate;
failed qualification restores043, not a reset or a different QA account.

## Subsequent Native qualification

Normal Home and unchanged Editor settings entry/native Back passed on original
AD5, unchanged ca7875a, after isolating the Metro transform cache per source tree.
See er02-native-20261019/CURRENCY_NATIVE_BINDING.md for the reproduced stale
router-context cache failure, safe043 rollback, fresh-cache qualification and
explicit remaining limits. Current resident source is ca7875a/8083; no new host
binary was installed. This supersedes NATIVE_PENDING for entry/return only.
