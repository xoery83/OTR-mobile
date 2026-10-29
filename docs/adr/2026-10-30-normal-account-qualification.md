# Explicit normal Account qualification

The existing Backend token verifier returns only an Auth UUID. Removing a QA
Actor list must not turn a verified anonymous Auth user into a normal Account.
Add classification from the trusted Supabase `getUser` response: explicit
`is_anonymous === false` is NORMAL_ACCOUNT, true is ANONYMOUS, and missing or
invalid classification is UNKNOWN. Reject invalid Account UUIDs.

Expose a small normal-Account predicate for normal Trip/Core consumers. Old
id-only callers remain structurally compatible but do not qualify through this
predicate. Never infer classification from email, display name, provider strings,
profile presence, the generic authenticated role or client-decoded JWT metadata.

Keep global authentication, Guest verification/adoption, secure Session storage
and offline launch unchanged. Native owns the normal-route gate and its precise
SQL candidate; no new Schema/RLS/GRANT or DEV deployment follows from this source.
