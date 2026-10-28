# Auth / Identity Phase 1 — 28 October 2026

Owner continuous delivery authorization applies to this independent lane. Base main
`1c7e7fc8`; worktree `auth-identity-delivery-20261028`, branch
`codex/auth-identity-delivery-20261028`. Native owns Manual/Core/Navigation consumers;
Import released the central catalog editing window after `75de43cc`. No shared
backend deployment, business policy or database permission changed. Forms QA alone
was updated in its coordinated window; AD5 was not operated.

## Current qualification

First source slice `cfae2b18` is integrated/pushed to main. Scoped remote logout
and hosted-error recovery are fixed at `6b4bc3c5`; their real DEV receipt is
`SESSION_DEV_E2E.json`: normal approved Synthetic password login, independent
Account self-read, repository reconstruction, five callers/one refresh, wrong
Account denial, local-scope revoke, independent exact Session absence and all14
baseline Sessions preserved. Revoked refresh returns400/refresh_token_not_found.
This is **HOST_ONLY**, not OTP delivery, native Keychain cold start or Google E2E.
First failed attempt remains accurately reconciled in its separate receipt.

Google Provider is now enabled (public DEV settings HTTP200,28 October04:37UTC).
Owner supplied iOS/Web Client IDs for `com.xoery.otrmobile`. Native public SDK16.1.5,
Expo reversed scheme, server audience, guarded branded control and provisional ID
Token exchange are connected. Apple nonce remains required; native Google follows
the official no-custom-nonce flow. Native acquisition clears only SDK-local state;
Supabase remains the Session authority. No Secret is stored in Native or Git.
A binary lacking the native module stays launchable and reports unavailable.
Cancellation, missing token, SDK/cleanup errors never install a Session.

Google source48d0c53e passed independent Review; unified main453de9c3 retains P3
and is fast-forward integrated/pushed, remote SHA verified. Original primary six
dirty entries remain byte-identical. Joined18 suites153 tests/typecheck PASS;
Google-only independent16 suites128 tests/UIguard/format/default-loader checks PASS.
Expo introspection and release JS export2210 modules PASS.

`GOOGLE_NATIVE_BUILD43.json` pins the actual Debug embedded2371-module binary,
source/JS hash, Google SDK16.1.5/GoogleSignIn9.2.0 and Pod-lock hash. Native compile,
canonical Bundle ID, exact IDs/reversed scheme, linked native module and standard
simulator MachO identity sections PASS; no new Keychain access group. Own Debug
embedding was explicitly enabled; this binary does not require shared Metro.
Forms QA was updated in place without logout/reset. Cold start retained its QA
identity and four Trips. All original row hashes across148 tables are retained;
SQLite integrityOK; only sqlite_stat1 is newly materialized. No Keychain read/copy.
Real native branded Google control → system accounts.google.com prompt → Cancel
preserved the QA Account; repeating reaches Google's official "Sign in to continue
to OnTheRoad" email page. These are **entry/cancel observations, not Google login**.
Owner interaction returned Google credentials, but two real Supabase exchanges
failed HTTP400 on nonce presence mismatch; original QA Account retained. Auth nonce
bridge repair is independently reviewed; see GOOGLE_NONCE_REPAIR.md. Native45 and
Google Session/cold/logout/account-isolation E2E remain pending.

The original dependency tree has an existing optional Expo/worklets peer conflict;
installation used legacy peer resolution in this independent dependency directory.
The committed lock preserves every existing package entry/version and adds only
Google SDK (no runtime dependencies); shared node_modules is untouched.

Remaining: Owner's authorized Google QA login, then normal Session readback,
cold/refresh/logout and cross-Account negative. Retained physical `.formsqa` needs
another iOS client and is not a substitute. Email positive OTP delivery needs a
usable mailbox; Apple remains disabled/PROVIDER_CONFIGURATION_PENDING. No JWT/OTP
bypass, admin login, device credentials copying, business write or privilege change.
Phase1 remains CLOUD_PENDING until real Provider evidence exists.

## Preserved implementation boundaries

Email request/verify is bounded, cancelable and provisional; normal UI has resend,
change, cancel and OTP autofill. Password/remembered QA selectors remain DEV-only.
Account-keyed secure sessions deny mismatched identity and foreign legacy fallback.
Refresh rejection is explicit; unknown/network errors preserve offline access.
Existing Guest/principal/provisional foundations remain separate from business
adoption. Native bootstrap Guest consumption and whole-dataset adoption are still
owning deltas. Remote logout revokes only the captured current Session before local
removal; UNKNOWN retains access. Tokens stay memory-only in the host DEV runner.

## Data Path Checklist

1. **Ownership:** Auth identity belongs to Supabase Auth; credentials, remembered
   sessions and Guest marker are Local-private SecureStore state; email/code and
   provisional credentials are Transient. No business data is promoted or uploaded.
