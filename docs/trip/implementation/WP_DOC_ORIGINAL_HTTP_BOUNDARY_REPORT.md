# WP-DOC-ORIGINAL HTTP boundary (local dormant scope)

The Backend now recognizes `GET /v2/trips/:tripId/documents/:documentId/original` after normal token authentication. It requires the actor's current Trip-read permission, an exact positive content version and quoted SHA-256 precondition, then delegates to the accepted Document original-read port. That port independently requires current Core Document ACL and matching Source/copy retention rights before and after its bounded byte read. All denial, missing-provider and stale-content outcomes return one private unavailable response.

The route exposes a byte stream only when an explicit `documentOriginalReader` is injected. Normal server composition injects none, so the route remains unavailable. The Node HTTP host rejects any original-route body chunk before buffering it. Responses use `application/octet-stream`, a generic attachment name, `private, no-store` and no storage locator. The boundary checks returned identity, version, byte length and SHA-256 again before responding.

Validation: focused original port, HTTP and host-ingress tests (31 PASS), TypeScript, UI guard, scoped ESLint and Prettier, Backend bundle build. Synthetic injection only. No current Core/custody provider, real retained original, Mobile opener, HTTP deployment, credential, or `canReadOriginal` activation is established by this packet.
