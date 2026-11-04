import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import {
  coreMemberRevokeCommandSchema,
  validateCoreMemberRevokeReceipt,
  coreAccessLossSchema,
  type CoreMemberRevokeCommand,
  type CoreMemberRevokeReceipt,
  type CoreAccessLoss,
} from "../../src/domain/trip/tripCoreMemberAccess";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

export type CoreMemberReceiptProjection = {
  projection: "FULL";
  domainReceiptId: string;
  receipt: CoreMemberRevokeReceipt;
};
export type CoreMemberAccessPort = {
  execute(
    actor: string,
    trip: string,
    command: CoreMemberRevokeCommand,
  ): Promise<CoreMemberReceiptProjection>;
  readOperation(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<CoreMemberReceiptProjection | null>;
  observeAccessLoss(actor: string, trip: string): Promise<CoreAccessLoss | null>;
};
// Explicit composition only. The installed SQL write gate is independently default closed.
export function createCoreMemberAccessPort(
  connection: CorePgConnection,
  hash: ImportHash,
): CoreMemberAccessPort {
  // The real transaction is deliberately shared by SQL effect, receipt validation and COMMIT.
  async function transact<T>(
    actor: string,
    trip: string,
    method: string,
    payload: unknown,
    validate: (raw: unknown) => Promise<T>,
  ) {
    coreUuid.parse(actor);
    coreUuid.parse(trip);
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        await lease.query(
          "SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'",
        );
        const out = await lease.query(
          "SELECT public.trip_core_member_access($1::uuid,$2::uuid,$3::text,$4::jsonb) AS result",
          [actor, trip, method, JSON.stringify(payload)],
        );
        if (out.rows.length !== 1 || !("result" in out.rows[0]))
          throw Error("MEMBER_ACCESS_RESULT_MISSING");
        const result = await validate(out.rows[0].result);
        await lease.query("COMMIT");
        began = false;
        return result;
      } catch (error) {
        if (began) await lease.query("ROLLBACK").catch(() => lease.retire());
        throw error;
      }
    });
  }
  async function receipt(
    raw: unknown,
    actor: string,
    trip: string,
    operation: string,
    command?: CoreMemberRevokeCommand,
  ) {
    const p = raw as CoreMemberReceiptProjection;
    if (!p || p.projection !== "FULL") throw Error("CORE_RECEIPT_SCOPE_MISMATCH");
    coreUuid.parse(p.domainReceiptId);
    return {
      projection: "FULL" as const,
      domainReceiptId: p.domainReceiptId,
      receipt: await validateCoreMemberRevokeReceipt(
        p.receipt,
        actor,
        trip,
        operation,
        hash,
        command,
      ),
    };
  }
  return {
    execute: async (actor, trip, input) => {
      const command = coreMemberRevokeCommandSchema.parse(input);
      if (command.tripId !== trip) throw Error("NOT_VISIBLE");
      return transact(
        actor,
        trip,
        "EXECUTE",
        {
          command,
          canonicalIntent: canonicalCoreJson(command),
          intentSha256: await coreHashValue("otr-trip-core-intent-v2", command, hash),
        },
        (raw) => receipt(raw, actor, trip, command.operationId, command),
      );
    },
    readOperation: (actor, trip, operation) => {
      coreUuid.parse(operation);
      return transact(actor, trip, "RECEIPT", { operationId: operation }, async (raw) =>
        raw === null ? null : receipt(raw, actor, trip, operation),
      );
    },
    observeAccessLoss: (actor, trip) =>
      transact(actor, trip, "ACCESS_LOSS", {}, async (raw) => {
        if (raw === null) return null;
        const value = coreAccessLossSchema.parse(raw);
        if (value.accountId !== actor || value.tripId !== trip)
          throw Error("MEMBER_ACCESS_RESULT_BINDING");
        return value;
      }),
  };
}
