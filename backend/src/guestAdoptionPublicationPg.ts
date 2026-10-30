import { z } from "zod";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import { guestAdoptionStatusRequestSchema } from "../../src/domain/auth/guestAdoptionStatus";
import { validateGuestAdoptionReceipt } from "../../src/domain/auth/guestAdoptionReceipt";
import { qualifyGuestAdoptionReceiptForRecovery } from "../../src/data/auth/guestAdoptionReceiptQualification";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import {
  withCorePgStorageTransaction,
  type CorePgConnection,
} from "./tripCoreV2PgStorage";
import { executeGuestAdoptionCompositePgOnTransaction } from "./guestAdoptionCompositePg";

export const guestAdoptionPublicationRequestSchema =
  guestAdoptionStatusRequestSchema.extend({ planSha256: coreHash });

// Default closed/unmounted. Existing owning services and one outer transaction only.
// Returning a committed receipt still does not restore local data or install Session.
export async function publishGuestAdoptionPg(
  connection: CorePgConnection,
  user: AuthenticatedAccount,
  rawRequest: unknown,
  signal: AbortSignal,
) {
  if (!isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
  const actor = coreUuid.parse(user.id),
    request = guestAdoptionPublicationRequestSchema.parse(rawRequest);
  const trustedUser = Object.freeze({
    id: actor,
    accountClass: "NORMAL_ACCOUNT" as const,
  });
  if (request.targetAccountId !== actor) throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
  const { planSha256, ...binding } = request;
  let active = true,
    commitAttempted = false;
  let retire: (() => void) | undefined;
  const current = () => {
    if (!active || signal.aborted) throw Error("GUEST_ADOPTION_PUBLICATION_ABORTED");
  };
  const owning: CorePgConnection = {
    async withLease(work) {
      current();
      return connection.withLease(async (lease) => {
        retire = () => lease.retire();
        current();
        return work({
          retire: () => lease.retire(),
          async query(sql, parameters) {
            current();
            if (sql === "COMMIT") commitAttempted = true;
            const value = await lease.query(sql, parameters);
            current();
            return value;
          },
        });
      });
    },
  };
  try {
    const result = await withCorePgStorageTransaction(
      owning,
      tripCoreSha256Hex,
      async (context) => {
        const existing = (
          await context.lease.query(
            "SELECT otr_auth_guest_composite.publication_lock($1::uuid,$2::jsonb,$3::text) AS result",
            [actor, JSON.stringify(binding), planSha256],
          )
        ).rows[0]?.result;
        if (existing === undefined) throw Error("GUEST_ADOPTION_PUBLICATION_UNVERIFIED");
        if (existing !== null) {
          const receipt = await validateGuestAdoptionReceipt(
            existing,
            binding,
            tripCoreSha256Hex,
          );
          if (receipt.outcome !== "PUBLISHED" || receipt.planSha256 !== planSha256)
            throw Error("GUEST_ADOPTION_PUBLICATION_UNVERIFIED");
          current();
          return receipt;
        }
        await executeGuestAdoptionCompositePgOnTransaction(
          trustedUser,
          binding.adoptionId,
          planSha256,
          context,
          signal,
        );
        const locked = z
          .strictObject({ planText: z.string(), planSha256: coreHash })
          .parse(
            (
              await context.lease.query(
                "SELECT otr_auth_guest_composite.read_scope($1::uuid) AS result",
                [actor],
              )
            ).rows[0]?.result,
          );
        if (
          locked.planSha256 !== planSha256 ||
          (await tripCoreSha256Hex(new TextEncoder().encode(locked.planText))) !==
            planSha256
        )
          throw Error("GUEST_ADOPTION_LOCKED_PLAN_MISMATCH");
        const checkpoint: unknown = JSON.parse(locked.planText).preparation;
        const rawReceipt = (
          await context.lease.query(
            "SELECT otr_auth_guest_composite.publish($1::uuid,$2::jsonb,$3::text) AS result",
            [actor, JSON.stringify(binding), planSha256],
          )
        ).rows[0]?.result;
        const status = (
          await context.lease.query(
            "SELECT otr_auth_guest_composite.status($1::uuid,$2::jsonb) AS result",
            [actor, JSON.stringify(binding)],
          )
        ).rows[0]?.result;
        const qualified = await qualifyGuestAdoptionReceiptForRecovery(
          rawReceipt,
          checkpoint,
          binding,
          status,
          tripCoreSha256Hex,
        );
        if (
          qualified.receipt.outcome !== "PUBLISHED" ||
          qualified.receipt.planSha256 !== planSha256
        )
          throw Error("GUEST_ADOPTION_PUBLICATION_UNVERIFIED");
        current();
        return qualified.receipt;
      },
      undefined,
      { sustainedDev: true },
    );
    current();
    return result;
  } catch (error) {
    active = false;
    try {
      retire?.();
    } catch {
      /* Preserve the outcome. */
    }
    if (commitAttempted) throw Error("GUEST_ADOPTION_PUBLICATION_OUTCOME_UNKNOWN");
    throw error;
  } finally {
    active = false;
  }
}
