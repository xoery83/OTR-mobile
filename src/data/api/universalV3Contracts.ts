import { z } from "zod";

const MiB = 1024 * 1024;
const mimeTypes = [
  "text/plain",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const universalV3Families = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
const file = z
  .strictObject({
    fileId: z.uuid(),
    documentId: z.uuid(),
    mediaType: z.enum(mimeTypes),
    length: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    ({ mediaType, length }) =>
      length <=
      (mediaType === "text/plain"
        ? MiB
        : mediaType === "application/pdf"
          ? 10 * MiB
          : 12 * MiB),
  );
export const universalV3Manifest = z
  .strictObject({
    version: z.literal("otr.import.local-first/1"),
    tripId: z.uuid(),
    mode: z.enum(["UNIVERSAL", "TYPE_SCOPED"]),
    family: z.enum(universalV3Families).optional(),
    files: z.array(file).min(1).max(5),
  })
  .refine(
    ({ mode, family, files }) =>
      (mode === "TYPE_SCOPED") === (family !== undefined) &&
      new Set(files.map(({ fileId }) => fileId)).size === files.length &&
      new Set(files.map(({ documentId }) => documentId)).size === files.length &&
      files.reduce((count, entry) => count + entry.length, 0) <= 48 * MiB,
  );
export type UniversalV3Manifest = z.infer<typeof universalV3Manifest>;

export const universalV3IntakeStatus = z.strictObject({
  analysisId: z.uuid(),
  missingFiles: z.array(z.uuid()).max(5),
});

export const universalV3Candidate = z.strictObject({
  candidateId: z.uuid(),
  kind: z.enum(universalV3Families),
  subtype: z.string().min(1).max(64),
  fields: z.record(
    z.string(),
    z.union([z.string().max(8192), z.number().finite(), z.boolean()]),
  ),
  documentIds: z.array(z.uuid()).min(1).max(5),
});

export const universalV3ExecutionStatus = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("WAITING_INPUT"),
    missingFiles: z.array(z.uuid()).max(5),
  }),
  z.strictObject({ state: z.literal("PROCESSING"), taskId: z.uuid() }),
  z.strictObject({
    state: z.literal("REVIEW_READY"),
    taskId: z.uuid(),
    candidates: z.array(universalV3Candidate).max(32),
  }),
  z.strictObject({ state: z.literal("NEEDS_ACTION") }),
  z.strictObject({ state: z.literal("OUTCOME_UNKNOWN"), taskId: z.uuid() }),
]);
export type UniversalV3ExecutionStatus = z.infer<typeof universalV3ExecutionStatus>;

export const universalV3Capability = z.strictObject({
  localFirst: z.boolean(),
  existing: universalV3ExecutionStatus.nullable(),
});
