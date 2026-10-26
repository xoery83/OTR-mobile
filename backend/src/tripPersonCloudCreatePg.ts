import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
} from "../../src/domain/trip/tripPersonCloudCreate";
import {
  PersonCloudCreateError,
  type TripPersonCloudCreatePort,
} from "./tripPersonCloudCreateHttp";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
export function createTripPersonCloudCreatePgPort(
  connection: CorePgConnection,
): TripPersonCloudCreatePort {
  const run = async (
    actor: string,
    trip: string,
    operation: string,
    request?: PersonCloudCreate,
  ) => {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
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
          if (request && !result)
            throw new PersonCloudCreateError(503, "PERSON_RECEIPT_MISSING");
          await lease.query("COMMIT");
          return result;
        } catch (e) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw e;
        }
      });
    } catch (e) {
      if (e instanceof PersonCloudCreateError) throw e;
      const code = (e as { code?: string }).code;
      if (code === "42501")
        throw new PersonCloudCreateError(403, "PERSON_CREATE_FORBIDDEN");
      if (code === "23505")
        throw new PersonCloudCreateError(409, "PERSON_CREATE_COLLISION");
      if (["22023", "22P02"].includes(code ?? ""))
        throw new PersonCloudCreateError(400, "PERSON_CREATE_INVALID");
      throw new PersonCloudCreateError(503, "PERSON_CREATE_UNAVAILABLE");
    }
  };
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
