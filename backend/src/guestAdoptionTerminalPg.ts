import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  guestAdoptionStatusRequestSchema,
  guestAdoptionStatusResultSchema,
  type GuestAdoptionStatusRequest,
} from "../../src/domain/auth/guestAdoptionStatus";
import {
  guestAdoptionReceiptRequestSchema,
  validateGuestAdoptionReceipt,
  validateGuestAdoptionCancellationReceipt,
} from "../../src/domain/auth/guestAdoptionReceipt";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import type { GuestAdoptionStatusPort } from "./guestAdoptionStatus";
import type { GuestAdoptionReceiptPort } from "./guestAdoptionReceipt";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";

// Unmounted. Reads only the owning immutable journal; never the old authority-NONE
// component evidence. The normal Account HTTP boundary must authenticate the actor.
export function createGuestAdoptionTerminalPg(
  connection: CorePgConnection,
): GuestAdoptionStatusPort &
  GuestAdoptionReceiptPort & {
    cancel(
      actorAccountId: string,
      request: GuestAdoptionStatusRequest,
      signal: AbortSignal,
    ): Promise<unknown>;
  } {
  async function transaction<T>(
    signal: AbortSignal,
    write: boolean,
    work: (lease: CorePgLease) => Promise<T>,
  ) {
    let active = true,
      commitAttempted = false;
    let retire: (() => void) | undefined;
    const retireQuietly = () => {
      try {
        retire?.();
      } catch {
        /* Preserve the outcome. */
      }
    };
    const current = () => {
      if (!active || signal.aborted) throw Error("GUEST_ADOPTION_RECOVERY_CANCELED");
    };
    try {
      current();
      const result = await connection.withLease(async (lease) => {
        retire = () => lease.retire();
        current();
        // Existing Account authorization takes FOR SHARE; SQL read-only transactions reject it.
        await lease.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ");
        try {
          current();
          const value = await work(lease);
          current();
          commitAttempted = true;
          await lease.query("COMMIT");
          current();
          return value;
        } catch (error) {
          if (active)
            await lease.query("ROLLBACK").catch(() => {
              try {
                lease.retire();
              } catch {
                /* Preserve the read failure. */
              }
            });
          throw error;
        }
      });
      current();
      return result;
    } catch (error) {
      active = false;
      retireQuietly();
      if (write && commitAttempted) throw Error("GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN");
      throw error;
    } finally {
      active = false;
    }
  }
  return {
    async cancel(actorAccountId, raw, signal) {
      const actor = coreUuid.parse(actorAccountId),
        request = guestAdoptionStatusRequestSchema.parse(raw);
      if (request.targetAccountId !== actor)
        throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
      return transaction(signal, true, async (lease) => {
        const result = (
          await lease.query(
            "SELECT otr_auth_guest_composite.cancel($1::uuid,$2::jsonb) AS result",
            [actor, JSON.stringify(request)],
          )
        ).rows[0]?.result;
        return validateGuestAdoptionCancellationReceipt(
          result,
          request,
          tripCoreSha256Hex,
        );
      });
    },
    async readStatus(actorAccountId, raw, signal) {
      const actor = coreUuid.parse(actorAccountId),
        request = guestAdoptionStatusRequestSchema.parse(raw);
      if (request.targetAccountId !== actor)
        throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
      return transaction(signal, false, async (lease) => {
        const result = guestAdoptionStatusResultSchema.parse(
          (
            await lease.query(
              "SELECT otr_auth_guest_composite.status($1::uuid,$2::jsonb) AS result",
              [actor, JSON.stringify(request)],
            )
          ).rows[0]?.result,
        );
        for (const key of Object.keys(request) as (keyof typeof request)[])
          if (result[key] !== request[key])
            throw Error("GUEST_ADOPTION_STATUS_UNVERIFIED");
        return result;
      });
    },
    async readReceipt(actorAccountId, raw, signal) {
      const actor = coreUuid.parse(actorAccountId),
        request = guestAdoptionReceiptRequestSchema.parse(raw);
      if (request.targetAccountId !== actor)
        throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
      const { receiptId, receiptSha256, ...binding } = request;
      return transaction(signal, false, async (lease) => {
        const row = (
          await lease.query(
            "SELECT otr_auth_guest_composite.receipt($1::uuid,$2::jsonb,$3::uuid,$4::text) AS result",
            [actor, JSON.stringify(binding), receiptId, receiptSha256],
          )
        ).rows[0]?.result;
        const receipt = await validateGuestAdoptionReceipt(
          row,
          binding,
          tripCoreSha256Hex,
        );
        if (receipt.receiptId !== receiptId || receipt.receiptSha256 !== receiptSha256)
          throw Error("GUEST_ADOPTION_RECEIPT_UNVERIFIED");
        return receipt;
      });
    },
  };
}
