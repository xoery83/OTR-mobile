# Private Global AKA — default-closed Cloud Profile candidate

Owner V3 B3 (2 November2026) explicitly includes private AKA. The accepted People
Product Delta keeps Global Profile private and separates it from Trip Nickname,
Organizer notes and Account/Person connection. AUTH06 AKA matching never grants
rights. No confirmation status, inferred identity link or search is introduced.

First actual gap: the existing private Profile fields and SQL validation only
accepted Display Name and Travel Document Name. Extend that same optional JSON
profile with `globalAka?: string[]`; no new Repository, table, route, receipt or
sync engine. The field retains original Unicode, ordering, duplicates and blanks
without normalization. Omission leaves it absent/unchanged; explicit `[]` clears.
It is not nullable. Existing Display Name can remain empty/null, and travel-document
split/unsplit names are independent. Existing size bounds still apply.

Mutation schemaId/path, operation ID, expectedRevision, Account-bound CAS, normal
Auth qualification, private RLS and receipt format are unchanged. Critically, the
schema has no default AKA array: old parsed requests remain byte-identical. The SQL
fingerprint expression is unchanged and old receipts replay after AKA writes.
Old SQL candidates/reviews remain byte-identical. `private-profile.body.sql` here
is a new candidate body, not a patch authorized for Hosted installation. The only
semantic SQL delta is the allowlist and array-of-strings validation. A future exact
installation artifact must be separately rendered/reviewed against actual absent
or installed state; do not treat the old Gate/hash as approval for this body.

Normal UI remains local-only: `globalAkaDraft` is not renamed/promoted, and
`privateProfileChanges` still does not publish it. API callers must explicitly
submit `globalAka` through the qualified existing candidate. Existing strict older
clients may reject new fields, so actual Cloud rollout must qualify its client
contract/version before activation; this candidate does not claim all old binary
readers can consume new fields. No Cloud Profile worker/runtime is installed.

Focused domain/API/adapter tests verify legacy bytes, Unicode/name independence,
explicit private read/write, malformed AKA and unchanged local-only draft behavior.
The standalone PG probe reuses the pinned existing network-none fixture, adding
only AKA tests; it does not access Supabase. Its auth.uid/User fixtures are not
OTP/JWT or Native E2E evidence. Hosted/API readback and Account cold recovery remain
pending. No Session, OAuth, Native shared files, DNS, credentials or Hosted SQL changed.
