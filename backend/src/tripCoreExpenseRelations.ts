import { z } from "zod";
import { coreUuid, expense_linksSchema } from "../../src/domain/trip/tripCoreV2";
import type { CorePgLease } from "./tripCoreV2PgStorage";

const schema = z.strictObject({
  links: z.array(expense_linksSchema).max(20000),
  authorizedExpenseIds: z.array(coreUuid).max(20000),
});
export async function readCoreExpenseRelations(
  lease: CorePgLease,
  actor: string,
  trip: string,
) {
  const result = schema.parse(
    (
      await lease.query(
        "SELECT public.trip_core_read_expense_relations($1::uuid,$2::uuid) AS result",
        [actor, trip],
      )
    ).rows[0]?.result,
  );
  if (
    new Set(result.authorizedExpenseIds).size !== result.authorizedExpenseIds.length ||
    new Set(result.links.map((row) => row.id)).size !== result.links.length ||
    result.links.some(
      (row) =>
        row.journey_id !== trip || !result.authorizedExpenseIds.includes(row.expense_id),
    )
  )
    throw new Error("CROSS_TRIP_REFERENCE");
  return result;
}
