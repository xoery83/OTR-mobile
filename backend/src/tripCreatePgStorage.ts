import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  tripCreateResultSchema,
  type TripCreateRequest,
} from "../../src/domain/trip/tripCreateContract";
import { TripCreateError, type TripCreatePort } from "./tripCreate";

type PgFailure = Error & { code?: string };
function classify(error: unknown): never {
  const pg = error as PgFailure;
  if (pg.code === "23505") throw new TripCreateError(409, "TRIP_CREATE_COLLISION");
  if (pg.code === "42501") throw new TripCreateError(403, "TRIP_CREATE_FORBIDDEN");
  if (pg.code === "22023" || pg.code === "22P02")
    throw new TripCreateError(400, "TRIP_CREATE_INVALID");
  throw new TripCreateError(503, "TRIP_CREATE_UNAVAILABLE");
}
export function createTripPgStorage(connection: CorePgConnection): TripCreatePort {
  async function query(sql: string, parameters: readonly unknown[]) {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const rows = (await lease.query(sql, parameters)).rows;
          const result = rows[0]?.result;
          const checked = result === null ? null : tripCreateResultSchema.parse(result);
          await lease.query("COMMIT");
          return checked;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      classify(error);
    }
  }
  return {
    async create(actorAccountId, input: TripCreateRequest) {
      const result = await query(
        "SELECT public.trip_create_command($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::date,$7::date) AS result",
        [
          input.operationId,
          actorAccountId,
          input.tripId,
          input.name,
          input.destination,
          input.startDate,
          input.endDate,
        ],
      );
      if (!result) throw new TripCreateError(503, "TRIP_CREATE_RESULT_INVALID");
      return result;
    },
    receipt(actorAccountId, operationId) {
      return query("SELECT public.trip_create_result($1::uuid,$2::uuid) AS result", [
        operationId,
        actorAccountId,
      ]);
    },
  };
}
