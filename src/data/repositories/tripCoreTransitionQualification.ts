import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  assertAccountTransitionLease,
  type AccountScope,
  type AccountTransitionLease,
} from "../auth/accountRequestContext";
import type { CoreAcceptedSnapshot, CoreDatabase } from "./tripCoreV2Repository";

// A local CAS check for an already verified collection, never a replacement for
// normal Core context checks or server authorization. The caller owns the transition.
export function prepareCoreCacheTransitionCheck(
  database: CoreDatabase,
  scope: AccountScope,
  snapshot: CoreAcceptedSnapshot,
  requiredItemIds: readonly string[],
) {
  const accountId = coreUuid.parse(scope.accountId);
  const tripId = coreUuid.parse(snapshot.actor.tripId);
  const personId = coreUuid.parse(snapshot.actor.personId);
  const generation = scope.generation;
  const ids = [...new Set(requiredItemIds.map((id) => coreUuid.parse(id)))];
  if (
    !snapshot.actor.active ||
    snapshot.actor.accountId !== accountId ||
    ids.some(
      (id) =>
        !snapshot.graph.itinerary_events.some(
          (row) => row.id === id && row.owner_account_id === accountId,
        ),
    )
  )
    throw Error("CORE_TRANSITION_CACHE_MISMATCH");
  const certificate = canonicalCoreJson(
    Object.fromEntries(
      [
        "epoch",
        "revision",
        "access_revision",
        "applied_generation",
        "actor_person_binding_hash",
        "roster_hash",
        "manifest_sha256",
        "ordinary_order_version",
      ].map((key) => [
        key,
        snapshot.certificate[key as keyof typeof snapshot.certificate],
      ]),
    ) as Json,
  );
  return async (lease: AccountTransitionLease) => {
    const assertLease = () => {
      assertAccountTransitionLease(lease);
      if (lease.generation !== generation + 1) throw Error("CORE_TRANSITION_CACHE_STALE");
    };
    assertLease();
    await database.withTransactionAsync(async () => {
      assertLease();
      const current = await database.getFirstAsync<Record<string, unknown>>(
        `SELECT c.epoch,c.revision,c.access_revision,c.applied_generation,c.actor_person_binding_hash,c.roster_hash,c.manifest_sha256,c.ordinary_order_version
         FROM trip_core_read_certificates c JOIN trip_core_scopes s ON s.account_id=c.account_id AND s.trip_id=c.trip_id
         WHERE c.account_id=? AND c.trip_id=? AND c.business_version=2 AND c.read_version=2 AND c.temporal_version=1 AND c.complete=1
         AND s.revoked=0 AND s.access_revision=c.access_revision AND s.refresh_generation=c.applied_generation`,
        accountId,
        tripId,
      );
      if (!current || canonicalCoreJson(current as Json) !== certificate)
        throw Error("CORE_TRANSITION_CACHE_STALE");
      const own = await database.getAllAsync<{ person_id: string }>(
        "SELECT person_id FROM trip_core_person_bindings WHERE account_id=? AND trip_id=? AND active=1 AND linked_account_id=?",
        accountId,
        tripId,
        accountId,
      );
      if (own.length !== 1 || own[0].person_id !== personId)
        throw Error("CORE_TRANSITION_CACHE_MISMATCH");
      for (const id of ids) {
        if (
          !(await database.getFirstAsync(
            "SELECT id FROM trip_core_itinerary_events WHERE cache_account_id=? AND trip_id=? AND id=? AND owner_account_id=?",
            accountId,
            tripId,
            id,
            accountId,
          ))
        )
          throw Error("CORE_TRANSITION_CACHE_MISMATCH");
      }
      assertLease();
    });
    assertLease();
  };
}
