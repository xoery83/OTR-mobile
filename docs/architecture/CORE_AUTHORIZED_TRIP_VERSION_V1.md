# Authorized Trip Version V1 — bounded Native/Core contract

Status: contract/DTO and shared pure collection-token helper LOCAL_PASS; no
endpoint, cache, subscription, publisher or DEV activation.
Owner Native06 direction is Actor-specific visibility, then committed hints; it
is not permission to expose raw Trip revision or invent a revocation authority.
Delivery order remains real same-P3 Edit baseline → version read → private hint.

## Writer and reuse

Root owns the shared DTO and Backend/Core reader/commit seam. Native owns its
version transport, ephemeral Account-generation/Trip token cache and existing
Downstream/trigger adapter. Auth owns identity and permission qualification.
No new table, RLS, GRANT, role, SQLite store, queue or permission engine is proposed.
Normal Auth and the existing Actor/Trip read qualification remain mandatory.

## First response

Proposed GET `/v2/trips/:tripId/core/authorized-version`, Core contract2 header.
The only successful JSON fields are:

- `version`: `otr.core.authorized-trip-version/1`;
- `actorAccountId`: the authenticated Actor, never an accepted identity override;
- `tripId`: the qualified requested Trip;
- `token`: opaque lower-case SHA256 of that Actor's authorized visible state.

Initial protocol is200 with a token. No304/client HTTP changes are needed initially.
No caller may use this response as an Item, access certificate, Mutation proof,
revocation/regrant decision or authority to skip full collection validation.
Foreign/invisible reads retain the existing qualified reader denial; unavailable
capability remains unavailable, never a successful unchanged response.

## Opaque token and consistency

Canonical input must come from the existing validated Actor-filtered collection:
Actor ID, Trip ID, collection epoch, read/projection protocol, ordinary-order
projection mode and sorted authorized records (kind/id/revision/body).
Include authorized PERSON_BINDING/RELATION/order records as returned by that
projection. The ordinary-order mode is a protocol discriminator, not a raw counter.

Do not hash or return global revision/accessRevision, generatedAt, page boundaries,
manifest/page hashes or a raw `trip_core_read_state` tuple. A foreign PRIVATE Item
change that leaves this Actor's authorized projection unchanged must leave the
opaque token unchanged, even if global counters advance. Epoch changes or a change
to authorized records must change it. Different Actors must not share a token.
Read-state counters may eventually serve internal cache invalidation, never the
public Actor version. A cheap cache is not qualified until all visibility and
binding/order dependencies can be freshly checked; TTL alone is insufficient.

`authorizedTripVersionFromCollection` in `src/domain/trip/tripAuthorizedVersion.ts`
uses canonical domain `otr.core.authorized-trip-visible-state/1` and kind/id lexical
record order. The same shared helper derives a token from an actual validated collection
on both sides. Native remembers only the token of a successfully applied full
collection, not the preceding check result. If version check observesV2 and the
later collection isV3, apply/validateV3 and rememberV3. Do not storeV2 besideV3 or
loop until the two requests match. Failed/stale/account-switched apply retains the
last accepted token. Logout/generation/Trip scope changes discard the cache.
No new collection field or legacy DTO behavior is required by this protocol.

## Cost and first verification

The initial implementation may reuse the full authorized projection for correctness.
If so it only reduces response bytes; it is NOT a cheap database revision query.
Report bytes, existing query count and wall time separately. It must not cause
high-frequency full-graph reads disguised as a cheap cursor. Keep existing bounded
foreground scheduling until actual cost is proven; no new unbounded retry loop.

Required focused cases: private foreign change gives equal token; visible change,
epoch change and Actor change give a different token; tampered/cross-scope full
collections reject; versionV2/collectionV3 storesV3; failed or old-generation
collection cannot advance the token. Actual Native/DEV acceptance follows the
same-P3 Edit baseline and remains separate from local DTO/component tests.

## Subsequent hint seam — closed

Only an observed APPLIED outer transaction COMMIT may trigger a hint. Receipt
`committedAt` alone is not evidence of an observed physical COMMIT. Do not emit on
inner commands, pre-COMMIT work, NO_CHANGE, rejection, rollback or UNKNOWN. A lost
hint is recovered through the lawful version/full-read path, not replaying writes.

The internal commit hook may identify its Trip/Actor/operation; the network hint
must contain no Item, receipt, document, evidence or raw global revision. Private
subscribers need normal identity and current Actor/Trip qualification; only a
change to their authorized visible state may invalidate them. The hint grants no
read authority. Reuse existing Core commit and reader boundaries, no second journal.

No subscription is mounted until its actual authentication, expiry, disconnect,
Account switch and access-invalidation mechanism is qualified. Where formal
revocation cannot safely invalidate it, shared multi-member activation stays closed.
The existing missing revocation owning port is not manufactured by this DTO.
