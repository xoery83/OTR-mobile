Private Profile candidate only; no route mounting, Hosted installation or Native entry is enabled.

Golden slice: a normal Account edits its optional private display/travel-document names, reads the committed version after restart, and a second Account cannot read or change them.
The existing public `profiles` SELECT policy is all-authenticated, so it cannot hold these private fields. This candidate references the same Supabase Auth UUID; it creates no second user or Session authority.

The Backend adapter reuses normal Supabase user JWT verification and owner-scoped RLS. Missing profile is an empty revision0 view, not a registration prerequisite. Private writes use expected revision, stable operation and receipt reconciliation. Receipts retain a request hash and version, not historical names.
Values preserve Unicode and independent display/document names. Unsplit names are supported. A controlled name-fields fragment now uses canonical inputs/localization, retains both format drafts and rejects stale Account/busy callbacks (independent6 tests PASS). It is unmounted and performs no save. AKA, avatar, birthday/phone, Native page, SQLite/queue integration and runtime wiring are not delivered here.

Any new tables/RLS/GRANT/function installation requires independent review and the exact Owner DEV Gate. The SQL below is a local candidate, never an automatic migration. Existing public profiles and Auth/Trip permissions stay untouched.
