import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { guestAdoptionStatusRequestSchema } from "../../src/domain/auth/guestAdoptionStatus";
import type { GuestAdoptionStatusPort } from "./guestAdoptionStatus";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

// Private stage recovery only. Never infers a terminal receipt or releases source locks.
// Unmounted: the normal-Account boundary must authenticate the actor before this port.
export function createGuestAdoptionCompositeStatus(
  connection: CorePgConnection,
): GuestAdoptionStatusPort {
  return {
    async readStatus(actorAccountId, raw, signal) {
      const actor = coreUuid.parse(actorAccountId);
      const input = guestAdoptionStatusRequestSchema.parse(raw);
      if (input.targetAccountId !== actor) throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
      const assertCurrent = () => {
        if (signal.aborted) throw Error("REQUEST_CANCELED");
      };
      assertCurrent();
      const found = await connection.withLease(async (lease) => {
        assertCurrent();
        await lease.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        try {
          assertCurrent();
          const result = await lease.query(
            `SELECT EXISTS(SELECT 1 FROM otr_auth_guest_composite.sealed_stages
           WHERE adoption_id=$1::uuid AND actor_account_id=$2::uuid
             AND source_guest_local_id=$3::uuid AND inventory_sha256=$4) AS found`,
            [input.adoptionId, actor, input.sourceGuestLocalId, input.inventorySha256],
          );
          assertCurrent();
          if (typeof result.rows[0]?.found !== "boolean")
            throw Error("GUEST_ADOPTION_STATUS_UNVERIFIED");
          await lease.query("COMMIT");
          assertCurrent();
          return result.rows[0].found;
        } catch (error) {
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
      assertCurrent();
      return {
        ...input,
        status: found ? "IN_PROGRESS" : "NOT_FOUND",
        nextAction: "QUERY_SERVER_STATUS",
      };
    },
  };
}
