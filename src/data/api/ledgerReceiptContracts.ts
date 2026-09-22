import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const receiptSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable(),
  amountMinor: z.number().int().positive().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  occurredAt: z.string().nullable(),
  category: z.string().trim().min(1).max(80).nullable(),
});

export const createReceiptRequestSchema = z.object({
  localId: z.string().trim().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  sha256: digest,
});

export const receiptSchema = z.object({
  id: z.uuid(),
  localId: createReceiptRequestSchema.shape.localId,
  journeyId: z.uuid(),
  expenseId: z.uuid().nullable(),
  objectPath: z.string().min(1),
  mimeType: createReceiptRequestSchema.shape.mimeType,
  sizeBytes: createReceiptRequestSchema.shape.sizeBytes,
  sha256: digest,
  uploadStatus: z.enum(["PENDING", "UPLOADED"]),
  ocrStatus: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]),
  ocrSuggestion: receiptSuggestionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const receiptMutationResponseSchema = z.object({
  entity: receiptSchema,
  idempotentReplay: z.boolean(),
});

export const completeReceiptRequestSchema = z.object({
  objectPath: z.string().min(1),
  sizeBytes: createReceiptRequestSchema.shape.sizeBytes,
  sha256: digest,
});

export const linkReceiptRequestSchema = z.object({ expenseId: z.uuid() });
export const linkPersonalPaymentAttachmentRequestSchema = z.object({
  receiptId: z.uuid(),
});
export const personalPaymentAttachmentListResponseSchema = z.object({
  attachments: z.array(receiptSchema),
});

export type ReceiptSuggestion = z.infer<typeof receiptSuggestionSchema>;
export type ReceiptDto = z.infer<typeof receiptSchema>;
export type CreateReceiptRequest = z.infer<typeof createReceiptRequestSchema>;
export type CompleteReceiptRequest = z.infer<typeof completeReceiptRequestSchema>;