2. **Local storage:** existing secure session keys plus reviewed
   `otr.mobile.launch.v1`; SQLite remains74. Invalid markers/identity are retained
   for recovery, never reset into a new Guest.
3. **Sync/Backend:** existing Auth and account boundary; no new queue, user DB,
   authority, business DTO, SQL/RLS/GRANT or schema. Provisional verification is not
   an adoption/Cloud business receipt.
4. **Conflict/offline:** cached Account startup preserved; cancel/late generation
   cannot replace another Account; unknown network/logout keeps local state;
   sensitive identity conversion stays closed without whole-dataset preflight.
5. **Evidence:** scoped deterministic Auth/storage/queue isolation and actual DEV
   configuration/OTP negative above. Native L1 and positive Provider/Session L3
   remain pending; mock credentials never qualify them.
6. **Integration delta:** Native snapshot consumer/Guest business principal and
   whole-dataset adoption; native OAuth credentials/configuration; actual mailbox;
   coordinated Native restore and serial main integration.

## Email OTP follow-through — 28 October

**Latest authorized execution supersedes the preparation status below.** Owner
verified auth.xoery.art in Resend and completed Wix DNS. DEV Custom SMTP and both
Token-only templates are saved, preserving the existing encrypted Key without
reading it. Real inbox delivery, native signup/Session/cold restore, Account
isolation, resend/throttling, actual elapsed-expiry rejection and normal logout/
server Session absence are recorded in EMAIL_OTP_HOSTED_DEV_E2E.json. The stricter
temporary expiry is restored to3600 seconds/eight digits. Expired-code error text
was below the visible long form; source repaird3d334d4 is reviewed/tested. Native52
source9c818005/JS2bb56d528ddc564f431a58e2f4b1fef2597641ad5daa749d0a866ec7b189dffe
now passes real guaranteed-wrong-code rejection with the alert visible above the
input, keyboard dismissed, challenge cancelled and A/four Trips preserved.
Its native code/identity sections match49 byte-for-byte; signature is verified.
Independent readback confirms no Email Account Session was created by the
negative. Device returned to Native; no other QA device operated by Auth.
No Apple activation or business
permission change. The following paragraphs retain the earlier preparation facts.

Owner paused Apple until further notice. No Apple package/config/console candidate
is committed or enabled. Google actual native Session/switch/cold/logout evidence
and main integration are in GOOGLE_DEV_E2E.json / GOOGLE_MAIN_INTEGRATION.json.

The Hosted Free DEV project has custom SMTP off and a ConfirmationURL Magic Link
template. Its supported template-edit menu requires Pro, custom SMTP or a Send
Email Hook. Default delivery is team-only; do not add a mailbox to the project
team merely to bypass recipient restrictions, pay for Pro or report a link as OTP.
No Hosted OTP was sent and no SMTP Secret was read or saved by this lane.

Local acceptance uses an isolated Supabase project `otr-auth-mailpit-20261028`:
API54331, database54332, Mailpit54334, SMTP54335. Existing canonical local stack
is unchanged. Business migrations/seeds and unrelated services are disabled;
email confirmations enabled, six-digit OTP, one-hour expiry, local request interval
one second. Both confirmation and magic_link templates use the supplied HTML
with `{{ .Token }}` and no link. Template content_path must be the repository HTML
absolute path: this Docker host cannot serve an unshared /private/tmp bind mount.
Confirm the Auth container's template endpoint actually serves that file.

Run `node --import tsx scripts/auth/mailpit-otp-e2e.ts` with isolated CLI status
in `/private/tmp/otr-auth-mailpit-20261028/status.private.json` (mode0600). The runner
uses only its public client key for normal /otp, /verify, self-read, refresh and
current-session logout; admin/service-role credentials never authenticate users.
Its injected transport maps the fixed nominal DEV origin exclusively to the local
loopback project; the production DEV-project guard is unchanged. Generated codes
are read from this project's actual Mailpit messages, used transiently, never
recorded. EMAIL_OTP_MAILPIT_E2E.json proves new registration, wrong/used code
rejection, existing-user canonical ID stability, memory Repository reconstruction,
Account selection, refresh, scoped logout/revoked refresh and other-account
Session preservation. This is local acceptance, not Hosted delivery or Native
Keychain/cold-start proof. Actual expired-code timing is not exercised here.

Minimal free proposal: Resend Free, proposed auth.xoery.art subdomain and
noreply@auth.xoery.art sender; SMTP smtp.resend.com:465 / implicit TLS / username
resend. A domain-scoped Sending key belongs only in Supabase's secure SMTP password
field. Do not put it in Native, environment examples, logs or Git. Owner approval
of service/subdomain, account terms, exact generated DNS records and credential
creation remains pending. No purchase, sender registration or DNS change occurred.
See EMAIL_SMTP_CANDIDATE.json for the dated allowance and official references.
