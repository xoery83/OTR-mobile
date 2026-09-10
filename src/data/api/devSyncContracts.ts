import { z } from "zod";

const localIdSchema = z.string().trim().min(1).max(200);
const nullableUuidSchema = z.uuid().nullable();
const nullableIsoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected an ISO timestamp.")
  .nullable();

export const createExpenseRequestSchema = z.object({
  localId: localIdSchema,
  title: z.string().trim().min(1).max(200),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  paidByMemberId: nullableUuidSchema,
  occurredAt: nullableIsoDateTimeSchema,
});

export const createItineraryItemRequestSchema = z.object({
  localId: localIdSchema,
  title: z.string().trim().min(1).max(200),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  location: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(5_000).nullable(),
});

export const createSyncResponseSchema = z.object({
  serverId: z.uuid(),
  version: z.number().int().positive(),
  updatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  idempotentReplay: z.boolean(),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;
export type CreateItineraryItemRequest = z.infer<typeof createItineraryItemRequestSchema>;
export type CreateSyncResponse = z.infer<typeof createSyncResponseSchema>;
