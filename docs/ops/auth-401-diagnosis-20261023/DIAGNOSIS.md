# Existing DEV Auth administrative credential — bounded401 diagnosis

Status: **NOT_READY_EXISTING_AUTH_CONFIGURATION_REJECTED**. No local code defect or exact credential failure cause has been proved; no header/credential change is proposed as a demonstrated fix.

## Actual minimum checks

The canonical existing `/Users/xoery/Project/otr-mobile-canonical/.env.backend` was classified in memory. `OTR_DEV_SUPABASE_URL` matches DEV `tuqigdxrvrerfewsxqgm`; source is operator-owned,0600,non-symlink. `OTR_DEV_SUPABASE_SECRET_KEY` is a nonempty opaque `sb_secret_` key, not an `sb_publishable_`, anon JWT or user JWT, with no whitespace. Opaque keys do not expose an inspectable project/role/expiry claim. Actual project binding, revocation and expiry therefore remain UNVERIFIED. No raw key/fullJWT/key fingerprint was retained, compared externally or copied to another source.

Installed `@supabase/supabase-js` version2.116.0 `SupabaseClient._initSupabaseAuthClient` supplies `apikey:key` and `Authorization:Bearer key` to its Auth client. Reading those installed objects in memory confirmed the actual same configured key in both headers; only booleans were saved. No browser User-Agent override was configured. No alternative header/key was tried.

One newly authorized, side-effect-free **GET** `https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1/settings` with those same Auth headers returned **HTTP401/AUTH_REJECTED**, at2026-10-22T23:20:56.600Z; request ID `01a165ea-ec53-7129-92c6-66d24c67d5da`. The response body was cancelled without reading/persisting it. This checks public Auth gateway qualification only, **not admin permission**. No Auth users endpoint, creation/login, A/B query, profile, business, SQL, deployment, Native or Production operation was performed by this diagnosis.

The previous23:08:52 actual A-only creation401/request ID remains separate. The first22:34 attempt remains UNKNOWN. No old response body/error code was reconstructed.

## Historical successful baseline versus current attempt

| Property | Accepted R3 successful synthetic Auth creation (8October) | Current fixed A-only attempt |
| --- | --- | --- |
| Project | DEV `tuqigdxrvrerfewsxqgm` | Same exact DEV project |
| Actual outcome | Two new ordinary synthetic Auth identities plus normal sign-in reported | One A POST, HTTP401; no verified identity receipt |
| Interface | Existing DEV Auth admin service, per accepted execution report | SDK2.116.0 `auth.admin.createUser` → `/auth/v1/admin/users` |
| Exact historical endpoint/header bytes/SDK version | Not recorded in available nonsecret report; UNKNOWN | Installed source + in-memory safe flags verified |
| Credential type/source identity | Nonsecret report does not record enough to prove which key/type; UNKNOWN | Canonical existing config, opaque secret; validity/project binding not established |
| Retained private evidence | Report names `seed-auth-private.jsonl` containing secrets; not opened/recovered. Referenced private directory unavailable | Sanitized actual status/request ID and separate configuration classification |

Historical success is real accepted evidence but does not prove current credential bytes/type/header equivalence or current validity. No private historical fixture credentials/tokens were read or reused.

## Official-source interpretation

[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) distinguishes secret keys from JWTs and recommends secret keys for controlled backend components. [Official migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), Step3, explicitly demonstrates server `createClient(url, sb_secret...)`. Its later non-JWT Bearer rejection warning appears in the Edge Functions `verify_jwt` migration context. It is not evidence that the Auth `/admin/users` default SDK headers caused this401. Browser-origin secret rejection is documented, but this operator did not set a browser User-Agent. No speculative header-removal patch or SDK upgrade was made.

## Minimum Owner action / remaining uncertainty

Owner must privately verify that **`OTR_DEV_SUPABASE_SECRET_KEY` in the canonical existing `.env.backend`** is the intended currently active secret key for DEV `tuqigdxrvrerfewsxqgm` and is qualified for the existing Auth administration API. If it is stale/wrong/revoked, updating that existing configuration item requires Owner-controlled credential handling; this diagnosis does not fetch, generate, rotate, substitute or test another key. Do not change the URL to chase a key. The URL already matches the approved DEV project.

Exact cause among invalid/revoked/wrong-project credential, service configuration, or gateway/Auth compatibility remains unproved. The configured combination is rejected by the current target Auth gateway. No more probes are justified under this exhausted one-readonly-check scope. Any configuration change or later readonly/retry validation requires precise new authorization; no automatic fallback, alternate management channel or new architecture.

All C business gates remain unmodified/closed by operation history; no fresh SQL/Backend re-audit was performed. Four business paths remain NOT_RUN/CLOUD_PENDING. Import remains queued under Coordinator control.

Data Path Checklist: ownership=operational diagnostic metadata; local=0600 sanitized receipts only/no key persistence; contract=no product/backend change; conflict/offline=no replay/fallback; evidence=actual readonly401+static installed SDK/config flags, no Native/businessL3; remaining=Owner-managed existing credential qualification and separately authorized verification.
