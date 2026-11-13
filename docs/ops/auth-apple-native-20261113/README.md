# Native Apple sign-in candidate

Owner confirmed `art.xoery.otr`, Team `3K49Z2Q5X7`, registered Explicit App ID
and Primary Sign in with Apple capability on 13 November 2026. The DEV public
Auth settings independently returned Apple enabled after the Owner's update.

## Build selection

`OTR_IOS_VARIANT=production` selects the approved production iOS identity and
Apple plugin. EAS `production` uses this selection. `apple-device-qa` selects
the same signed identity against the approved Hosted DEV endpoints. Supply the
existing public DEV publishable key through the local/EAS build environment.
No Production backend or Production data access is configured here.

Unselected Expo configuration keeps `com.xoery.otrmobile` and its existing Team.
The ignored GuestQA Xcode project remains unchanged. Native generation and
signing run in `/private/tmp/otr-apple-native-preflight-5kr0r60w`, with separate
DerivedData. Do not run production prebuild over an existing QA `ios` directory.
EAS excludes the ignored native directories and generates from the selected config.

The retained Google iOS Client belongs to the old Bundle ID. Both the Google
button and native Adapter reject the new identity until an appropriate Client
is supplied. Existing Google configuration and QA behavior are preserved.

## Authentication and names

For the isolated local DEV build, use the standard ignored Auth-worktree
`.env.local` for the existing public DEV URL/key/transport and
`EXPO_PUBLIC_OTR_GUEST_ADOPTION_ENABLED=true`. Do not change an existing QA
worktree's environment. Shell-only values were insufficient in the observed
Xcode/Metro pipeline. The repaired native build was accepted for installation
only after its actual pre-Hermes JavaScript showed both DEV and Adoption
conditions true in AccountManagementScreen's existing confirmation handoff.
The canonical Metro config is retained. EAS QA configuration contains the
equivalent values, but an EAS cloud build has not been run.

The Guest's new native App container has independent SQLite evidence of the
requested Trip and P1 title. Its Trip `accepted_at` and Item reconciled revision
were null. The QA SQLite snapshot was used only for read-only verification in
a private temporary directory, never to populate another App or implement
Adoption. See `GUEST_LOCAL_SQLITE_READBACK.json`.

Native Apple receives a SHA-256 digest of a fresh cryptographically random nonce.
The existing Supabase ID-token exchange receives the original nonce. Native
tokens and provider diagnostics are never logged. Results remain provisional
until the existing account transition/whole-Guest Adoption checks accept them.
The server's immutable Account ID determines identity, including relay emails.

Apple's optional first-name suggestion is stored separately from Display Name
and Travel Document Name in the existing secure Account Session. A best-effort
authenticated metadata update preserves it as `apple_first_sign_in_name`.
Temporary metadata failures do not block login. Subsequent empty Apple names
do not clear existing metadata. Existing refresh fallback preserves the local
suggestion. Metadata never confers permissions or Person connections.

Settings offers an explicit confirmation before linking. The caller must have
a current Account Session. Official `link_identity` uses that bearer, checks
`/user` before and after linking, and verifies the same Account plus an Apple
identity. Generation and refresh-token checks fence local Session replacement.
Unmounting cancels the attempt, including a retained confirmation callback.
No client-side email/name matching or merge is performed.

## Acceptance limits

New-Team Release build and strict/deep signature verification passed. The
independent App was installed on the paired iPhone 16 Pro after confirming no
existing `art.xoery.otr` installation. First launch succeeded and the exact PID
remained alive. The Owner confirmed successful first Apple login and choosing Hide My Email. An exact-process cold restart changed
PID 74426 to 74439; the Owner confirmed the same Account remained signed in
without another Apple authorization. These are Owner-observed physical results.
See `SIGNED_DEVICE_BUILD.json` and `COLD_SESSION_RESTORE.json`.

The first generic-device build needed a registered device/profile. Automatic
device registration with the exact paired phone resolved that check. Native
compilation then passed, but the temporary linked project's Expo Router entry
had a different Metro root. Pinning `PROJECT_ROOT` and `ENTRY_FILE` only in the
temporary `.xcode.env.local` fixed bundling. The final build reused one Auth
source/dependency tree and passed without altering an existing QA native project.

Local tests, prebuild, signed build and first launch are software/device evidence.
Owner-observed first/repeat login, Hide My Email, cancellation, logout and cold
Session recovery have separate receipts. Nonempty Guest Adoption, two distinct
Apple Accounts and explicit existing-Account linking remain incomplete.

Supabase documents automatic linking for matching verified emails. The public
settings response does not establish its current policy or manual-linking
qualification. This is an unresolved acceptance boundary for the Owner's
explicit-linking rule, including same-email collision tests. Do not claim the
client confirmation alone disables server-side automatic linking.

Sources

- https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://supabase.com/docs/guides/auth/auth-identity-linking

## Current Guest continuation

Root2 independently read the original Attempt's grant/stage/terminal Receipt counts
as zero and the DEV policy disabled (xmin 33417). See
`HOSTED_READ_ONLY_DIAGNOSIS.json`. Existing close helper and runtime config match
current pins. A new finite operational window and independent timer still need
precise approval and actual verification before any positive activation.

AgentDeviceRunner now reads and navigates the isolated iPad App using its original
Runner Team, after Owner trusted the developer certificate. It independently saw
the original Trip and P1 in Day Feed. No login or Adoption was submitted.

Cold re-entry showed the PREPARED attempt was omitted by publication-only recovery.
The minimal correction restores its verified original binding/custody without
sending positive requests on mount. Publish still checks immutable preparation;
Cancel uses the original journal and persists formal server proof before any
refresh-aware credential revocation. Recorded cancellation UNKNOWN can resume
its negative cleanup on cold entry. No synthetic publication marker is created.
Repair `237e4c66` passed 69 focused tests and independent Review. Its signed
iPad update restored the normal Account page to the original target without
new Apple authorization; prepared checkpoint bytes remained identical. See
`PREPARED_COLD_DEVICE_READBACK.json`. No Adoption was resubmitted. The exact
finite Hosted window remains an unactivated candidate under `hosted-window-20261114/`.
