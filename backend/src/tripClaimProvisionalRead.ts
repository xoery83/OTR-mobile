import { claimRequestSnapshotSchema, claimResolutionScopeSchema } from "../../src/data/api/claimResolutionContracts";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { coreReadItemChildren } from "../../src/domain/trip/tripCoreV2Read";
import { emptyCoreGraph, type CoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { coreActorReadRecords } from "./tripCoreV2Collection";
import { readCorePgGraph } from "./tripCoreV2PgStorage";
import { setCoreReadIdentity } from "./tripCoreV2PgRead";
import type { ClaimResolutionTransaction } from "./tripClaimResolutionCore";

// Projection only, not an authority factory. No Membership, private owner fallback or writer capability.
export function projectClaimProvisionalShared(graph: CoreGraph, rawGrant: unknown) {
  const grant = claimRequestSnapshotSchema.shape.provisionalGrant.unwrap().parse(rawGrant);
  if (grant.state !== "ACTIVE") throw Error("CLAIM_SHARED_GRANT_INACTIVE");
  const shared = emptyCoreGraph();
  shared.itinerary_events = graph.itinerary_events.filter(r => r.trip_id === grant.tripId && r.visibility === "GROUP");
  const ids = new Set(shared.itinerary_events.map(r => r.id));
  shared.trip_instruction_entries = graph.trip_instruction_entries.filter(r => r.trip_id === grant.tripId && r.visibility === "GROUP" && ids.has(r.event_id));
  for (const table of coreReadItemChildren) shared[table] = graph[table].filter(r => ids.has(r.event_id));
  // active means current validated read authorization; personIds stays empty and no membership is asserted.
  return coreActorReadRecords(shared, { accountId: grant.claimantAccountId, tripId: grant.tripId,
    active: true, canManageShared: false, personId: null, personIds: [] });
}

// Runs on the existing owning lease/transaction; a server-checked live request grant is mandatory.
export async function readClaimProvisionalSharedOnTransaction(
  tx: ClaimResolutionTransaction,
  scopeInput: unknown,
  requestInput: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), requestId = coreUuid.parse(requestInput);
  const readGrant = async () => {
    const rows = (await tx.lease.query(
      "SELECT public.trip_claim_resolution_state('sharedGrant',$1::uuid,$2::uuid,$3::jsonb) AS result",
      [scope.actorAccountId, scope.tripId, JSON.stringify({ requestId })],
    )).rows;
    if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_SHARED_GRANT_UNAVAILABLE");
    const grant = claimRequestSnapshotSchema.shape.provisionalGrant.parse(rows[0].result);
    if (!grant) return null;
    if (grant.requestId !== requestId || grant.tripId !== scope.tripId || grant.claimantAccountId !== scope.actorAccountId || grant.state !== "ACTIVE")
      throw Error("CLAIM_SHARED_GRANT_BINDING");
    return grant;
  };
  const grant = await readGrant();
  if (!grant) return null;
  await setCoreReadIdentity(tx.lease, scope.actorAccountId, scope.tripId);
  const graph = await readCorePgGraph(tx.lease, scope.tripId);
  // Recheck after graph IO: wall-clock expiry/Source validity must not leak a stale response.
  const current = await readGrant();
  if (!current) return null;
  if (current.grantId !== grant.grantId || current.revision !== grant.revision || current.expiresAt !== grant.expiresAt)
    throw Error("CLAIM_SHARED_GRANT_CHANGED");
  return { grant: current, records: projectClaimProvisionalShared(graph, current) };
}

// Explicit own-request cache scope; neither denial nor grant changes ordinary membership/cache.
export async function readClaimProvisionalViewOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, requestInput: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), requestId = coreUuid.parse(requestInput);
  const row = await tx.request(requestId);
  if (!row) return null;
  const request = claimRequestSnapshotSchema.parse(row.snapshot);
  if (request.tripId !== scope.tripId || request.requestId !== requestId) throw Error("CLAIM_SHARED_REQUEST_BINDING");
  if (request.claimantAccountId !== scope.actorAccountId) return null;
  const shared = await readClaimProvisionalSharedOnTransaction(tx, scope, requestId);
  const observedAt = await tx.now();
  if (!Number.isFinite(Date.parse(observedAt))) throw Error("CLAIM_SHARED_CLOCK_UNAVAILABLE");
  const valid = shared && Date.parse(shared.grant.expiresAt) > Date.parse(observedAt);
  return { version: 1 as const, cacheScope: "CLAIM_PROVISIONAL" as const,
    accountId: scope.actorAccountId, tripId: scope.tripId, requestId,
    requestRevision: request.revision, observedAt,
    cacheGrant: request.provisionalGrant ? { grantId: request.provisionalGrant.grantId, revision: request.provisionalGrant.revision } : null,
    access: valid ? "GRANTED" as const : "DENIED" as const,
    grant: valid ? shared.grant : null, records: valid ? shared.records : [],
  };
}
