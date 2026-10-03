import type * as SQLite from "expo-sqlite";

import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountUserId, TripId, TripPerson } from "@/domain/trip/person";

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
      }>(
        `SELECT m.journey_id AS tripId, m.id AS personId,
           m.display_name AS displayName,
           m.participation_active AS participationActive,
           m.participation_revision AS participationRevision
         FROM ledger_members m
         WHERE m.journey_id = ?
           AND EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.journey_id = m.journey_id AND actor.user_id = ?)
         ORDER BY m.display_name ASC, m.id ASC`,
        tripId,
        userId,
      );
      const currentUserId = await getActiveUserId();
      if (generation !== getAccountGeneration() || userId !== currentUserId) {
        throw new Error("Account changed during Trip Person read.");
      }
      return persons.map(
        ({ participationActive, participationRevision, ...person }): TripPerson => ({
          ...person,
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
