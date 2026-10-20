import type * as SQLite from "expo-sqlite";

import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountUserId, TripId, TripPerson } from "@/domain/trip/person";
import { localPersonCreateKind } from "@/domain/trip/localTripPerson";

export function createTripPersonRepository(
  database: Pick<SQLite.SQLiteDatabase, "getAllAsync">,
  getActiveUserId: () => Promise<AccountUserId>,
) {
  return {
    async listTripPersons(tripId: TripId): Promise<TripPerson[]> {
      const generation = getAccountGeneration();
      const userId = await getActiveUserId();
      // Shared Member cache is readable only in the current account's hydrated
      // Journey context. Person existence/role/status never grants permission.
      const persons = await database.getAllAsync<{
        tripId: TripId;
        personId: string;
        displayName: string;
        participationActive: number | null;
        participationRevision: number | null;
        localPending: number;
      }>(
        `SELECT m.journey_id AS tripId, m.id AS personId,
           m.display_name AS displayName,
           m.participation_active AS participationActive,
           m.participation_revision AS participationRevision,
           EXISTS (SELECT 1 FROM sync_operations op WHERE op.owner_user_id=?
             AND op.trip_id=m.journey_id AND op.entity_id=m.id
             AND op.entity_type='TRIP_PERSON' AND op.operation_type=?
             AND op.status<>'COMPLETED' AND m.status='local'
             AND m.participation_revision IS NULL) AS localPending
         FROM ledger_members m
         WHERE m.journey_id = ?
           AND EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.journey_id = m.journey_id AND actor.user_id = ?)
         ORDER BY m.display_name ASC, m.id ASC`,
        userId,
        localPersonCreateKind,
        tripId,
        userId,
      );
      const currentUserId = await getActiveUserId();
      if (generation !== getAccountGeneration() || userId !== currentUserId) {
        throw new Error("Account changed during Trip Person read.");
      }
      return persons.map(
        ({
          participationActive,
          participationRevision,
          localPending,
          ...person
        }): TripPerson => ({
          ...person,
          ...(localPending ? { localState: "LOCAL_PENDING" as const } : {}),
          participation:
            participationRevision === null
              ? null
              : {
                  isParticipating: participationActive === 1,
                  revision: participationRevision,
                },
        }),
      );
    },
  };
}
