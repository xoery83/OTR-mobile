import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgLease } from "./tripCoreV2PgStorage";
const schema = z.strictObject({
  tripState: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]),
  deletedItemIds: z.array(coreUuid).max(20000),
});
export async function readCoreLifecycleState(
  lease: CorePgLease,
  actor: string,
  trip: string,
) {
  return schema.parse(
    (
      await lease.query(
        "SELECT public.trip_core_item_lifecycle_states($1::uuid,$2::uuid) AS result",
        [actor, trip],
      )
    ).rows[0]?.result,
  );
}
