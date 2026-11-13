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

Local tests and prebuild are software evidence. Signed build, actual Apple
token validation, relay email, user cancellation, Guest Adoption, two distinct
Apple Accounts, logout and physical cold restore need their own receipts.

Supabase documents automatic linking for matching verified emails. The public
settings response does not establish its current policy or manual-linking
qualification. This is an unresolved acceptance boundary for the Owner's
explicit-linking rule, including same-email collision tests. Do not claim the
client confirmation alone disables server-side automatic linking.

Sources

- https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://supabase.com/docs/guides/auth/auth-identity-linking
