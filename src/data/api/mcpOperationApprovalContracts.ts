import { tripLifecycleRequestSchema } from "@/domain/trip/tripLifecycleContract";
import { z } from "zod";
import { tripMetadataWireUpdateSchema } from "@/domain/trip/tripMetadataV2Contract";
export const operationApprovalStateSchema = z.enum([
  "MISSING",
  "PENDING",
  "APPROVED",
  "DECLINED",
  "EXPIRED",
]);
export const operationApprovalViewSchema = z.object({
  id: z.uuid(),
  state: operationApprovalStateSchema,
  accountId: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  resource: z.url(),
  tripId: z.uuid(),
  operationId: z.uuid(),
  digest: z.string(),
  kind: z.literal("TRIP_DELETE").optional(),
  targetName: z.string().optional(),
  call: z.object({
    request: z.union([
      tripMetadataWireUpdateSchema,
      tripLifecycleRequestSchema.extend({ action: z.literal("DELETE") }),
    ]),
  }),
  completed: z.boolean(),
  expiresAt: z.string().nullable(),
  decisionAt: z.string().nullable(),
  csrfContext: z.string().optional(),
});
export const operationApprovalDecisionSchema = z.object({
  id: z.uuid(),
  state: operationApprovalStateSchema,
  expiresAt: z.string().nullable(),
  decisionAt: z.string().nullable(),
  completed: z.boolean(),
});
export type OperationApprovalView = z.infer<typeof operationApprovalViewSchema>;
