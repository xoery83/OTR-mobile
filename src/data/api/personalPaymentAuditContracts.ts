import { z } from "zod";

// PostgreSQL JSON text preserves the immutable snapshot's numeric(38,18) evidence.
export const personalPaymentAuditEventSchema = z
  .strictObject({
    id: z.uuid(),
    recordId: z.uuid(),
    journeyId: z.uuid(),
    priorRevision: z.number().int().positive().safe().nullable(),
    revision: z.number().int().positive().safe(),
    eventType: z.enum(["CREATED", "UPDATED", "DELETED"]),
    actorUserId: z.uuid(),
    actorMemberId: z.uuid(),
    operationId: z.uuid(),
    reason: z.string().max(2000).nullable(),
    changedFields: z.array(z.string()).max(100),
    recordSnapshotJson: z
      .string()
      .min(2)
      .max(1048576)
      .refine((value) => {
        try {
          const parsed = JSON.parse(value);
          return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
        } catch {
          return false;
        }
      }),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((event, ctx) => {
    let snapshot: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(event.recordSnapshotJson);
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      snapshot = value as Record<string, unknown>;
    } catch {
      return;
    }
    if (
      snapshot.id !== event.recordId ||
      snapshot.journey_id !== event.journeyId ||
      snapshot.revision !== event.revision ||
      snapshot.last_operation_id !== event.operationId ||
      (event.eventType === "CREATED"
        ? event.priorRevision !== null || event.revision !== 1
        : event.priorRevision === null || event.revision !== event.priorRevision + 1)
    )
      ctx.addIssue({
        code: "custom",
        message: "Audit snapshot identity/revision mismatch",
      });
  });
export type PersonalPaymentAuditEvent = z.infer<typeof personalPaymentAuditEventSchema>;
