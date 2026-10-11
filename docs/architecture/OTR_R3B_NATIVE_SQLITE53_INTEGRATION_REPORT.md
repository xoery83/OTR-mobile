# R3-B Native Catalog → SQLite53 integration

Date: 2026-10-11 (Pacific/Auckland). **PASS.** Owner authorized implementation,
isolated DEV/Simulator installation and normal scoped integration without Preflight.
Accepted base: canonical main `8b5c6034d5070d61192842282816dc08d44fc10a`;
[R3-A6 authenticated HTTP acceptance](OTR_R3A6_AUTHENTICATED_CATALOG_HTTP_ACCEPTANCE_REPORT.md)
verified before execution. The older dirty chat checkout was preserved.

## Change

One explicit `createNativePublicationMembershipIntegration` factory composes the
existing native fetch, authenticated Catalog transport, CLOSED membership reader
and owning transactional repository. Capture/read/install retain the original
Account/Trip/generation; cancellation reaches the actual native request. Validated
Catalog rows and sealed complete memberships install inside the existing serialized
SQLite transaction and Account apply gate. Local membership read performs no HTTP
or token acquisition. Zero memberships is valid and never means deletion.

Actual Simulator execution exposed a previously untested factory defect: Metro's
React Native namespace import evaluates a removed PushNotificationIOS getter.
A two-line named Platform projection fixes lazy acquisition while keeping normal
React Native platform selection. Existing module identity, fixed HTTPS origin,
exact-byte intake, encoding/redirect/TLS refusal, bounds, deadlines, cancellation,
release, parsing and semantic validation remain unchanged.

No migration or endpoint change; SQLite1–53 source bytes remain exact. No UI,
startup, scheduler, Composer, provider or business-write activation was added.

## Acceptance

| Check                                     | Evidence / result                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native → authenticated Catalog → SQLite53 | Actual installed iOS/Hermes factory PASS; two live fixed-origin native installs with R3-A6 disposable Actor `3a44420f-ec2b-4d7e-9770-410a5ed5e77e`, Trip `3b109c56-7a56-4af5-8364-12e081133e7d`; each returned zero memberships for the accepted empty Catalog                                                                       |
| Populated Catalog                         | Accepted existing Source/Run/Input/Candidate fixture; actual Expo SQLite sealed membership install, exact replay and local read PASS. Full trusted-native-adapter → authenticated Transport → Reader → SQLite path additionally tested with synthetic native callback bytes                                                          |
| SQLite52→53                               | Actual Expo migration preserves every existing table's prior columns/typed rows and all52 history entries, including synthetic Ledger/actor/session sentinels; no historical migration edit                                                                                                                                          |
| Interrupted installation                  | Actual Expo failure after membership UPDATE rolls back all Catalog rows; subsequent original install/replay succeeds. File-backed host tests additionally verify lost COMMIT acknowledgement/reopen/replay                                                                                                                           |
| Cold restart/offline read                 | New Simulator process, private session file removed, token provider refuses authentication; retained populated membership read PASS without token/native request. No host-wide network disconnection was performed                                                                                                                   |
| Account/Trip fences                       | Actual B cannot disclose A; A→B→A rejects stale generation, fresh A reads retained membership. Live foreign Trip403 preserves installed fixture. Host tests cover scope and lineage rejection                                                                                                                                        |
| Failures                                  | Actual invalid-session401 and foreign Trip403 rejected; host integration covers persistent401 including capped refresh,403,400, malformed Catalog, offline/network/TLS/body-limit failures and cancellation, with exact membership preservation across reopen. Existing token-provider suite covers expired-session refresh behavior |
| Preservation                              | 6,593 reserved Simulator app/data/Keychain/plist file fingerprints unchanged; both original Harness marker files unchanged. All81 original accepted app files restored exactly; new task DB retained separately                                                                                                                      |

The separate accepted Harness destination was
`4246352E-7631-4DD5-9E0D-3F35B3150494`, bundle
`com.xoery.otrmobile.nativeharness`. Only its copied JS bundle/signature changed for
this test; production receiver native source/module bytes matched the accepted
artifact. New DB: `otr-r3b-integration.db`; original marker DB and all reserved
DEV Test/historical environments remained untouched. No production or physical
Device data was opened, installed over or reset. The accepted dormant Harness app
was restored after testing and left terminated; its Simulator remains Booted.

R3-A6's task-owned identity/Trip/password were reused, not reprovisioned. Normal DEV
password login acquired a new bounded session. Only that session was logged out
with local scope (204); private local, Simulator and remote token artifacts were
removed. Backend deployment, Reader credential/custody, SQL gates and business
rows were unchanged by this task. No admin SQL, provisioning, provider or
business-command invocation occurred.

## Validation and retained evidence

- Focused Native/Transport/SQLite53 suites: **4 files /173 tests PASS**.
- Import/Backend Catalog/session-token regression: **3 files /130 tests PASS**.
- Assessment Adapter/observation regression: **2 files /83 tests PASS**.
- Accepted Swift receiver policy/slot +43 fixtures and9 header observations PASS;
  original seven encoding negatives reject, redirects forwarded0, cancel disconnects.
- Typecheck, lint/UI guard, Backend build, touched formatting and whitespace PASS.
  No new dependency; no full-suite claim.

Task-owned nonsecret runtime source, Metro/Hermes bundle, signed test app, sanitized
logs/results and preservation evidence: `/private/tmp/otr-r3b-runtime`.
The first run's successful migration/populated checks and native factory failure
remain in `runtime.log`; corrected online and cold offline results are separate.
The repeat reused retained data rather than resetting it. A missing mock assertion
argument and sandbox-limited Vite/socket invocations were corrected; final checks
passed using isolated config loading and approved local fixture sockets.

## Remaining Beta gates

Composer/C5/C9, provider calls and business-write activation remain **CLOSED**.
This explicit read/install factory has no application startup or scheduler caller.
Populated live protected Catalog publication is not certified by empty DEV rosters;
fixture coverage does not authorize publication. Physical Device/Release memory,
long-running callback/destruction stress and the previously unexecuted independent
hostname-only native TLS negative remain separate gates. Offline read acceptance
uses an unavailable token seam, not physical host network isolation. Actual401
used an invalid token; genuine signed-token expiry behavior is covered by the
accepted session-provider tests rather than waiting for live TTL expiry.

**STOP — R3-B NATIVE/SQLITE53 INTEGRATION COMPLETE.**
