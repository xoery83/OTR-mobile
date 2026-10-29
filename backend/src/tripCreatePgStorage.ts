import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import {
  tripCreateWireResultSchema as tripCreateResultSchema,
  tripCreateWireRequestSchema,
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
type TripQuery = (
  sql: string,
  parameters: readonly unknown[],
  actorAccountId: string,
  tripId: string | null,
  operationId: string,
  request?: TripCreateRequest,
) => Promise<ReturnType<typeof tripCreateResultSchema.parse> | null>;

async function queryTripOnLease(
  lease: CorePgLease,
  ...[
    sql,
    parameters,
    actorAccountId,
    tripId,
    operationId,
    request,
  ]: Parameters<TripQuery>
): ReturnType<TripQuery> {
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
          ("formatVersion" in checked ? 2 : 1) !== ("formatVersion" in request ? 2 : 1) ||
          ("destinations" in request &&
            (!("destinations" in checked) ||
              JSON.stringify(checked.destinations) !==
                JSON.stringify(request.destinations))))))
  )
    throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
  if (request && !checked) throw new TripCreateError(503, "TRIP_CREATE_RESULT_INVALID");
  await finiteScope();
  return checked;
}
function tripStorage(query: TripQuery): TripCreatePort {
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

export function createTripPgStorage(connection: CorePgConnection): TripCreatePort {
  const query: TripQuery = async (...args) => {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const result = await queryTripOnLease(lease, ...args);
          await lease.query("COMMIT");
          return result;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof TripCreateError) throw error;
      classify(error);
    }
  };
  return tripStorage(query);
}

// Internal composition only: caller owns the running transaction and authorized principal.
export async function withTripPgStorageOnTransaction<T>(
  lease: CorePgLease,
  work: (storage: TripCreatePort) => Promise<T>,
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
    if (!active) throw new TripCreateError(503, "TRIP_CREATE_TRANSACTION_RELEASED");
    if (retired) throw new TripCreateError(503, "TRIP_CREATE_TRANSACTION_FAILED");
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
      if (pending) throw new TripCreateError(503, "TRIP_CREATE_TRANSACTION_BUSY");
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
          error instanceof TripCreateError
            ? error
            : new TripCreateError(503, "TRIP_CREATE_UNAVAILABLE");
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
  const query: TripQuery = async (...args) => {
    try {
      return await queryTripOnLease(scopedLease, ...args);
    } catch (error) {
      if (error instanceof TripCreateError) throw error;
      classify(error);
    }
  };
  const port = tripStorage(query);
  const bounded: TripCreatePort = Object.freeze({
    create: (actorAccountId: string, input: TripCreateRequest) =>
      run(() => port.create(actorAccountId, tripCreateWireRequestSchema.parse(input))),
    receipt: (...args) => run(() => port.receipt(...args)),
  });
  try {
    const result = await work(bounded);
    if (pending) throw new TripCreateError(503, "TRIP_CREATE_TRANSACTION_WORK_PENDING");
    if (state.failure) throw state.failure.error;
    return result;
  } catch (error) {
    active = false;
    // The caller's transaction is unusable after any partial or unawaited operation.
    invalidate(error);
    const cause = state.failure?.error;
    if (cause instanceof TripCreateError) throw cause;
    throw new TripCreateError(503, "TRIP_CREATE_UNAVAILABLE");
  } finally {
    active = false;
  }
}
