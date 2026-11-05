import { z } from "zod";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  parseSelfNicknameCommand,
  parseSelfNicknameMutationResponse,
  parseSelfNicknameObservation,
  parseSelfNicknameRecoverResponse,
  selfNicknameContextSchema,
  selfNicknameRecoverRequestSchema,
  selfNicknameRecoverResponseSchema,
  type SelfNicknameCommand,
  type SelfNicknameContext,
} from "../../src/domain/trip/tripPersonSelfNickname";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

/** Source-only connector; no HTTP route, identity selection or runtime mounting. */
export class SelfNicknamePgError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409 | 503,
    public readonly code: string,
  ) {
    super(code);
  }
}
function classify(error: unknown): never {
  if (error instanceof SelfNicknamePgError) throw error;
  if (error instanceof z.ZodError)
    throw new SelfNicknamePgError(503, "SELF_NICKNAME_RESULT_INVALID");
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") throw new SelfNicknamePgError(403, "SELF_NICKNAME_FORBIDDEN");
  if (code === "23505")
    throw new SelfNicknamePgError(409, "SELF_NICKNAME_OPERATION_REUSED");
  if (code === "22023" || code === "22P02")
    throw new SelfNicknamePgError(400, "SELF_NICKNAME_INVALID");
  throw new SelfNicknamePgError(503, "SELF_NICKNAME_UNAVAILABLE");
}
/** Normal authenticated Actor must be selected by Auth before calling this port.
 * SQL independently rechecks the exact existing Gateway and current self link.
 * APPLIED is historical receipt truth; read() is the separate current observation.
 */
export function createTripPersonSelfNicknamePgPort(
  connection: CorePgConnection,
  assertOpen: () => void = () => {},
) {
  const checkOpen = () => {
    try {
      assertOpen();
    } catch (error) {
      classify(error);
    }
  };
  async function run(context: SelfNicknameContext, method: string, payload: unknown) {
    try {
      checkOpen();
      const result = await connection.withLease(async (lease) => {
        checkOpen();
        await lease.query("BEGIN");
        try {
          checkOpen();
          await lease.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [context.accountId, context.tripId],
          );
          checkOpen();
          const result = await lease.query(
            "SELECT public.trip_person_self_nickname($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb) AS result",
            [
              context.accountId,
              context.tripId,
              context.personId,
              method,
              JSON.stringify(payload),
            ],
          );
          // Validate before COMMIT: response corruption must not become a local
          // accepted success; a transport/COMMIT failure remains original UNKNOWN.
          const raw = result.rows[0]?.result;
          let parsed;
          if (method === "READ") parsed = parseSelfNicknameObservation(raw, context);
          else if (method === "EXECUTE")
            parsed = parseSelfNicknameMutationResponse(
              raw,
              payload as SelfNicknameCommand,
              context,
            );
          else {
            const p = payload as { operationId: string; intentDigest: string };
            if (
              typeof raw === "object" &&
              raw !== null &&
              "kind" in raw &&
              raw.kind === "EXACT_RECEIPT" &&
              "receipt" in raw
            ) {
              const receipt = raw.receipt as Record<string, unknown>;
              const original = parseSelfNicknameCommand(
                {
                  contractVersion: 1,
                  command: "SET_SELF_TRIP_NICKNAME",
                  operationId: p.operationId,
                  tripId: context.tripId,
                  personId: context.personId,
                  expectedNicknameRevision: receipt?.expectedNicknameRevision,
                  nickname: receipt?.desiredNickname,
                  intentDigest: p.intentDigest,
                },
                context,
              );
              parsed = parseSelfNicknameRecoverResponse(raw, original, context);
            } else {
              // ABSENT is not a command and cannot authorize a replacement write.
              const absent = z.strictObject({ kind: z.literal("ABSENT_UNCONFIRMED") });
              parsed = absent.parse(raw);
            }
          }
          checkOpen();
          await lease.query("COMMIT");
          return parsed;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          throw error;
        }
      });
      // The transaction may already be committed: closure here is uncertainty,
      // not a rollback or permission to replace/retry the original operation.
      checkOpen();
      return result;
    } catch (error) {
      classify(error);
    }
  }
  return {
    async read(input: SelfNicknameContext) {
      const context = selfNicknameContextSchema.parse(input);
      const result = await run(context, "READ", {});
      checkOpen();
      return parseSelfNicknameObservation(result, context);
    },
    async execute(input: SelfNicknameContext, raw: SelfNicknameCommand) {
      const context = selfNicknameContextSchema.parse(input);
      const command = parseSelfNicknameCommand(raw, context);
      const result = await run(context, "EXECUTE", command);
      checkOpen();
      return parseSelfNicknameMutationResponse(result, command, context);
    },
    async recover(
      input: SelfNicknameContext,
      operationId: string,
      body: { intentDigest: string },
    ) {
      const context = selfNicknameContextSchema.parse(input);
      const operation = coreUuid.parse(operationId);
      const { intentDigest } = selfNicknameRecoverRequestSchema.parse(body);
      coreHash.parse(intentDigest);
      const result = await run(context, "RECEIPT", {
        operationId: operation,
        intentDigest,
      });
      checkOpen();
      return selfNicknameRecoverResponseSchema.parse(result);
    },
  };
}
