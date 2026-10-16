import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import { tripCreateRequestSchema } from "@/domain/trip/tripCreateContract";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { projectCoreDay } from "@/domain/trip/tripCoreV2Day";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import { selectTodaysJourneyRows, type TodayClock } from "@/domain/trip/todaysJourney";
import type { CoreDatabase, createTripCoreV2Repository } from "./tripCoreV2Repository";

type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "acceptedSnapshot" | "manualReadSnapshot"
>;
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
        await assertAccountRequestContext(scope, account);
        let actor: CoreActor | undefined = accepted?.actor;
        if (!actor) {
          const local = await database.getFirstAsync<{
            person_id: string;
            create_operation_id: string;
            payload_json: string;
          }>(
            `SELECT b.person_id,b.create_operation_id,op.payload_json FROM local_trip_containers t
             JOIN local_trip_ledger_bindings b ON b.account_id=t.account_id AND b.trip_id=t.id
             AND b.create_operation_id=t.create_operation_id
             JOIN sync_operations op ON op.id=t.create_operation_id AND op.owner_user_id=t.account_id
             AND op.trip_id=t.id AND op.entity_id=t.id AND op.idempotency_key=op.id
             AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
             AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE')
             WHERE t.account_id=? AND t.id=? AND t.accepted_at IS NULL`,
            scope.accountId,
            tripId,
          );
          if (!local) return null;
          const request = tripCreateRequestSchema.parse({
            operationId: local.create_operation_id,
            ...JSON.parse(local.payload_json),
          });
          if (
            request.tripId !== tripId ||
            request.operationId !== local.create_operation_id
          )
            throw new Error("LOCAL_MANUAL_TRIP_PIN");
          coreUuid.parse(local.person_id);
          actor = {
            accountId: scope.accountId,
            tripId,
            active: true,
            canManageShared: true,
            personId: local.person_id,
            personIds: [local.person_id],
          };
        }
        const snapshot = await core.manualReadSnapshot(scope, actor, !!accepted);
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
          rows,
          today(clock: TodayClock) {
            assertAccountRequestGeneration(scope);
            if (
              !clock.zone ||
              clock.zone !== clock.zone.trim() ||
              /^[+-]/.test(clock.zone)
            )
              return null;
            let date: string;
            try {
              date = localCalendarDate(clock.now, clock.zone);
            } catch {
              return null;
            }
            return selectTodaysJourneyRows(
              projectCoreDay(graph, actor!, date, snapshot.cert?.applied_generation ?? 0),
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
