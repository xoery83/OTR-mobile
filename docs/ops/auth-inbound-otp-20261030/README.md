# Hosted DEV inbound OTP QA

Status: SOURCE_REVIEW_PASS / REAL_FIRST_USER_PENDING_CREDENTIAL / NOT_RELEASED_FOR_LANE_REUSE.

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
macOS Keychain generic password: service OTR-QA-Inbound, account resend. Create it
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
