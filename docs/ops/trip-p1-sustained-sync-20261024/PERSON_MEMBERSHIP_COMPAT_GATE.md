# Precise Person scope compatibility Gate candidate

**Ready for independent Review / explicit DEV authorization; NOT deployed by Writer.**

## Determined cause and scope

Actual Root `FIRST_TRIP_INDEPENDENT_SERVER_READBACK.json` records two Person gateway edges: postgres member with admin=true/inherit=false/set=false granted by supabase_admin, and postgres member with admin=false/inherit=false/set=false granted by postgres. The current helper rejects every related row not matching its permitted branches; the second row deterministically makes Person scope false. Isolated PostgreSQL reproduces the observed PERSON_CREATE_FORBIDDEN before any Person write. The GET result checks this scope before result lookup, so payload name/UUID validation or an already-existing Person cannot explain this particular failing branch.

Root `EDIT_TRIP_INDEPENDENT_SERVER_READBACK.json` confirms only Person has this redundant edge. Metadata/Create have their existing admin-only branch; Core has its admin branch plus expected gateway→writer SET edge. This candidate changes **only kind=PERSON**. Existing actual Trip Create/Edit accepted and independent readbacks are Root evidence, not new claims by Writer. Actual Role flags/credentials/EXECUTE ownership/cutoff/runtime binding must still be rechecked by Root before renewed operation; fixing one deterministically failing predicate is not itself real Person Runtime PASS.

## Exact SQL delta

Install only `20261024000400_person_redundant_owner_membership.sql` after the existing two installed migrations. It replaces one owning helper definition, preserving owner/ACL/other scope checks. Exact parent helper MD5 `54d94b8e00ee7228cfe2d38085475089`; new MD5 `5c8c33ec3d6b9547451c64f67f769d4d`. Artifact SHA256 values are in PERSON_MEMBERSHIP_COMPAT_HASHES.json.

The single new allowed edge must meet **all** conditions: PERSON kind; gateway is roleid; member=postgres; grantor=postgres; admin=false; inherit=false; set=false; and a matching same-role/member grant by supabase_admin exists with admin=true/inherit=false/set=false. Foreign members, inherited/settable edges and different grantors remain disallowed. There is **no GRANT/REVOKE/ALTER ROLE, membership edit, new role/table, Auth, business write or new command** in the migration. No Source/Core/Metadata authority is changed.

Preconditions require policy disabled, all four gateways NOLOGIN/zero sessions, existing finite/person/source Gates closed and exact helper preimage. Source flags/tables, where installed, are checked without changing them; the older network-none fixture lacks some optional Source gate schema. Actual DEV has those gates and Root must verify all remain CLOSED. Stop on drift rather than extending the patch. Root remains sole SQL/deployment operator.

## Activation/readback and rollback

Existing installed SQL/Backend bundle remains otherwise unchanged. The old activation packet postimage for this helper must be updated **only** from54d… to5c8… under this new exact Gate; do not run the stale activation packet or weaken all postimage checks. Re-fix the packet hash, private close entry/Watchdog hashes if their reviewed artifact bindings change, and retain original immutable Actor/cutoff. The Person installation migration must not be rerun, because its original parent54d precondition is intentionally historical.

Root may then use the same bounded synthetic/new-Trip budget and existing ordinary Native retry/readback paths. First normal Person result request should become legitimate404 if absent, then existing worker may perform the already-approved exact Person POST/readback. Any UNKNOWN must reconcile before another write. No memberships or old Pending are changed to make tests pass. P1 still requires actual Person qualification and its own Native/Server/readback evidence.

Rollback `20261024000400_person_redundant_owner_membership.rollback.sql` requires policy disabled/four gateways NOLOGIN/zero sessions and exact5c8 postimage, then restores original54d helper. It preserves all memberships, accepted data/receipts and Source functions. Root independently verifies restored hash and resource safety. No data deletion/reset or automatic remote retry.

## Evidence

Network-none real PostgreSQL17 **43 checks plus8 typed Pg/Core checks PASS**. Exact actual two-grantor shape reproduces403 before patch; the compatibility function allows real Person command/replay/independent canonical result without changing grant rows. SET/INHERIT/foreign-member negatives reject; cross-Account, Local-private promotion,21 malformed JSON inputs, full Trip list/Metadata, five existing P1 commands/readback and policy revocation remain protected. Exact rollback restores54d and byte-equivalent membership rows; accepted business rows/receipts survive. No DEV SQL/ACL/runtime action or Native test was performed by this Writer.

## Coordinator execution qualification — 24 October 2026

Independent Review PASS at fixed `2f4a9264fb3089d284391016d942aac2b05ddeb0`; independent PostgreSQL49+typed8 checks. Review JSON SHA58929c02684e4e7d7a12742923a57f4ef84372b94bf79eecab63d98aed913961.

**Additional authorization requested:** install only004 SQL SHA256 `45e21bc8988887b90b7bacc0a110f532f0f827bedebd8d924ed2b14e4c012094`; rollback SHA256 `2cf85e61601e12fcdc14e8bed46e319348a41ab5f863687dfd2b25772f881a8d`. No membership, Grant, role flag, RLS, table or new command is added/removed. Resume the previously approved full QA closure with the same fixed6b11b6ba… Backend/runtime, existing Synthetic A/B, immutable cutoff2026-10-24T01:41:25.160Z, existing Trip/Person/P1 IDs and original total QA limits; this does not reset budgets or authorize Universal Provider/Source activation. Previously approved image/runtime redeployment after safe rollback remains within the original Gate. Re-pin only the reviewed helper postimage and resulting prepared packet/watchdog bindings; preserve all other checks.

Current actual state: transition Watchdog closed exact policy/four roles/zero sessions and removed added runtime; independently verified closed. Original73d518d4… Backend and95b9c801… Capture bundle restored development/ok, original config/user/three mounts retained. New QA Trip Create and Edit already have independent server readback; Person is absent/rejected before mutation; P1 is retained locally in DEPENDENCY_BLOCKED. Historical20 Trips,191 queue entries and13 destination rows have byte-equivalent read-only digests. No Auth recreation or original SQL reinstallation is requested.

Execute closed preimage/owner/ACL/membership checks →004 only → independent exact postimage/unchanged permissions → reviewed packet binding → independent finite transition watchdog → existing normal App automatic Person/P1 continuation and remaining full QA → success leaves revocable normal service available, failure safely closes and rolls back. Stop only on actual authority drift, UNKNOWN that cannot be reconciled, or failed closure.
