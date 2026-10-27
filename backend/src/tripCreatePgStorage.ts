import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  tripCreateWireResultSchema as tripCreateResultSchema,
  type TripCreateWireRequest as TripCreateRequest,
} from "../../src/domain/trip/tripCreateWireContract";
import { TripCreateError, type TripCreatePort } from "./tripCreate";

type PgFailure = Error & { code?: string };
function classify(error: unknown): never {
  const pg = error as PgFailure;
  if (pg.code === "55000") throw new TripCreateError(503, "TRIP_CREATE_CLOSED");
  if (pg.code === "23505") throw new TripCreateError(409, "TRIP_CREATE_COLLISION");
  if (pg.code === "42501") throw new TripCreateError(403, "TRIP_CREATE_FORBIDDEN");
  if (["22023", "22P02", "22007", "22008"].includes(pg.code ?? ""))
    throw new TripCreateError(400, "TRIP_CREATE_INVALID");
  throw new TripCreateError(503, "TRIP_CREATE_UNAVAILABLE");
}
export function createTripPgStorage(connection: CorePgConnection): TripCreatePort {
  async function query(
    sql: string,
    parameters: readonly unknown[],
    actorAccountId: string,
    tripId: string | null,
    operationId: string,
    request?: TripCreateRequest,
  ) {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const finiteScope = async () => {
            const allowed = (
              await lease.query(
                "SELECT public.trip_create_finite_scope_allowed($1::uuid,$2::uuid,$3::uuid) AS allowed",
                [actorAccountId, tripId, operationId],
              )
            ).rows[0]?.allowed;
            if (allowed !== true) throw new TripCreateError(503, "TRIP_CREATE_CLOSED");
          };
          await finiteScope();
          const rows = (await lease.query(sql, parameters)).rows;
          const result = rows[0]?.result;
          const checked = result === null ? null : tripCreateResultSchema.parse(result);
          if (
            checked &&
            (checked.actorAccountId !== actorAccountId ||
              checked.operationId !== operationId ||
              (tripId !== null && checked.tripId !== tripId) ||
              (request &&
                (checked.name !== request.name ||
                  checked.destination !== request.destination ||
                  checked.startDate !== request.startDate ||
                  checked.endDate !== request.endDate ||
                  ("formatVersion" in checked ? 2 : 1) !==
                    ("formatVersion" in request ? 2 : 1) ||
                  ("destinations" in request &&
                    (!("destinations" in checked) ||
                      JSON.stringify(checked.destinations) !==
                        JSON.stringify(request.destinations))))))
          )
            throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
          if (request && !checked)
            throw new TripCreateError(503, "TRIP_CREATE_RESULT_INVALID");
          await finiteScope();
          await lease.query("COMMIT");
          return checked;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof TripCreateError) throw error;
      classify(error);
    }
  }
  return {
    async create(actorAccountId, input: TripCreateRequest) {
      const result = await query(
        "formatVersion" in input
          ? "SELECT public.trip_create_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS result"
          : "SELECT public.trip_create_command($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::date,$7::date) AS result",
        "formatVersion" in input
          ? [input.operationId, actorAccountId, input.tripId, JSON.stringify(input)]
          : [
              input.operationId,
              actorAccountId,
              input.tripId,
              input.name,
              input.destination,
              input.startDate,
              input.endDate,
            ],
        actorAccountId,
        input.tripId,
        input.operationId,
        input,
      );
      if (!result) throw new TripCreateError(503, "TRIP_CREATE_RESULT_INVALID");
      return result;
    },
    receipt(actorAccountId, operationId) {
      return query(
        "SELECT public.trip_create_result($1::uuid,$2::uuid) AS result",
        [operationId, actorAccountId],
        actorAccountId,
        null,
        operationId,
      );
    },
  };
}
