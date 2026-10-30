import { z } from "zod";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { universalPgTransaction } from "./universalPg";
const state = z.strictObject({
  actorId: z.literal("f4b059c5-8241-4ffb-aa15-37fa25474543"),
  tripId: z.literal("825f79b2-4a9d-4535-a62e-43000ca50c4a"),
  closed: z.boolean(),
});

// Trusted watchdog/maintenance composition only. The SQL helper can close or read, never activate.
export function createSourcePngCloseControl(connection: CorePgConnection) {
  async function observe(close: boolean) {
    return universalPgTransaction(
      connection,
      async (lease) => {
        const who = (
          await lease.query("SELECT session_user AS principal,current_user AS role")
        ).rows[0];
        if (
          who?.principal !== "otr_trip_source_command_gateway" ||
          who.role !== who.principal
        )
          throw Error("PNG_CLOSE_PRINCIPAL_DENIED");
        return state.parse(
          (
            await lease.query(
              "SELECT public.trip_source_png_close_state($1::boolean) AS state",
              [close],
            )
          ).rows[0]?.state,
        );
      },
      false,
    );
  }
  return {
    read: () => observe(false),
    async close() {
      let acknowledged = false;
      try {
        await observe(true);
        acknowledged = true;
      } catch {
        /* A lost reply is not permission to repeat the mutation. */
      }
      const current = await observe(false);
      return {
        ...current,
        status: current.closed
          ? ("CLOSED_VERIFIED" as const)
          : ("RECONCILE_REQUIRED" as const),
        writeDisposition: acknowledged ? ("ACKNOWLEDGED" as const) : ("UNKNOWN" as const),
      };
    },
  };
}
