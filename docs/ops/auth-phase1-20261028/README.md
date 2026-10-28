# Auth / Identity Phase 1 — 28 October 2026

Owner continuous delivery authorization applies to this independent lane. Base main
`1c7e7fc8`; worktree `auth-identity-delivery-20261028`, branch
`codex/auth-identity-delivery-20261028`. Native owns Manual/Core/Navigation consumers;
Import released the central catalog editing window after `75de43cc`. No shared
runtime, deployment, business policy, database permission or QA device changed.

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

Google source: Auth/Domain16 suites128 tests, TypeScript/UI guard and Expo plugin
introspection PASS before independent review. Introspection confirms the exact
bundle and reversed URL scheme. This does **not** qualify an installed binary.
The original dependency tree has an existing optional Expo/worklets peer conflict;
installation used legacy peer resolution in this independent dependency directory.
The committed lock preserves every existing package entry/version and adds only
Google SDK (no runtime dependencies); shared node_modules is untouched.

Remaining: independent Google review, serial main integration, coordinated unified
native rebuild and actual Google interaction → cold start → logout → Account
isolation. Use the canonical bundle; retained physical `.formsqa` needs another iOS
client and is not a substitute. No Google test identity or personal interaction has
yet been supplied. Email positive OTP delivery remains pending a usable mailbox;
Apple Provider remains disabled/PROVIDER_CONFIGURATION_PENDING. No JWT/OTP bypass,
admin login, device Session/Keychain copying, business write or privilege change.
Phase1 remains CLOUD_PENDING until real Provider/native evidence exists.

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
