import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { tripCreateRequestSchema } from "@/domain/trip/tripCreateContract";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { readLocalTripPersonRosterWithinTransaction } from "./localTripPersonRepository";
import type { LocalPersonCreate } from "@/domain/trip/localTripPerson";
import { projectCoreDay } from "@/domain/trip/tripCoreV2Day";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  journeyCalendarDate,
  selectTodaysJourneyRows,
  type TodayClock,
} from "@/domain/trip/todaysJourney";
import type {
  CoreDatabase,
  CoreAcceptedSnapshot,
  createTripCoreV2Repository,
} from "./tripCoreV2Repository";

type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "acceptedSnapshot" | "manualReadSnapshot"
>;
// Internal owning seam: caller holds the Account gate and transaction; never UI authority.
export async function readLocalManualSnapshotWithinTransaction(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Pick<Core, "manualReadSnapshot">,
  scope: AccountRequestContext,
  accepted: CoreAcceptedSnapshot | null,
) {
  const tripId = scope.tripId;
  await assertAccountRequestContext(scope, account);
  let actor: CoreActor | undefined = accepted?.actor;
  let localRoster: LocalPersonCreate[] = [];
  if (!actor) {
    // Never replace known Core access/certificate authority with creator history.
    const known = await database.getFirstAsync<{ revoked: number }>(
      "SELECT revoked FROM trip_core_scopes WHERE account_id=? AND trip_id=?",
      scope.accountId,
      tripId,
    );
    if (known?.revoked) throw new Error("CORE_ACCESS_REVOKED");
    if (
      await database.getFirstAsync(
        "SELECT 1 FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
        scope.accountId,
        tripId,
      )
    )
      return null;
    const local = await database.getFirstAsync<{
      person_id: string;
      create_operation_id: string;
      payload_json: string;
      owner_person_id: string | null;
      accepted_at: string | null;
      capabilities_json: string;
    }>(
      `SELECT b.person_id,b.create_operation_id,op.payload_json,t.owner_person_id,t.accepted_at,a.capabilities_json
       FROM local_trip_containers t
       JOIN local_trip_ledger_bindings b ON b.account_id=t.account_id AND b.trip_id=t.id
       AND b.create_operation_id=t.create_operation_id AND b.authority='LOCAL_CREATOR'
       JOIN ledger_actor_context a ON a.user_id=t.account_id AND a.journey_id=t.id AND a.role='owner'
       AND a.member_id=CASE WHEN t.accepted_at IS NULL THEN b.person_id ELSE t.owner_person_id END
       JOIN ledger_members m ON m.id=a.member_id AND m.journey_id=t.id AND m.role='owner'
       AND m.status IN ('local','linked')
       JOIN sync_operations op ON op.id=t.create_operation_id AND op.owner_user_id=t.account_id
       AND op.trip_id=t.id AND op.entity_id=t.id AND op.idempotency_key=op.id
       AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
       WHERE t.account_id=? AND t.id=? AND (
         (t.accepted_at IS NULL AND t.owner_person_id IS NULL
          AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE'))
         OR (t.accepted_at IS NOT NULL AND t.owner_person_id IS NOT NULL AND op.status='COMPLETED'))`,
      scope.accountId,
      tripId,
    );
    if (!local) return null;
    const request = tripCreateRequestSchema.parse({
      operationId: local.create_operation_id,
      ...JSON.parse(local.payload_json),
    });
    const capabilities = JSON.parse(local.capabilities_json);
    // A normal Ledger bootstrap replaces the provisional capability marker.
    // Original CREATE provenance and the current mapped owner are still
    // required by the scoped join; Ledger readability alone grants nothing.
    const creatorReadable =
      capabilities.authority === "LOCAL_CREATOR" ||
      (local.accepted_at !== null && capabilities.canRead === true);
    if (
      request.tripId !== tripId ||
      request.operationId !== local.create_operation_id ||
      !creatorReadable
    )
      throw new Error("LOCAL_MANUAL_TRIP_PIN");
    coreUuid.parse(local.person_id);
    // acceptCreate validates the receipt and maps these fields atomically; full receipt is not retained.
    const personId = local.accepted_at
      ? coreUuid.parse(local.owner_person_id)
      : local.person_id;
    localRoster = await readLocalTripPersonRosterWithinTransaction(
      database,
      scope,
      account,
      local.create_operation_id,
    );
    actor = {
      accountId: scope.accountId,
      tripId,
      active: true,
      canManageShared: true,
      personId,
      // Local participation identities only; not an Account link or accepted certificate.
      personIds: [personId, ...localRoster.map((person) => person.personId)],
    };
  }
  const snapshot = await core.manualReadSnapshot(scope, actor, !!accepted);
  const fingerprint = localRoster.length
    ? await coreHashValue(
        "otr-local-manual-person-roster-v1",
        {
          sourceFingerprint: snapshot.fingerprint,
          localRoster,
        },
        tripCoreSha256Hex,
      )
    : snapshot.fingerprint;
  await assertAccountRequestContext(scope, account);
  return { ...snapshot, actor, fingerprint };
}

