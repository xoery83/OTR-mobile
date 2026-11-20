import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
const revision = z.number().int().nonnegative().safe();
export const tripLifecycleStateSchema = z.enum(["ACTIVE", "ARCHIVED", "DELETED"]);
export const tripLifecycleActionSchema = z.enum(["ARCHIVE", "UNARCHIVE", "DELETE"]);
export const tripLifecycleRequestSchema = z.strictObject({
  operationId: coreUuid,
  tripId: coreUuid,
  expectedMetadataRevision: revision,
  graphHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(2000),
  action: tripLifecycleActionSchema,
});
export const tripLifecycleImpactSchema = z.strictObject({
  affectedItems: z.array(z.strictObject({ itemId: coreUuid, revision: revision })),
  hasFinancialReferences: z.boolean(),
  changesOriginalFiles: z.literal(false),
  warnings: z.array(z.string()),
});
export const tripLifecycleBaseSchema = z.strictObject({
  version: z.literal("otr.lifecycle.read/1"),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  metadataRevision: revision,
  graphHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: tripLifecycleStateSchema,
  availableActions: z.array(tripLifecycleActionSchema),
  impact: tripLifecycleImpactSchema,
  observedAt: z.iso.datetime({ offset: true }),
});
export const itemLifecycleBaseSchema = tripLifecycleBaseSchema
  .omit({
    metadataRevision: true,
    state: true,
    availableActions: true,
  })
  .extend({
    itemId: coreUuid,
    family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
    itemRevision: revision,
    availableActions: z.array(z.enum(["HIDE", "RESTORE", "DELETE"])),
  });
export const tripLifecycleReceiptSchema = z
  .strictObject({
    operationId: coreUuid,
    tripId: coreUuid,
    actorAccountId: coreUuid,
    request: tripLifecycleRequestSchema,
    outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
    resultMetadataRevision: revision,
    state: tripLifecycleStateSchema,
    committedAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (r) => r.operationId === r.request.operationId && r.tripId === r.request.tripId,
  );
export type TripLifecycleRequest = z.infer<typeof tripLifecycleRequestSchema>;
export type TripLifecycleReceipt = z.infer<typeof tripLifecycleReceiptSchema>;
export type TripLifecycleBase = z.infer<typeof tripLifecycleBaseSchema>;
