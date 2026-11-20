import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  tripLifecycleRequestSchema,
  tripLifecycleReceiptSchema,
  tripLifecycleBaseSchema,
  type TripLifecycleRequest,
  type TripLifecycleReceipt,
  type TripLifecycleBase,
} from "../../src/domain/trip/tripLifecycleContract";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import { TripMetadataError } from "./tripMetadata";
import type { ManagedWriteAdmission } from "./managedWriteAdmission";
export type TripLifecyclePort = {
  base(actor: string, trip: string): Promise<TripLifecycleBase>;
  apply(
    actor: string,
    request: TripLifecycleRequest,
    admit?: ManagedWriteAdmission,
  ): Promise<TripLifecycleReceipt>;
  receipt(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<TripLifecycleReceipt | null>;
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
export async function tripLifecycleBoundary(
  request: Request,
  actor: string,
  port?: TripLifecyclePort,
  managedWriteAdmission?: ManagedWriteAdmission,
) {
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const match = /^\/v2\/trips\/([^/]+)\/(lifecycle|lifecycle-operations\/([^/]+))$/.exec(
    url.pathname,
  );
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    url.search ||
    (match[3] && !coreUuid.safeParse(match[3]).success)
  )
    return fail(400, "INVALID_PAYLOAD");
  if (!port) return fail(503, "CAPABILITY_UNAVAILABLE");
  try {
    if (request.method === "GET" && request.body === null) {
      const result = match[3]
        ? await port.receipt(actor, match[1], match[3])
        : await port.base(actor, match[1]);
      if (!result) return fail(404, "OPERATION_UNKNOWN");
      const checked = match[3]
        ? tripLifecycleReceiptSchema.parse(result)
        : tripLifecycleBaseSchema.parse(result);
      if (
        checked.actorAccountId !== actor ||
        checked.tripId !== match[1] ||
        (match[3] && (checked as TripLifecycleReceipt).operationId !== match[3])
      )
        return fail(503, "RESULT_MISMATCH");
      return reply(200, checked);
    }
    if (request.method !== "POST" || match[3]) return fail(405, "METHOD_NOT_ALLOWED");
    const boundary = createRequestBoundary(15000, request.signal);
    let input;
    try {
      input = tripLifecycleRequestSchema.safeParse(
        await readBoundedJson(new Response(request.body), 8192, boundary),
      );
    } catch {
      return fail(400, "INVALID_PAYLOAD");
    } finally {
      boundary.close();
    }
    if (
      !input.success ||
      input.data.tripId !== match[1] ||
      request.headers.get("Idempotency-Key") !== input.data.operationId
    )
      return fail(400, "INVALID_PAYLOAD");
    const result = tripLifecycleReceiptSchema.parse(
      managedWriteAdmission
        ? await port.apply(actor, input.data, managedWriteAdmission)
        : await port.apply(actor, input.data),
    );
    if (
      result.actorAccountId !== actor ||
      canonicalCoreJson(result.request as unknown as Json) !==
        canonicalCoreJson(input.data as unknown as Json)
    )
      return fail(503, "RESULT_MISMATCH");
    return reply(
      result.outcome === "CONFLICT" ? 409 : result.outcome === "REJECTED" ? 422 : 200,
      result,
    );
  } catch (error) {
    return error instanceof TripMetadataError
      ? fail(error.status, error.code)
      : fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
export function createTripLifecyclePgStorage(
  connection: CorePgConnection,
  admit?: (
    lease: CorePgLease,
    actor: string,
    request: TripLifecycleRequest,
  ) => Promise<void>,
): TripLifecyclePort {
  async function query<T>(
    actor: string,
    trip: string,
    sql: string,
    parameters: readonly unknown[],
    schema: z.ZodType<T>,
    mutation?: TripLifecycleRequest,
    managedWriteAdmission?: ManagedWriteAdmission,
  ): Promise<T> {
    try {
      return await connection.withLease(async (lease) => {
        await lease.query(
          sql.includes("trip_lifecycle_base(")
            ? "BEGIN ISOLATION LEVEL REPEATABLE READ"
            : "BEGIN",
        );
        try {
          if (mutation?.action === "DELETE" && !admit)
            throw new TripMetadataError(403, "L3_TRUSTED_APPROVAL_REQUIRED");
          if (mutation && managedWriteAdmission) {
            await lease.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
            if (!(await managedWriteAdmission(actor, mutation)))
              throw new TripMetadataError(401, "MCP_WRITE_ADMISSION_DENIED");
            await lease.query("SET LOCAL idle_in_transaction_session_timeout TO DEFAULT");
          }
          // Take the Consent lock after the Managed Auth call has released its separate Core lease.
          if (mutation && admit) await admit(lease, actor, mutation);
          const result = schema.parse(
            (await lease.query(sql, parameters)).rows[0]?.result,
          );
          if (
            result !== null &&
            ((result as TripLifecycleBase).actorAccountId !== actor ||
              (result as TripLifecycleBase).tripId !== trip)
          )
            throw new TripMetadataError(503, "RESULT_MISMATCH");
          await lease.query("COMMIT");
          return result;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof TripMetadataError) throw error;
      const code = (error as { code?: string }).code;
      throw new TripMetadataError(
        code === "42501"
          ? 403
          : ["23505", "40001"].includes(code ?? "")
            ? 409
            : code === "22023"
              ? 400
              : 503,
        code === "42501"
          ? "FORBIDDEN"
          : code === "23505"
            ? "IDEMPOTENCY_CONFLICT"
            : code === "22023"
              ? "INVALID_PAYLOAD"
              : "CAPABILITY_UNAVAILABLE",
      );
    }
  }
  return {
    base: (actor, trip) =>
      query(
        actor,
        trip,
        "SELECT public.trip_lifecycle_base($1::uuid,$2::uuid) AS result",
        [actor, trip],
        tripLifecycleBaseSchema,
      ),
    apply: (actor, input, managedWriteAdmission) =>
      query(
        actor,
        input.tripId,
        "SELECT public.trip_lifecycle_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS result",
        [actor, input.tripId, input.operationId, JSON.stringify(input)],
        tripLifecycleReceiptSchema,
        input,
        managedWriteAdmission,
      ),
    receipt: (actor, trip, operation) =>
      query(
        actor,
        trip,
        "SELECT public.trip_lifecycle_result($1::uuid,$2::uuid,$3::uuid) AS result",
        [actor, trip, operation],
        tripLifecycleReceiptSchema.nullable(),
      ),
  };
}
