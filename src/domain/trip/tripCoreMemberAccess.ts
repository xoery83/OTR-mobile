import { z } from "zod";
import { coreRevision, coreUuid } from "./tripCoreV2";
import { coreCommandSchema, validateCoreCommand } from "./tripCoreV2Commands";
import { coreReceiptSchema } from "./tripCoreV2Receipt";
import { coreHashValue } from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";

export const coreAccessReferenceSchema = z.strictObject({
  epoch: coreUuid,
  revision: coreRevision,
  accessRevision: coreRevision,
});
const target = z.strictObject({ kind: z.literal("TRIP_ACCESS"), id: coreUuid });
// Access generations are not Item, Person or participation revisions.
export const coreMemberRevokeCommandSchema = coreCommandSchema
  .extend({
    command: z.literal("REVOKE_LINKED_MEMBER_ACCESS"),
    target,
    baseVector: z.tuple([target.extend({ revision: coreRevision })]),
    admission: z.strictObject({
      mode: z.literal("MANUAL"),
      sourceIntentId: z.null(),
      policyVersion: z.null(),
    }),
    payload: z.strictObject({
      personId: coreUuid,
      targetAccountId: coreUuid,
      coreEpoch: coreUuid,
    }),
  })
  .superRefine((q, c) => {
    if (q.target.id !== q.tripId || q.baseVector[0].id !== q.tripId)
      c.addIssue({ code: "custom", message: "MEMBER_REVOKE_TRIP_VECTOR_MISMATCH" });
  });
export type CoreMemberRevokeCommand = z.infer<typeof coreMemberRevokeCommandSchema>;
export function validateCoreOwningCommand(raw: unknown) {
  return (raw as { command?: unknown } | null)?.command === "REVOKE_LINKED_MEMBER_ACCESS"
    ? coreMemberRevokeCommandSchema.parse(raw)
    : validateCoreCommand(raw);
}
export const coreMemberRevokeReceiptSchema = coreReceiptSchema.extend({
  command: z.literal("REVOKE_LINKED_MEMBER_ACCESS"),
  targetVector: z.tuple([
    target.extend({
      baseRevision: coreRevision,
      committedRevision: coreRevision.nullable(),
    }),
  ]),
  accessTransition: z
    .strictObject({
      personId: coreUuid,
      targetAccountId: coreUuid,
      before: coreAccessReferenceSchema,
      after: coreAccessReferenceSchema,
    })
    .nullable(),
});
export type CoreMemberRevokeReceipt = z.infer<typeof coreMemberRevokeReceiptSchema>;
export async function validateCoreMemberRevokeReceipt(
  raw: unknown,
  actor: string,
  trip: string,
  operation: string,
  hash: ImportHash,
  command?: CoreMemberRevokeCommand,
): Promise<CoreMemberRevokeReceipt> {
  const r = coreMemberRevokeReceiptSchema.parse(raw),
    { receiptSha256, ...body } = r;
  const v = r.targetVector[0],
    t = r.accessTransition;
  const settled = r.outcome === "APPLIED" || r.outcome === "NO_CHANGE";
  if (receiptSha256 !== (await coreHashValue("otr-trip-core-receipt-v2", body, hash)))
    throw Error("CORE_RECEIPT_HASH_MISMATCH");
  if (
    r.actorAccountId !== actor ||
    r.tripId !== trip ||
    r.operationId !== operation ||
    v.id !== trip ||
    r.result.created.length ||
    r.result.changed.length ||
    r.result.retiredEdges.length ||
    r.result.replacement !== null ||
    r.result.custodyGrantId !== null ||
    r.audit.before.length ||
    r.audit.after.length ||
    r.audit.evidenceRefs.length ||
    settled !== (t !== null) ||
    (settled ? r.errorCode !== null : r.errorCode === null) ||
    (!settled && v.committedRevision !== null)
  )
    throw Error("MEMBER_REVOKE_RECEIPT_BINDING_MISMATCH");
  if (
    t &&
    (t.targetAccountId === actor ||
      t.before.epoch !== t.after.epoch ||
      v.baseRevision !== t.before.accessRevision ||
      v.committedRevision !== t.after.accessRevision ||
      (r.outcome === "APPLIED"
        ? t.after.revision !== t.before.revision + 1 ||
          t.after.accessRevision !== t.before.accessRevision + 1
        : t.after.revision !== t.before.revision ||
          t.after.accessRevision !== t.before.accessRevision))
  )
    throw Error("MEMBER_REVOKE_RECEIPT_BINDING_MISMATCH");
  if (
    command &&
    (r.intentSha256 !== (await coreHashValue("otr-trip-core-intent-v2", command, hash)) ||
      command.tripId !== trip ||
      command.operationId !== operation ||
      v.baseRevision !== command.baseVector[0].revision ||
      (t &&
        (t.personId !== command.payload.personId ||
          t.targetAccountId !== command.payload.targetAccountId ||
          t.before.epoch !== command.payload.coreEpoch)))
  )
    throw Error("MEMBER_REVOKE_RECEIPT_BINDING_MISMATCH");
  return r;
}
export const coreAccessLossSchema = z.strictObject({
  schemaId: z.literal("otr.trip.core-access-loss/1"),
  accountId: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
  state: z.literal("ACCESS_REVOKED"),
  coreReference: coreAccessReferenceSchema,
});
export type CoreAccessLoss = z.infer<typeof coreAccessLossSchema>;
