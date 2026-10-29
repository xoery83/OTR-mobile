import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import {
  tripMetadataRevisionedReceiptSchema,
  tripMetadataRevisionedUpdateSchema,
  type TripMetadataRevisionedUpdate,
  tripMetadataRevisionedSnapshotSchema,
} from "../../src/domain/trip/tripMetadataV2Contract";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import { TripMetadataError } from "./tripMetadata";
type MetadataQuery = (
  sql: string,
  parameters: readonly unknown[],
  actor: string,
  trip: string | null,
  operation: string,
  kind: "update" | "receipt" | "snapshot",
) => Promise<
  | ReturnType<typeof tripMetadataRevisionedReceiptSchema.parse>
  | ReturnType<typeof tripMetadataRevisionedSnapshotSchema.parse>
  | null
>;
function classify(e: unknown): never {
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
async function queryMetadataOnLease(
  lease: CorePgLease,
  ...[sql, parameters, actor, trip, operation, kind]: Parameters<MetadataQuery>
): ReturnType<MetadataQuery> {
  const scope = async () => {
    const result = await lease.query(
      "SELECT public.trip_metadata_finite_scope_allowed($1::uuid,$2::uuid,$3::uuid) AS allowed",
      [actor, trip, operation],
    );
    if (result.rows[0]?.allowed !== true)
      throw new TripMetadataError(503, "TRIP_METADATA_CLOSED");
  };
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
  return checked;
}
function metadataStorage(query: MetadataQuery): TripMetadataV2Port {
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
export function createTripMetadataV2PgStorage(
  connection: CorePgConnection,
): TripMetadataV2Port {
  const query: MetadataQuery = async (...args) => {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const result = await queryMetadataOnLease(lease, ...args);
          await lease.query("COMMIT");
          return result;
        } catch (e) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw e;
        }
      });
    } catch (e) {
      classify(e);
    }
  };
  return metadataStorage(query);
}

// Internal composition only: caller owns the running transaction and authorized principal.
export async function withTripMetadataV2PgStorageOnTransaction<T>(
  lease: CorePgLease,
  work: (storage: TripMetadataV2Port) => Promise<T>,
): Promise<T> {
  let active = true,
    pending = 0;
  const state = { failure: null as { error: unknown } | null };
  let retired = false;
  function invalidate(error: unknown) {
    state.failure ??= { error };
    if (!retired) {
      retired = true;
      try {
        lease.retire();
      } catch {
        /* Owning scope still performs final cleanup. */
      }
    }
  }
  const assertActive = () => {
    if (!active) throw new TripMetadataError(503, "TRIP_METADATA_TRANSACTION_RELEASED");
    if (retired) throw new TripMetadataError(503, "TRIP_METADATA_TRANSACTION_FAILED");
  };
  const scopedLease: CorePgLease = {
    retire: () => {
      assertActive();
      lease.retire();
    },
    async query(sql, parameters) {
      assertActive();
      const result = await lease.query(sql, parameters);
      assertActive();
      return result;
    },
  };
  function run<R>(task: () => Promise<R>): Promise<R> {
    try {
      assertActive();
      if (pending) throw new TripMetadataError(503, "TRIP_METADATA_TRANSACTION_BUSY");
    } catch (error) {
      invalidate(error);
      const rejected = Promise.reject<R>(error);
      void rejected.catch(() => {});
      return rejected;
    }
    pending++;
    const result = (async () => {
      try {
        return await task();
      } catch (error) {
        const bounded =
          error instanceof TripMetadataError
            ? error
            : new TripMetadataError(503, "TRIP_METADATA_UNAVAILABLE");
        invalidate(bounded);
        throw bounded;
      } finally {
        pending--;
      }
    })();
    void result.catch((error: unknown) => {
      invalidate(error);
    });
    return result;
  }
  const query: MetadataQuery = async (...args) => {
    try {
      return await queryMetadataOnLease(scopedLease, ...args);
    } catch (error) {
      if (error instanceof TripMetadataError) throw error;
      classify(error);
    }
  };
  const port = metadataStorage(query);
  const bounded: TripMetadataV2Port = Object.freeze({
    update: (actor: string, input: TripMetadataRevisionedUpdate) =>
      run(() => port.update(actor, tripMetadataRevisionedUpdateSchema.parse(input))),
    receipt: (...args) => run(() => port.receipt(...args)),
    snapshot: (...args) => run(() => port.snapshot(...args)),
  });
  try {
    const result = await work(bounded);
    if (pending)
      throw new TripMetadataError(503, "TRIP_METADATA_TRANSACTION_WORK_PENDING");
    if (state.failure) throw state.failure.error;
    return result;
  } catch (error) {
    active = false;
    // The caller's transaction is unusable after any partial or unawaited operation.
    invalidate(error);
    const cause = state.failure?.error;
    if (cause instanceof TripMetadataError) throw cause;
    throw new TripMetadataError(503, "TRIP_METADATA_UNAVAILABLE");
  } finally {
    active = false;
  }
}