// A separate read authority; this never constructs a Hosted certificate or canonical Source.
export function createTripLocalManualReader(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
) {
  return async (tripId: string) => {
    coreUuid.parse(tripId);
    const scope = await core.captureContext(tripId);
    const accepted = await core.acceptedSnapshot(scope);
    return withAccountApplyGate(async () => {
      let result: Awaited<ReturnType<typeof collect>> | null = null;
      async function collect() {
        const snapshot = await readLocalManualSnapshotWithinTransaction(
          database,
          account,
          core,
          scope,
          accepted,
        );
        if (!snapshot) return null;
        const { actor } = snapshot;
        if (!snapshot.predictedIds.size && accepted) return null;
        const { graph, predictedIds } = snapshot;
        const source = {
          kind: "LOCAL_MANUAL_COMMITTED" as const,
          fingerprint: snapshot.fingerprint,
        };
        const items = [...predictedIds].flatMap((id) => {
          const item = projectCoreItem(graph, actor!, id, {}, "PENDING");
          return item ? [item] : [];
        });
        const rows = (date: string) => {
          assertAccountRequestGeneration(scope);
          validateCalendarDate(date);
          return projectCoreDay(
            graph,
            actor!,
            date,
            snapshot.cert?.applied_generation ?? 0,
          )
            .filter((row) => predictedIds.has(row.itemRef))
            .map((row) => ({
              ...row,
              certificateGeneration: 0,
              localState: "PENDING" as const,
            }));
        };
        await assertAccountRequestContext(scope, account);
        return {
          scope,
          source,
          operations: snapshot.operations,
          items,
          // Only current readable Item metadata; no graph or foreign Item enumeration.
          itemCreatedAt: Object.freeze(
            Object.fromEntries(
              items.map((item) => {
                const row = graph.itinerary_events.find((row) => row.id === item.itemId);
                return [
                  item.itemId,
                  typeof row?.created_at === "string" ? row.created_at : null,
                ];
              }),
            ),
          ),
          hasPendingItem(itemId: string) {
            assertAccountRequestGeneration(scope);
            return predictedIds.has(itemId);
          },
          rows,
          today(clock: TodayClock) {
            assertAccountRequestGeneration(scope);
            let date: string | null;
            try {
              date = journeyCalendarDate(clock);
            } catch {
              return null;
            }
            if (!date) return null;
            return selectTodaysJourneyRows(
              projectCoreDay(
                graph,
                actor!,
                date,
                snapshot.cert?.applied_generation ?? 0,
              ).map((row) =>
                predictedIds.has(row.itemRef)
                  ? { ...row, certificateGeneration: 0 }
                  : row,
              ),
              clock.now,
              date,
              clock.zone,
              (id) => {
                const item = graph.itinerary_events.find((item) => item.id === id);
                return {
                  from:
                    typeof item?.start_local_date === "string"
                      ? item.start_local_date
                      : undefined,
                  until:
                    typeof item?.end_local_date === "string"
                      ? item.end_local_date
                      : undefined,
                };
              },
            );
          },
        };
      }
      await database.withTransactionAsync(async () => {
        result = await collect();
      });
      await assertAccountRequestContext(scope, account);
      return result as Awaited<ReturnType<typeof collect>>;
    });
  };
}
export type LocalManualRead = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createTripLocalManualReader>>>
>;
