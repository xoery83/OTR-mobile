import { z } from "zod";
import {
  captureIdSchema,
  captureKindSchema,
  captureRevisionSchema,
  sha256Schema,
} from "./localCapture";

export const submissionId = z.uuid();
export const submissionContextSchema = z
  .object({
    id: submissionId,
    version: z.literal(1),
    accountId: captureIdSchema,
    batchId: submissionId,
    observedAt: z.iso.datetime(),
    clock: z.literal("DEVICE_WALL"),
    entrySurface: z.literal("CAPTURE"),
    tripPrior: z
      .object({
        id: captureIdSchema,
        origin: z.literal("PRIOR"),
        observedAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const inputDeclarationSchema = z
  .object({
    id: submissionId,
    itemKey: submissionId,
    ordinal: z.number().int().nonnegative(),
    acquisitionSource: z.enum(["files", "photos"]),
    kind: captureKindSchema,
    originalFilename: z.string().max(1024).nullable(),
    declaredContentType: z.string().max(255).nullable(),
    continuesFromInputId: submissionId.nullable(),
  })
  .strict();
export const submissionRequestSchema = z
  .object({
    formatVersion: z.literal(1),
    manifestVersion: z.literal(1),
    accountId: captureIdSchema,
    batchId: submissionId,
    jobId: submissionId,
    submissionKey: submissionId,
    createdAt: z.iso.datetime(),
    context: submissionContextSchema,
    inputs: z.array(inputDeclarationSchema).min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = [
      v.batchId,
      v.jobId,
      v.submissionKey,
      v.context.id,
      ...v.inputs.flatMap((i) => [i.id, i.itemKey]),
    ];
    if (
      new Set(ids).size !== ids.length ||
      v.context.accountId !== v.accountId ||
      v.context.batchId !== v.batchId ||
      v.inputs.some((i, n) => i.ordinal !== n)
    )
      ctx.addIssue({ code: "custom", message: "Invalid submission identity or order" });
  });
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type InputDeclaration = z.infer<typeof inputDeclarationSchema>;
export const safeIntakeFailureSchema = z.enum([
  "EMPTY_PAYLOAD",
  "PAYLOAD_TOO_LARGE",
  "READER_FAILURE",
  "INVALID_UTF8",
  "HASH_FAILURE",
  "ROW_QUOTA",
  "ACCOUNT_BYTE_QUOTA",
  "DEVICE_BYTE_QUOTA",
  "CONTENT_MISMATCH",
]);
export type SafeIntakeFailure = z.infer<typeof safeIntakeFailureSchema>;
export const inputFactsSchema = z
  .object({
    revision: captureRevisionSchema,
    contentSha256: sha256Schema.nullable(),
    contentByteCount: z.number().int().min(1).max(10485760).nullable(),
    state: z.enum(["PENDING", "ACCEPTED", "FAILED"]),
    pendingReason: z.enum(["READ", "RECOVER_COMMIT", "REACQUIRE"]).nullable(),
    failureCode: safeIntakeFailureSchema.nullable(),
    captureId: captureIdSchema.nullable(),
    payloadId: captureIdSchema.nullable(),
    captureRevision: captureRevisionSchema.nullable(),
    acceptedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const binding = [v.captureId, v.payloadId, v.captureRevision, v.acceptedAt];
    if (
      (v.contentSha256 === null) !== (v.contentByteCount === null) ||
      (v.state === "ACCEPTED"
        ? binding.some((i) => i === null) || v.contentSha256 === null
        : binding.some((i) => i !== null)) ||
      (v.state === "PENDING") !== (v.pendingReason !== null) ||
      (v.state === "FAILED") !== (v.failureCode !== null)
    )
      ctx.addIssue({ code: "custom", message: "Invalid intake facts" });
  });
export type CaptureSubmissionInput = InputDeclaration &
  z.infer<typeof inputFactsSchema> & {
    continuedIn: readonly { jobId: string; inputId: string }[];
    continuesFromJobId: string | null;
  };
export type CaptureJobReadModel = {
  batch: SubmissionRequest;
  inputs: readonly CaptureSubmissionInput[];
  counts: { selected: number; accepted: number; failed: number; pending: number };
  allInputsAccepted: boolean;
  intakeSettled: boolean;
  processing: {
    capability: "NOT_INSTALLED";
    assessedInputs: null;
    totalInputs: null;
    currentPassComplete: null;
  };
  results: { admittedCreates: 0; admittedUpdates: 0; currentAttention: null };
  availableActions: {
    canHide: true;
    canReopen: true;
    canAddMore: true;
    canResumeAcceptedLocalWork: false;
    canReviewNow: false;
    canOpenCurrentReview: false;
    canRetryKnownFailedItem: boolean;
    reacquireInputIds: readonly string[];
    unavailableReasons: readonly (
      "PROCESSING_NOT_INSTALLED" | "INPUT_REACQUISITION_REQUIRED"
    )[];
  };
};
// Fixed field order for hashing; excludes temporary readers, URIs and size hints.
export function canonicalSubmission(request: SubmissionRequest) {
  return JSON.stringify(submissionRequestSchema.parse(request));
}
export function boundedSubmissionJson(value: unknown) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).length > 65536)
    throw new Error("Submission metadata exceeds technical bound");
  return json;
}
