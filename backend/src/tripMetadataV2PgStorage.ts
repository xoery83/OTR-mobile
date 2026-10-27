import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  tripMetadataRevisionedReceiptSchema,
  tripMetadataRevisionedSnapshotSchema,
} from "../../src/domain/trip/tripMetadataV2Contract";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import { TripMetadataError } from "./tripMetadata";
export function createTripMetadataV2PgStorage(
  connection: CorePgConnection,
): TripMetadataV2Port {
  async function query(
    sql: string,
    parameters: readonly unknown[],
    actor: string,
    trip: string | null,
    operation: string,
    kind: "update" | "receipt" | "snapshot",
  ) {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        const scope = async () => {
          const result = await lease.query(
            "SELECT public.trip_metadata_finite_scope_allowed($1::uuid,$2::uuid,$3::uuid) AS allowed",
            [actor, trip, operation],
          );
          if (result.rows[0]?.allowed !== true)
            throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
        };
        try {
          await scope();
          const result = (await lease.query(sql, parameters)).rows[0]?.result;
          const checked =
            result === null && kind === "receipt"
              ? null
              : kind === "snapshot"
                ? tripMetadataRevisionedSnapshotSchema.parse(result)
                : tripMetadataRevisionedReceiptSchema.parse(result);
          if (
            checked !== null &&
            (checked.actorAccountId !== actor ||
              (trip !== null && checked.tripId !== trip) ||
              ("operationId" in checked && checked.operationId !== operation))
          )
            throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
          await scope();
          await lease.query("COMMIT");
          return checked;
        } catch (e) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw e;
        }
      });
    } catch (e) {
      if (e instanceof TripMetadataError) throw e;
      const code = (e as { code?: string }).code;
      if (code === "55000") throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
      if (code === "40001") throw new TripMetadataError(409, "TRIP_METADATA_CONFLICT");
      if (code === "23505") throw new TripMetadataError(409, "TRIP_METADATA_COLLISION");
      if (code === "42501") throw new TripMetadataError(403, "TRIP_METADATA_FORBIDDEN");
      if (["22023", "22P02", "22007", "22008"].includes(code ?? ""))
        throw new TripMetadataError(400, "TRIP_METADATA_INVALID");
      throw new TripMetadataError(503, "TRIP_METADATA_UNAVAILABLE");
    }
  }
  return {
    async update(actor, input) {
      return tripMetadataRevisionedReceiptSchema.parse(
        await query(
          "SELECT public.trip_metadata_update_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS result",
          [input.operationId, actor, input.tripId, JSON.stringify(input)],
          actor,
          input.tripId,
          input.operationId,
          "update",
        ),
      );
    },
    async receipt(actor, operation) {
      const result = await query(
        "SELECT public.trip_metadata_update_result($1::uuid,$2::uuid) AS result",
        [operation, actor],
        actor,
        null,
        operation,
        "receipt",
      );
      return result === null ? null : tripMetadataRevisionedReceiptSchema.parse(result);
    },
    async snapshot(actor, trip, operation) {
      return tripMetadataRevisionedSnapshotSchema.parse(
        await query(
          "SELECT public.trip_metadata_snapshot($1::uuid,$2::uuid,$3::uuid) AS result",
          [actor, trip, operation],
          actor,
          trip,
          operation,
          "snapshot",
        ),
      );
    },
  };
}
