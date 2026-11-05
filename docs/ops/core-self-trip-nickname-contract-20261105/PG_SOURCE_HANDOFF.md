# Self Trip Nickname — Core PG source handoff

Status: **IMPLEMENTED / LOCAL_PASS / REVIEW_PENDING**. Not installed, mounted, enabled or Hosted-qualified.

Canonical codec/ABI: commit `f4746ba0`; retain its exact two source hashes and independent 33-case evidence. This is a subsequent PG implementation, not a change to Auth's accepted wire shape.

## Owning producer

`createTripPersonSelfNicknamePgPort(connection)` is a new **unmounted** Core connector. Auth supplies its existing validated `SelfNicknameContext` to `read`, `execute` or `recover`. It owns no HTTP/JWT/controller or identity selection. Each operation uses one existing `CorePgConnection` lease/transaction and the established Actor/Trip settings, then calls only `public.trip_person_self_nickname(actor,trip,person,method,payload)`.

- `read(context)` returns the current separate nickname observation.
- `execute(context, originalCommand)` returns precisely `{receipt,idempotentReplay}`.
- `recover(context, originalOperationId, {intentDigest})` returns precisely `EXACT_RECEIPT` or `ABSENT_UNCONFIRMED`. No fallback write, replacement operation or retry occurs.
- A failed/uncertain COMMIT remains a failure requiring original-operation reconciliation. A historical receipt never substitutes today's Person value or current access.

## Actual source boundaries

`backend/sql/tripPersonSelfNickname.sql` defines one `nickname_revision` on the existing Person row, a default-false bit on the existing bounded Core activation row, immutable nickname receipts and four functions/three triggers. It adds no nickname overlay, private Profile field, role or second queue/save system. It grants **no** new EXECUTE. Its guarded source SQL is not a ready deployment packet: Root2 still needs exact protected authorization and actual preimage/ACL qualification.

The new RPC reuses the actual normal read-scope predicate. That body admits a unique current linked normal Account in a rolled-out Trip, including a non-owner who is not its creator; participation is not an access predicate. It rejects foreign Person/Trip, removed users and unavailable/ambiguous self linkage. Write scope additionally matches the existing bounded Actor/Trip/start/end and rejects non-finite time bounds. Reader/original receipt recovery remain independently qualified when only the write bit closes.

Legacy names may be long or contain surrounding whitespace. Only new SET is trimmed/nonblank/at most 256 Unicode scalars. Explicit Clear maps to the sole `display_name=''`, observed as null, without Profile fallback or AKA mutation.

## Named writer compatibility

- Approved Auth `MEMBER_CLAIM_CANDIDATE.sql` line 183 changes link fields only; it does not write `display_name`. Its first-Claim/replay logic is untouched.
- Existing updates to previously `unlinked`/`invite_pending` rows retain their existing independent ACL. If the name actually changes, the trigger increments the new counter; it grants no name/link permission.
- Existing `claim_pending_members` baseline coalescing remains possible only on its original unlinked candidates. It cannot refill an already-linked cleared name.
- Legacy `import_ledger_stage9_trip` and UI-polish fixture UPDATEs on **already-linked** names are rejected without the precise canonical same-transaction nickname receipt. They do not gain new authority.
- Changing only participation, link, role or notes does not advance nickname revision. Direct revision manipulation and overflow fail closed.

## Validation and remaining installation work

`pg/RESULT.json`: 23 actual isolated PostgreSQL checks, using the cached image `8b7c01e4…`, 256 MiB/1 CPU, no network/ports. It uses the real normal admission body and actual registered synthetic users, linked membership, removed-user and role-graph checks—not an Actor=true stub. `pg/LOCAL_PG.log` retains setup failures and final successful transaction evidence. Adapter: 14 direct tests; scoped types and ESLint pass.

This fixture is deliberately minimal. It does **not** qualify actual Hosted function bodies/owners/ACLs, complete activation-row constraints, installed trigger ordering, Auth C04 endpoint integration or Native Person mirror compatibility. Root2 must verify those exact dependencies before installation and ensure the nickname-only window cannot activate unrelated Core commands. Native must consume current nickname/revision truth and handle cleared/blank display without inventing a global identity fallback.

All self-labelled fixture containers were independently absent after the final run. No shared Hosted/Main Writer, Source/Task, Provider or business execution resource was acquired. Independent code/SQL review is the next step; only then should a precise Root2 default-closed installation packet be fixed.
