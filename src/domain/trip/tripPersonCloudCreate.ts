import { z } from "zod";
import { coreUuid, coreText } from "./tripCoreV2";
export const personCloudCreateKind = "TRIP_PERSON_CLOUD_CREATE";
export const personCloudCreateSchema = z.strictObject({
  version: z.literal(1),
  operationId: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
  tripCreateOperationId: coreUuid,
  dataOwnership: z.literal("CLOUD_SHARED_AUTHORED"),
  displayName: coreText(256).refine((v) => v.length > 0 && v === v.trim()),
});
export type PersonCloudCreate = z.infer<typeof personCloudCreateSchema>;
export const personCloudCreateReceiptSchema = z
  .strictObject({
    receiptVersion: z.literal(1),
    actorAccountId: coreUuid,
    request: personCloudCreateSchema,
    person: z.strictObject({
      personId: coreUuid,
      tripId: coreUuid,
      displayName: coreText(256),
      status: z.literal("unlinked"),
      userId: z.null(),
      participationActive: z.literal(true),
      participationRevision: z.literal(0),
    }),
    acceptedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((r, c) => {
    if (
      r.person.personId !== r.request.personId ||
      r.person.tripId !== r.request.tripId ||
      r.person.displayName !== r.request.displayName
    )
      c.addIssue({ code: "custom", message: "PERSON_RECEIPT_BINDING" });
  });
export type PersonCloudCreateReceipt = z.infer<typeof personCloudCreateReceiptSchema>;
