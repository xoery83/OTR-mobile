Private Profile candidate only; no route mounting, Hosted installation or Native entry is enabled.

Golden slice: a normal Account edits its optional private display/travel-document names, reads the committed version after restart, and a second Account cannot read or change them.
The existing public `profiles` SELECT policy is all-authenticated, so it cannot hold these private fields. This candidate references the same Supabase Auth UUID; it creates no second user or Session authority.

The Backend adapter reuses normal Supabase user JWT verification and owner-scoped RLS. Missing profile is an empty revision0 view, not a registration prerequisite. Private writes use expected revision, stable operation and receipt reconciliation. Receipts retain a request hash and version, not historical names.
Values preserve Unicode and independent display/document names. Unsplit names are supported. A controlled name-fields fragment now uses canonical inputs/localization, retains both format drafts and rejects stale Account/busy callbacks (independent6 tests PASS). It is unmounted and performs no save. AKA, avatar, birthday/phone, Native page, SQLite/queue integration and runtime wiring are not delivered here.

Any new tables/RLS/GRANT/function installation requires independent review and the exact Owner DEV Gate. The SQL below is a local candidate, never an automatic migration. Existing public profiles and Auth/Trip permissions stay untouched.

The existing Account Profile repository now also provides private read/save/receipt methods through the normal scoped API client. Inputs freeze before asynchronous work; Actor/operation/revision responses bind exactly, redirects are rejected and missing/closed/conflict responses propagate without fallback or an automatic write. Reads remain bounded at64KB to include both merged name fields and snapshot metadata. Independent14 tests PASS; near-limit JSON checks are client fixtures, not a PG maximum-size measurement. No Native caller or local persistence is activated.

Next bounded local foundation: Account-private optional name draft plus last accepted
private Profile snapshot survive ordinary SQLite reopen, behind the existing Account
generation/apply fence. SQLite77 is reserved by Native (76 belongs to Source); its
registry is not modified here. A local draft is never a cloud acceptance or identity
connection. Remote refresh preserves an edited draft and its original base rather
than silently rebasing it. The existing Account Profile repository exposes this local
data source only when explicitly supplied a database. No new queue or Sync Engine:
future submission will use existing owner-scoped sync_operations with trip_id null.
No Native entry, worker dispatch, Hosted route or RLS/GRANT is activated by this step.

Focused local repair: the former self-read candidate allowed a delegated resource
claim fixture to read Account-private values. This was reproduced only in the
network-none PG fixture, never Hosted. New-table SELECT policies and the save RPC
now exclude client_id/non-null, any otr_scopes marker and scalar/array MCP audience,
mirroring the existing ordinary HTTP additive denial. The Backend adapter rejects
the same markers before Auth/data IO. This does not authenticate a decoded token,
change existing public profiles or grant any new permission; the candidate still
requires its exact future Owner DEV Gate and independent review.

The adjacent qualification check also reproduced a read/write mismatch for an
existing row after its local Auth fixture was disabled. A single zero-argument,
profile-specific SQL self-subject predicate now supplies both RLS and save checks
from existing auth.uid/auth.jwt/auth.users (normal, not disabled, not delegated).
It returns only the caller's own UUID or null; it is not an issuer, Session store
or new identity mapping. This candidate adds two functions in total (predicate and
save), requiring the same future exact Owner permission Gate; nothing is installed.
