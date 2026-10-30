import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
} from "../../src/domain/trip/tripPersonCloudCreate";
import {
  PersonCloudCreateError,
  type TripPersonCloudCreatePort,
} from "./tripPersonCloudCreateHttp";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
type PersonQuery = (
  actor: string,
  trip: string,
  operation: string,
  request?: PersonCloudCreate,
) => Promise<ReturnType<typeof personCloudCreateReceiptSchema.parse> | null>;

function classify(error: unknown): never {
  if (error instanceof PersonCloudCreateError) throw error;
  const code = (error as { code?: string })?.code;
  if (code === "42501") throw new PersonCloudCreateError(403, "PERSON_CREATE_FORBIDDEN");
  if (code === "23505") throw new PersonCloudCreateError(409, "PERSON_CREATE_COLLISION");
  if (["22023", "22P02"].includes(code ?? ""))
    throw new PersonCloudCreateError(400, "PERSON_CREATE_INVALID");
  throw new PersonCloudCreateError(503, "PERSON_CREATE_UNAVAILABLE");
}
async function queryPersonOnLease(
  lease: CorePgLease,
  ...[actor, trip, operation, request]: Parameters<PersonQuery>
): ReturnType<PersonQuery> {
  const raw = (
    await lease.query(
      request
        ? "SELECT public.trip_person_cloud_create_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS result"
        : "SELECT public.trip_person_cloud_create_result($1::uuid,$2::uuid,$3::uuid) AS result",
      request
        ? [actor, trip, operation, JSON.stringify(request)]
        : [actor, trip, operation],
    )
  ).rows[0]?.result;
  const result = raw === null ? null : personCloudCreateReceiptSchema.parse(raw);
  if (
    result &&
    (result.actorAccountId !== actor ||
      result.request.tripId !== trip ||
      result.request.operationId !== operation ||
      (request &&
        canonicalCoreJson(result.request as unknown as Json) !==
          canonicalCoreJson(request as unknown as Json)))
  )
    throw new PersonCloudCreateError(503, "PERSON_RECEIPT_BINDING");
  if (request && !result) throw new PersonCloudCreateError(503, "PERSON_RECEIPT_MISSING");
  return result;
}
function personStorage(run: PersonQuery): TripPersonCloudCreatePort {
  return {
    async create(actor, request) {
      const parsed = personCloudCreateSchema.parse(request);
      return (await run(actor, parsed.tripId, parsed.operationId, parsed))!;
    },
    receipt(actor, trip, operation) {
      return run(actor, trip, operation);
    },
  };
}
export function createTripPersonCloudCreatePgPort(
  connection: CorePgConnection,
): TripPersonCloudCreatePort {
  return personStorage(async (...args) => {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const result = await queryPersonOnLease(lease, ...args);
          await lease.query("COMMIT");
          return result;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      classify(error);
    }
  });
}

// Internal composition only: the caller owns the transaction and SQL authorization.
export async function withTripPersonCloudCreateOnTransaction<T>(
  lease: CorePgLease,
  work: (storage: TripPersonCloudCreatePort) => Promise<T>,
): Promise<T> {
  let active = true,
    pending = 0,
    retired = false;
  const state = { failure: null as { error: unknown } | null };
  const invalidate = (error: unknown) => {
    state.failure ??= { error };
    if (!retired) {
      retired = true;
      try {
        lease.retire();
      } catch {
        /* Owning transaction still fails closed. */
      }
    }
  };
  const assertActive = () => {
    if (!active) throw new PersonCloudCreateError(503, "PERSON_TRANSACTION_RELEASED");
    if (retired) throw new PersonCloudCreateError(503, "PERSON_TRANSACTION_FAILED");
  };
  const scopedLease: CorePgLease = {
    retire() {
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
  const port = personStorage((...args) => queryPersonOnLease(scopedLease, ...args));
  function run<R>(task: () => Promise<R>): Promise<R> {
    try {
      assertActive();
      if (pending) throw new PersonCloudCreateError(503, "PERSON_TRANSACTION_BUSY");
    } catch (error) {
      invalidate(error);
      const result = Promise.reject<R>(error);
      void result.catch(() => {});
      return result;
    }
    pending++;
    const result = (async () => {
      try {
        return await task();
      } catch (error) {
        invalidate(error);
        classify(error);
      } finally {
        pending--;
      }
    })();
    void result.catch(invalidate);
    return result;
  }
  const bounded: TripPersonCloudCreatePort = Object.freeze({
    create: (actor: string, request: PersonCloudCreate) =>
      run(() => port.create(actor, request)),
    receipt: (actor: string, trip: string, operation: string) =>
      run(() => port.receipt(actor, trip, operation)),
  });
  try {
    const result = await work(bounded);
    if (pending) throw new PersonCloudCreateError(503, "PERSON_TRANSACTION_WORK_PENDING");
    if (state.failure) throw state.failure.error;
    return result;
  } catch (error) {
    active = false;
    invalidate(error);
    classify(state.failure?.error);
  } finally {
    active = false;
  }
}
