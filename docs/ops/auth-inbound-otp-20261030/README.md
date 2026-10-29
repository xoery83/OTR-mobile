# Hosted DEV inbound OTP QA

Status: REAL_HOSTED_FIRST_USER_PASS / HOST-ONLY_TOOL_RELEASED / NATIVE_APP_E2E_SEPARATE.

This host-only tool uses the existing approved Supabase DEV OTP/verify/session
repository, a fresh `otr-qa-<uuid>@eldouzileu.resend.app`, and Resend Receiving.
Nothing under scripts/auth is imported into the iOS app. SMTP, Auth policies,
existing users and production remain unchanged. One OTP send per run; uncertain
send/verify outcomes are never automatically retried or replaced by another user.

## Actual permission boundary

Official Resend key modes are full_access and sending_access, not Receiving-only:
https://resend.com/docs/api-reference/api-keys/create-api-key
Receiving lists the team's messages, not an isolated recipient mailbox:
https://resend.com/docs/api-reference/emails/list-received-emails
A prefix or local recipient filter is NOT provider-side permission isolation.
The direct adapter stays closed unless the Owner confirms the entire Resend team
contains only authorized OTR QA resources. A mixed team instead requires a trusted
restricted proxy holding its broad key; direct enumeration is not supported here.
No automatic fallback from a restricted proxy to a broad key is allowed.

Use a separate OTR-QA-Inbound key, never Supabase's SMTP sending key. Recommended
macOS Keychain generic password: label OTR-QA-Inbound, service (Where)
OTR_QA_RESEND_API_KEY, account resend. Create it
through Keychain Access, not a command containing the key. Inject only into the
host tool as OTR_QA_RESEND_API_KEY, or use its explicit --keychain option after
scope approval. No .env file, EXPO_PUBLIC variable, argument, report or chat value.
Scope confirmation: OTR_QA_RESEND_SCOPE=dedicated-qa-team. This records an external
Owner-confirmed resource boundary; it does not transform key permissions.

Required public configuration: EXPO_PUBLIC_OTR_DEV_SUPABASE_URL must equal
https://tuqigdxrvrerfewsxqgm.supabase.co and
EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY must be a publishable/anon client key.
OTR_DEV_OTP_TEST=1 enables this host-only runner. Missing scope/key fails before
any OTP is sent. No API key listing, SMTP reads, role keys or console changes.

## Acceptance and reuse

First use must be --e2e. The receipt must prove actual received eight-digit OTP,
normal verification and trusted /user read, fresh canonical Account, encrypted
host-storage recovery in a separate process, current-session refresh/logout and
bounded normal Backend isolation negatives. Host process recovery is not Native
Keychain/app cold-start evidence. A new Native E2E must perform its own OTP verify
in the app; do not inject a host-created Session/Keychain into a device.

Until a real first-user PASS exists, Native/Auth reuse remains closed. OTP/token
and raw email contents stay memory-only; the temporary test vault holds encrypted
repository storage with its ephemeral key sent only over a private child pipe.
Only sanitized IDs/timestamps/check outcomes may enter the acceptance receipt.


Owner confirmed on 30 October that this entire Resend team contains only OTR QA
resources, with no production/private data. The independent key has not yet been
visible as `OTR-QA-Inbound` / `resend` in a host Keychain metadata query (status44).
No SMTP key was read. No OTP or Receiving API request has been executed yet.

Source checks: direct and independent2 suites27 PASS, including hostile metadata,
stale/foreign recipients, rate limits, encrypted adapter recovery in a new process,
public-key/DEV-only guards, UNKNOWN revoke-at-most-once and unproven identity zero
cleanup. Typecheck/scoped lint PASS. This is not the required real first-user PASS.

Run from this repository with the public DEV configuration supplied by the normal
local configuration channel, then:
`OTR_DEV_OTP_TEST=1 OTR_QA_RESEND_SCOPE=dedicated-qa-team node --import tsx scripts/auth/resend-inbound-otp-e2e.ts --e2e --keychain`
The command contains no key. Keychain absence/denial stops before OTP. Receipt is
FIRST_USER_E2E.json only after real PASS. An uncertain request/verify/revoke retains
a private run journal and lock; do not remove the lock or rerun blindly. Preserve
the exact run for scoped reconciliation. Accounts are never automatically deleted.

After real first-user PASS, lane-facing Node API:
`openReleasedQaReceiver({keychain:true})` -> `checkPermission()` ->
`createMailbox()` -> normal App/Host sends exactly one OTP ->
`waitForOtp(theSameMailboxObject)`. It returns the code only in caller memory.
Never print the code/raw body, and never transfer a Host-created Session into a
device. A Native test must execute its normal App verification and its own cold
restart. The lane-facing entry checks real PASS plus source hashes before reading
a credential; an old receipt cannot silently release changed code.

The finite --e2e/--keychain execution preflight on fixed source f06beaa6 returned
RECEIVING_CREDENTIAL_REQUIRED before any OTP/Receiving call or Account creation.
PREFLIGHT.json records the boundary. Next required action is saving the independent
new Keychain item; existing SMTP credentials remain untouched.

Owner screenshot and exact host metadata lookup resolved the item naming:
label OTR-QA-Inbound, service (Where) OTR_QA_RESEND_API_KEY, account resend.
The tool now queries that exact triple; no generic Keychain search or SMTP fallback.


## Actual first-user acceptance — 30 October 2026

Fixed source8496a994 completed exactly one real OTP request and Receiving delivery
for a fresh generated mailbox. Account756c31dc-74e3-4112-94b6-b15d14d95aaa was
created after request, confirmed and independently read through normal Auth /user.
The existing repository restored the real Session in a separate host process from
encrypted test storage and re-read the same user. New Account Discovery was200
empty; the known foreign synthetic Trip returned404 NOT_VISIBLE. Refresh and
current-session logout passed, then the revoked refresh was rejected. All four
script hashes and receipt fields passed independent read-only review. No key,
OTP, JWT or raw email body was logged/committed. See FIRST_USER_E2E.json.

Historical pending paragraphs/preflight above describe earlier stages only; this
receipt releases the lane-facing host helper. Use a NEW generated mailbox for
Native's fresh-signup prerequisite, not the already registered first-proof user.
Native must verify normally inside the app and prove its own Keychain/cold start.
Guest must retain its provisional verification/adoption boundaries; this tool does
not publish Guest data, activate an Account early or grant Trip membership.

macOS may request item access. For unattended reuse, configure only this QA item
for the intended trusted reader, never all apps or the entire Keychain. Business
and engineering authorization for normal QA use already exists; key rotation,
team-scope changes or locked Keychain may still require local confirmation.
