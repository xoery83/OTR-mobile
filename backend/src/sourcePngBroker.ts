import { z } from "zod";
import {
  sourcePngPreparationCommandSchema,
  sourcePngPendingReplySchema,
} from "../../src/domain/trip/sourcePngPreparationCommands";
import { sourceBinaryOriginalReceiptSchema } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { universalPgTransaction } from "./universalPg";

export type SourcePngBrokerAction =
  | "REGISTER"
  | "BEGIN"
  | "STATUS"
  | "RECONCILE"
  | "UNKNOWN"
  | "FINALIZE"
  | "EXEC_CLAIM"
  | "EXEC_ATTACH"
  | "EXEC_ADVANCE"
  | "EXEC_TERMINAL"
  | "EXEC_RELEASE"
  | "EXEC_CLEANED";
export type SourcePngBrokerScope = {
  actorId: string;
  tripId: string;
  signal: AbortSignal;
};
const operation = sourcePngPendingReplySchema.or(sourceBinaryOriginalReceiptSchema);
// Private owning response. Only operation may cross the authenticated Native boundary.
const response = z
  .object({
    operation: operation.nullable(),
    journal: z.record(z.string(), z.json()).nullable(),
    freshAttempt: z.boolean(),
  })
  .passthrough();

// Stateless adapter to the existing Source journal, not another queue or permission issuer.
export function createSourcePngBroker(
  connection: CorePgConnection,
  assertCurrent: (scope: SourcePngBrokerScope) => Promise<void>,
  assertRequestCurrent: () => void,
) {
  return async (
    scope: SourcePngBrokerScope,
    raw: z.infer<typeof sourcePngPreparationCommandSchema>,
    action: SourcePngBrokerAction,
    expected: Json = null,
    proof: Json = null,
  ) => {
    const q = sourcePngPreparationCommandSchema.parse(raw);
    if (scope.actorId !== q.actor_account_id || scope.tripId !== q.trip_id)
      throw Error("SOURCE_ACCESS_DENIED");
    let phase = "AUTH";
    try {
      scope.signal.throwIfAborted();
      assertRequestCurrent();
      // Remote Auth/Trip IO must finish before BEGIN: Source permits only 5s idle.
      await assertCurrent(scope);
      scope.signal.throwIfAborted();
      assertRequestCurrent();
      phase = "LEASE_BEGIN";
      const result = await universalPgTransaction(
        connection,
        async (lease) => {
          scope.signal.throwIfAborted();
          phase = "PRINCIPAL";
          const identity = (
            await lease.query("SELECT session_user AS principal,current_user AS role")
          ).rows[0];
          if (
            identity?.principal !== "otr_trip_source_command_gateway" ||
            identity.role !== "otr_trip_source_command_gateway"
          )
            throw Error("SOURCE_PRINCIPAL_UNAVAILABLE");
          scope.signal.throwIfAborted();
          assertRequestCurrent();
          scope.signal.throwIfAborted();
          phase = "RPC";
          const reply = await lease.query(
            "SELECT public.trip_source_png_operation($1::uuid,$2::text,$3::text,$4::jsonb,$5::jsonb) AS result",
            [
              scope.actorId,
              canonicalCoreJson(q),
              action,
              canonicalCoreJson(expected),
              canonicalCoreJson(proof),
            ],
          );
          phase = "REPLY";
          const parsed = response.parse(reply.rows[0]?.result);
          phase = "COMMIT";
          return parsed;
        },
        false,
        () => {
          scope.signal.throwIfAborted();
          assertRequestCurrent();
        },
      );
      phase = "RESULT_FENCE";
      // A lost/late response never authorizes another attempt or remote POST.
      scope.signal.throwIfAborted();
      assertRequestCurrent();
      if (
        result.operation !== null &&
        (result.operation.operation_id !== q.operation_id ||
          result.operation.operation_key !== q.operation_key ||
          result.operation.operation_sha256 !== q.operation_sha256 ||
          ("source_id" in result.operation &&
            (result.operation.source_id !== q.source_id ||
              result.operation.representation_id !== q.payload.representation_id ||
              result.operation.command !== q.command)))
      )
        throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
      if (
        result.freshAttempt &&
        (action !== "BEGIN" ||
          result.operation === null ||
          !("phase" in result.operation) ||
          result.operation.phase !== "IO_ACTIVE")
      )
        throw Error("PNG_SOURCE_PERMIT_INVALID");
      return result;
    } catch (error) {
      try {
        const frame =
          error instanceof Error
            ? /\/app\/server-capture\.mjs:(\d+):(\d+)/.exec(error.stack ?? "")
            : null;
        console.info(
          JSON.stringify({
            event: "source_png_broker_boundary_failed",
            phase,
            command: q.command,
            action,
            backendFrame: frame
              ? { line: Number(frame[1]), column: Number(frame[2]) }
              : undefined,
          }),
        );
      } catch {
        // Diagnostics cannot replace the original result or authorize a retry.
      }
      throw error;
    }
  };
}
