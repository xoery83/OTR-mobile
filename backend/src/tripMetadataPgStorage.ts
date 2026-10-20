import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  tripMetadataReceiptSchema,
  type TripMetadataUpdate,
} from "../../src/domain/trip/tripMetadataContract";
import { TripMetadataError, type TripMetadataPort } from "./tripMetadata";

type PgFailure = Error & { code?: string };
function classify(error: unknown): never {
  const pg = error as PgFailure;
  if (pg.code === "55000") throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
  if (pg.code === "40001") throw new TripMetadataError(409, "TRIP_METADATA_CONFLICT");
  if (pg.code === "23505") throw new TripMetadataError(409, "TRIP_METADATA_COLLISION");
  if (pg.code === "42501") throw new TripMetadataError(403, "TRIP_METADATA_FORBIDDEN");
  if (["22023", "22P02", "22007", "22008"].includes(pg.code ?? ""))
    throw new TripMetadataError(400, "TRIP_METADATA_INVALID");
  throw new TripMetadataError(503, "TRIP_METADATA_UNAVAILABLE");
}
export function createTripMetadataPgStorage(
  connection: CorePgConnection,
): TripMetadataPort {
  async function query(
    sql: string,
    parameters: readonly unknown[],
    actorAccountId: string,
    tripId: string | null,
  ) {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const finiteScope = async () => {
            const allowed = (
              await lease.query(
                "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
                [actorAccountId, tripId],
              )
            ).rows[0]?.allowed;
            if (allowed !== true)
              throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
          };
          await finiteScope();
          const rows = (await lease.query(sql, parameters)).rows;
          const result = rows[0]?.result;
          const checked =
            result === null ? null : tripMetadataReceiptSchema.parse(result);
          await finiteScope();
          await lease.query("COMMIT");
          return checked;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof TripMetadataError) throw error;
      classify(error);
    }
  }
  return {
    async update(actorAccountId, input: TripMetadataUpdate) {
      const result = await query(
        "SELECT public.trip_metadata_update_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS result",
        [input.operationId, actorAccountId, input.tripId, JSON.stringify(input)],
        actorAccountId,
        input.tripId,
      );
      if (!result) throw new TripMetadataError(503, "TRIP_METADATA_RESULT_INVALID");
      return result;
    },
    receipt(actorAccountId, operationId) {
      return query(
        "SELECT public.trip_metadata_update_result($1::uuid,$2::uuid) AS result",
        [operationId, actorAccountId],
        actorAccountId,
        null,
      );
    },
  };
}
