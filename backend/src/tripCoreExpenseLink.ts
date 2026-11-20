import { z } from "zod";
import { coreUuid, coreRevision } from "../../src/domain/trip/tripCoreV2";
import type { CoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import type { CorePgLease } from "./tripCoreV2PgStorage";
const schema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  linkId: coreUuid,
  expenseId: coreUuid,
  itemId: coreUuid,
  expenseRevision: coreRevision,
});
const rejection = z.strictObject({
  errorCode: z.enum(["NOT_VISIBLE", "REVISION_CONFLICT", "INVALID_LINK"]),
});
export type CoreExpenseLinkDecision = z.infer<typeof schema> | z.infer<typeof rejection>;
export async function verifyCoreExpenseLink(
  lease: CorePgLease,
  actor: string,
  command: CoreCommand,
) {
  const p = command.payload as {
    expenseId: string;
    targetId: string;
    targetKind: string;
    expectedExpenseRevision?: number;
  };
  if (
    !["LINK_EXPENSE", "UNLINK_EXPENSE"].includes(command.command) ||
    command.admission.mode !== "MANUAL" ||
    p.targetKind !== "ITEM" ||
    p.expectedExpenseRevision === undefined
  )
    throw new Error("OWNING_CAPABILITY_REQUIRED");
  const proof = z
    .union([schema, rejection])
    .parse(
      (
        await lease.query(
          "SELECT public.trip_core_lock_expense_link($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint) AS result",
          [
            actor,
            command.tripId,
            command.target.id,
            p.expenseId,
            p.targetId,
            p.expectedExpenseRevision,
          ],
        )
      ).rows[0]?.result,
    );
  if ("errorCode" in proof) return proof;
  if (
    proof.actorAccountId !== actor ||
    proof.tripId !== command.tripId ||
    proof.linkId !== command.target.id ||
    proof.expenseId !== p.expenseId ||
    proof.itemId !== p.targetId
  )
    throw new Error("NOT_VISIBLE");
  if (proof.expenseRevision !== p.expectedExpenseRevision)
    throw new Error("CORE_EXPENSE_PROOF_MISMATCH");
  return proof;
}
