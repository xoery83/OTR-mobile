# Global Menu And Account Switching Acceptance

Date: 2026-09-16
Status: accepted for Slices 5–6; bottom-tab migration deferred

## Scope

- Replaced the Ledger-only duplicated navigator with a contextual global menu on Today,
  Ledger, Capture and Trip.
- Added fixed Current User, Settings, Language and Log out actions.
- Added only implemented Ledger secondary actions: My Ledger, Review and Ledger Settings.
- Added Production-shaped account management over the Account Switching Foundation.
- Added a Dev-only quick selector over approved remembered sessions; no fake role switch.
- Kept SQLite schema v19, Backend contracts, Supabase schema and bottom tabs unchanged.

## Identity And Safety

- Fixture Journey: `Synthetic Baseline Journey`
  (`10000000-0000-4000-8000-000000000001`).
- Approved identities: Synthetic Owner (`00000000-0000-4000-8000-000000000001`) and
  Synthetic Member (`00000000-0000-4000-8000-000000000002`).
- The menu reads the active auth identity and current Journey actor context; it displays
  Organizer/Member and a masked email without exposing UUIDs.
- Add/login and remembered-account switching use the same pause/drain/clear/bootstrap/
  restart boundary as the foundation. Passwords are never saved.
- Dev entries require both Dev transport and Debug Mode. The selector rejects identities
  outside the explicit Synthetic Owner/Member allowlist.

## Verification

- Automated: TypeScript and ESLint pass; 70 test files / 253 tests pass, including the
  architecture boundary, Dev gating, destination model, whitelist and remembered
  Owner → Member → Owner coordinator path.
- Static: focused Prettier and `git diff --check` pass.
- Release: signed iOS Release Simulator build passes at
  `/private/tmp/otr-account-menu-sim/Build/Products/Release-iphonesimulator/OTRMobile.app`.
- Simulator UI: iPhone 17 Pro Max and iPhone 17 Pro show no duplicated primary tabs.
  Ledger shows Synthetic Owner, Organizer, masked email, the three contextual actions,
  global actions, gated Dev actions and destructive Log out with accessible controls.
- Both Simulator Keychains contained only the approved Owner session. The quick selector
  truthfully showed no second remembered account; no credentials or local role were
  fabricated to simulate Member UI. The automated A → B → A test covers the identical
  switch coordinator, and the foundation gate covers cross-user queue isolation.
- Public Dev Backend health: `{"status":"ok","environment":"development"}`.
- Physical iPhone Release build was attempted twice. Xcode reported no configured
  developer account or provisioning profile for `com.xoery.otrmobile`, including with
  automatic provisioning enabled. This is an environment blocker; project signing
  settings were not changed.

## Commits

- `8336e4bc4c85895e18fc498ec8ad465de6237216` — `Add production account switching foundation`.
- The implementation containing this document — `Add contextual account menu and user switching`.

## Deferred

- Option A remains Today / Ledger / Trip / Album.
- Replacing Capture with a global creation action and adding Album require their own
  approved slice.
- Live two-account UI switching requires both approved sessions to be authenticated and
  remembered on the same device; no test password is stored in source or the app bundle.
