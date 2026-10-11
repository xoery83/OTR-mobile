import { z } from "zod";
import * as f from "./tripCoreV2";
import { coreVectorEntrySchema, coreCommandSchema } from "./tripCoreV2Commands";
import { coreHashValue } from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";
const typedId = coreVectorEntrySchema
  .omit({ revision: true })
  .refine((v) => v.kind !== "SOURCE");
const finiteSnapshot = z
  .strictObject({
    kind: z.enum([
      "ITEM",
      "BOOKING",
      "ENTITLEMENT",
      "DOCUMENT",
      "INSTRUCTION",
      "EXPENSE_LINK",
    ]),
    id: f.coreUuid,
    revision: f.coreRevision,
    facts: z.unknown(),
  })
  .superRefine((v, c) => {
    const schema =
      v.kind === "EXPENSE_LINK"
        ? f.expense_linksSchema
        : f.coreTableSchemas[f.coreKindTables[v.kind]];
    if (!schema.safeParse(v.facts).success)
      c.addIssue({ code: "custom", message: "INVALID_RECEIPT_FACTS" });
  });
export const coreReceiptSchema = z.strictObject({
  receiptVersion: z.literal(2),
  commandVersion: z.literal(2),
  intentVersion: z.literal(2),
  actorAccountId: f.coreUuid,
  tripId: f.coreUuid,
  operationId: f.coreUuid,
  command: coreCommandSchema.shape.command,
  intentSha256: f.coreHash,
  receiptSha256: f.coreHash,
  targetVector: z
    .array(
      z.strictObject({
        kind: coreVectorEntrySchema.shape.kind,
        id: f.coreUuid,
        baseRevision: f.coreRevision.nullable(),
        committedRevision: f.coreRevision.nullable(),
      }),
    )
    .max(32),
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
  result: z.strictObject({
    created: z.array(typedId).max(32),
    changed: z.array(typedId).max(32),
    retiredEdges: z
      .array(
        z.strictObject({
          relation: z.enum([
            "trip_booking_item_links",
            "trip_entitlement_item_links",
            "trip_booking_entitlement_links",
            "trip_booking_document_links",
            "trip_entitlement_document_links",
            "trip_item_document_links",
          ]),
          parent: typedId,
          child: typedId,
        }),
      )
      .max(64),
    replacement: z.strictObject({ old: typedId, new: typedId }).nullable(),
    custodyGrantId: f.coreUuid.nullable(),
  }),
  errorCode: f.coreText(128).nullable(),
  committedAt: z.string().datetime({ precision: undefined }),
  audit: z.strictObject({
    before: z.array(finiteSnapshot).max(32),
    after: z.array(finiteSnapshot).max(32),
    evidenceRefs: z.array(f.coreText(512)).max(1024),
    authorizationRefs: z.array(f.coreText(512)).max(64),
  }),
});
export type CoreReceipt = z.infer<typeof coreReceiptSchema>;
export async function validateCoreReceipt(
  input: unknown,
  hash: ImportHash,
): Promise<CoreReceipt> {
  const receipt = coreReceiptSchema.parse(input),
    { receiptSha256, ...body } = receipt;
  if ((await coreHashValue("otr-trip-core-receipt-v2", body, hash)) !== receiptSha256)
    throw new Error("CORE_RECEIPT_HASH_MISMATCH");
  const keys = receipt.targetVector.map((v) => v.kind + ":" + v.id);
  if (new Set(keys).size !== keys.length) throw new Error("INVALID_RECEIPT_VECTOR");
  if (
    ["CONFLICT", "REJECTED"].includes(receipt.outcome) &&
    (receipt.result.created.length ||
      receipt.result.changed.length ||
      receipt.audit.before.length ||
      receipt.audit.after.length ||
      receipt.targetVector.some((v) => v.committedRevision !== null))
  )
    throw new Error("INVALID_REJECTED_RECEIPT");
  return receipt;
}
