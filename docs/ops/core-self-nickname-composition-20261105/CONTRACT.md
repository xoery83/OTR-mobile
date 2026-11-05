# Explicit self-nickname Core provider composition

Request: AUTH-C03-NICKNAME-EXPLICIT-COMPOSITION-PORT-20261105-01.
Source base: b94d13290dfcd126c4e85aac10e16e8c1a539684.

## Existing boundary and minimal change

`backend/src/tripCreateRuntime.ts` owns `rawCoreConnection` in the existing version3
sustained provider (original line140). Its original SHA256 is
ca1a4af1125f85c2c9d603ed4bf4fcdbf7e6807ce7d76fcad21bdfdd80f7b814.
`serverCapture.trip.coreConnection` is an HTTP facade, not a CorePgConnection; it must
never be cast to a raw connection. The existing PG port factory is
`backend/src/tripPersonSelfNicknamePg.ts` (original SHA256
50f0333f68945a85d54a2d30eced99f7929a17042151f8aab6201afb3a809614).

The existing loader's explicit internal `options` now accepts `selfTripNickname?: true`.
Only that exact choice, and only existing version3 composition, returns the optional
`selfTripNicknamePort` created by the existing factory on the same raw Core connection.
Connection/config presence, source-review reader, Member Claim choice or an environment
flag never implies selection. No raw DB, config, key, actor selector or new connection
is exposed. Existing finite/version2 outputs remain unchanged.

The factory accepts an optional lifecycle assertion, not a new provider or SQL authority.
The selected provider passes its existing closed-state assertion: before lease acquisition,
inside a queued lease, before context/function dispatch and before COMMIT. A closed
transaction rolls back; no accepted result is invented. A real in-flight COMMIT failure
retains existing UNKNOWN classification. Default direct source-only factory callers
retain previous behavior. No SQL body, GRANT, capability bit, actor or Trip policy changes.
The returned method shape is the existing canonical factory result and matches Auth's
`SelfTripNicknamePort` without casts/adapters.

## Consumer handoff (Auth owns)

The normal `loadDevTripCreateWithMemberClaimQaRuntime(env, reader)` caller currently
selects only its existing Member Claim option and spreads other loader outputs. It
has no nickname selection path. Therefore adding this Core ABI alone does not select
or mount the port. Auth owns the explicit, reviewed selection/forwarding composition
through its startup/QA wrapper, default absent. No Env/config autodiscovery is supplied
by this candidate. Runtime mounting and protected installation/authorization remain
separate; a TypeScript option is not execution approval. No Startup/App/QA wrapper
files are changed here.

## Checks and limits

Existing provider + PG adapter suites: default-off including unrelated Env presence,
explicit same-connection typed return, no extra connection/raw export, finite exclusion,
queued lease close/no SQL, close-before-COMMIT rollback, original validation/receipt/
UNKNOWN behavior. Scoped types/lint pass. Tests use mocked existing leases, no real
PG, Hosted, credential, device, Source or business operation. Independent Review and
main integration are pending; no runtime enablement is claimed.

## Independent finding R1 / precise repair

The original0fc candidate failed the reviewer post-await close probe. Six direct cases reproduced this before repair (successful COMMIT or callback-before-lease-return × READ/EXECUTE/RECOVER). The same cases now pass with old46 retained (52 total). Lifecycle is checked after whole lease await and after final awaited result at each public method; assertion errors remain sanitized. The post-lease assertion is outside the transaction rollback handler: successful COMMIT is never falsely rolled back. A closed result requires original-operation receipt recovery, never replacement or resubmission. Default-noop and PG authority are unchanged; source needs targeted independent re-review. Original review/RED preserved.
