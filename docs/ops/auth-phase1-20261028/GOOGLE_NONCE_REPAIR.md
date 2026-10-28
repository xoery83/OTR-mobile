# Google nonce acceptance repair — 28 October 2026

First failure is independently visible in DEV Auth logs at18:09:07 and18:19:01
Pacific/Auckland: POST /token, grant_type=id_token, HTTP400, "Passed nonce and nonce
in id token should either both exist or not." The matching API event identifies
OTRMobile/43. This proves provider credential acquisition reached Supabase; it does
not prove a Supabase Session. The original Forms QA Account is still visible;
no additional Account is remembered. Do not retry the unchanged43/44 path.

Read-only DEV configuration matches both Owner client IDs; Google enabled and
skip_nonce_check=false. No Provider Secret is printed, persisted or copied to
Native/Git. Provider configuration and database authority are unchanged.

The underlying official GoogleSignIn9.2.0 exposes a nonce overload; public JS
wrapper16.1.5 does not pass it. One Auth-owned local Expo bridge invokes that
public overload and returns only a provisional ID Token/cancellation result.
Reuse wrapper button, URL callback and local sign-out. Native SDK9.2.0 is pinned
in its local podspec, with no npm dependency or upstream package patch.

Generate a fresh32-byte nonce using expo-crypto.getRandomValues (native secure
random; unavailable capability fails closed). Do not use getRandomBytes's DEV
Math.random fallback. Send SHA256 hex to Google and the original to Supabase,
never nonce data parsed from a Token. Keep nonce/Token in transient memory only.
Existing focus/generation/cancellation fences still own Session installation.
Native main-queue in-flight guard rejects overlap; non-owning busy JS attempts do
not sign out another active request. Older binaries lacking the nonce bridge
return unavailable before provider UI. Apple nonce enforcement is unchanged.

Independent Review: initial RNG-fallback and non-owning-cleanup findings repaired.
16 Auth/Domain suites132 tests, types/UIguard, scoped lint/format/diff, Swift parse
and podspec syntax PASS; final lazy-native delta independently12 tests/diff PASS.
Default native secure-random dispatch, SHA256 binding/fresh attempt values,
cancel/missing credential/errors, overlap and no raw nonce/Token logging checked.
Native Swift type/link/runtime and actual Google → Session/cold/logout/isolation
remain PENDING. Native owns one unified Build45 retaining approved P4/Import and
this fixed Auth SHA;44 stays uninstalled because it lacks the nonce bridge.

Supplemental boundary review: Google nonce is also required by the Auth DTO and
Zod validator, preventing accidental no-nonce callers before any request. All
product callers use the nonce bridge; Apple remains required. Independent2 suites55
checks PASS; root final16 suites133 tests/typecheck/scoped lint/diff PASS. This
supplement changes JS only; Native applies it after current Swift compilation and
before the final Build45 embedded bundle. Native runtime acceptance is still pending.

First real Swift compile found only the imported GIDSignInErrorCode type name
unavailable. Use the cancellation value from the pinned9.2.0 public header
(kGIDSignInErrorCodeCanceled=-5), still gated by kGIDSignInErrorDomain. No nonce or
Session behavior changes. Recompile is required; syntax parsing alone was never
claimed as native type/link acceptance.
