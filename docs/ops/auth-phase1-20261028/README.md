# Auth / Identity Phase 1 — 28 October 2026

Owner continuous delivery authorization applies to this independent lane. Base main
`1c7e7fc8`; worktree `auth-identity-delivery-20261028`, branch
`codex/auth-identity-delivery-20261028`. Native owns Manual/Core/Navigation consumers;
Import released the central catalog editing window after `75de43cc`. No shared
runtime, deployment, business policy, database permission or QA device changed.

## First source slice

- Existing fixed-DEV Auth adapter now requests Email OTP and verifies entered codes.
  Verification returns provisional credentials; the existing account transition
  installs them. Requests are bounded, cancelable and never automatically resent.
- Apple/Google ID-token exchange ports exist; native credential acquisition and
  actual Provider configuration remain unavailable. No inert Provider UI or fake
  sign-in is substituted.
- Refresh rejects inconsistent Account identity before persistence; explicit Auth
  rejection codes are distinguished from gateway/configuration/network failures.
- Account-keyed secure sessions reject mismatched stored/token identities and
  missing active entries without falling through to another legacy account.
- Reviewed historical `059d4bc9` Guest/principal and provisional-sign-in foundations
  are reused. Guest is not Account, has no cloud authority, and cannot be converted
  by an ordinary session write. Auth snapshot is exported under the apply gate;
  Native startup consumption and Guest business ownership remain an integration
  delta. Existing legacy Account adoption is not Guest dataset adoption.
- Normal Account UI uses Email OTP; QA password/remembered selectors require a DEV
  build. The form supports resend/change/cancel/autofill, canonical EN/ZH copy and
  focus cancellation. An aborted originating screen cannot install after Sync
  drains or navigate after completion.
- Reviewed online logout checks and retained-account pause recovery are reused.
  This first slice removes local credentials only; remote Session revocation is
  the next owning increment, not an asserted acceptance result.

## Evidence and remaining qualification

First source slice is fixed at `cfae2b18` and fast-forward integrated/pushed to main;
all six pre-existing primary-checkout dirty entries remain unchanged. Exact local
integration evidence is in `MAIN_INTEGRATION.json`; no DEV deployment or device
operation accompanies it.

The next candidate adds normal authenticated `/logout?scope=local`, outside the
Account apply gate and before local removal. Only the captured Account/generation
can supply a token. Network/UNKNOWN keeps local access; explicit invalid-session
rejection permits the requested online local logout. No global logout is used.
Independent remote-logout source review:15 Auth/Domain suites115 tests/types/diff
PASS before the subsequent hosted-error-envelope compatibility repair.

First finite real host Session attempt reached revoked-refresh negative, then
failed the negative check. Its exact failure cause was not retained; it did not resend Logout. Independent SQL proves the exact
new Session absent and all11 original QA Sessions preserved; the run is reconciled
closed, **not E2E PASS** (`SESSION_DEV_ATTEMPT_1_RECONCILED.json`). A safe nonexistent
token probe independently demonstrates hosted numeric `code` plus string
`error_code`; the old attempt's unretained error is not reconstructed. The adapter
now accepts both finite rejection-code envelopes while unknown/conflicting codes
retain offline continuity. A fresh pinned-source run is required for full scoped
Session evidence. The runner refuses unresolved prior work and dirty Auth source,
pins the new Session across refresh/cleanup, rejects redirects and never retries
uncertain Logout. Tokens stay in process memory, never copied from QA devices.

Independent review: Auth/Domain 13 suites / 104 tests, TypeScript, UI guard and diff
check PASS. Root also ran adjacent startup/Person/Capture checks: 17 suites / 162
tests including the final cancellation case. No blanket full-repo test
claim. UI guard uses its unchanged baseline (473 historical occurrences), 157
strict representative files. Headless iOS JS/Hermes export bundles 2,197 modules; no Native visual or installed-app acceptance claimed.

`DEV_AUTH_CONFIGURATION_AND_NEGATIVE.json` records actual public settings HTTP200
and one normal invalid-OTP HTTP403. Email enabled; Apple/Google disabled; signup
allowed and confirmation required. This is negative/configuration evidence only,
not OTP delivery, registration or positive login. Owner says no configured QA
mailbox/provider identities yet and will supply later; no broad credential request
is outstanding. Historical Forms QA password login/cold acceptance remains scoped
to its old unchanged path and is not OTP proof.

Next: own fresh host-only normal Session/refresh/self-read/revoke check using the
Native-approved existing Synthetic credential source; then coordinated Native
observation and real OTP delivery when a mailbox exists. No other device token,
Keychain or Session may be copied. Apple/Google remain
`PROVIDER_CONFIGURATION_PENDING`; Phase 1 stays `CLOUD_PENDING`.

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
   remote revoke; coordinated Native restore and serial main integration.
