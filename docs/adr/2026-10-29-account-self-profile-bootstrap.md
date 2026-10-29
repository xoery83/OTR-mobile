# Normal-session self-profile initialization

Verified Supabase Auth accounts can lack `public.profiles` rows. Existing Trip
creation requires that row through `trips_created_by_fkey`; normal login alone
does not initialize it. Reuse the existing authenticated self-INSERT policy.

Provide a versioned Backend bootstrap endpoint and an Auth repository consumer for
the existing sync preflight. Validate the normal Bearer Account, read only that
Account's profile, insert `{id, display_name: ""}` only if absent, then read back.
Omit role and all other fields so existing server defaults/protection apply. A
concurrent duplicate insert is resolved by readback; never overwrite a profile.

An empty Display Name implements its approved optional status without inventing
an email-derived name, Person connection, role or registration requirement. No
Claim function, service-role business mutation, new RLS/GRANT or Auth trigger.
Failure pauses sync; local launch and offline cached data do not wait for this
network operation. Shared Backend mount/DI and Native runner remain their unique
writers' responsibility until explicitly delegated.
