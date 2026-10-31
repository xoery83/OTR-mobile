import { z } from "zod";
import { uuid, date } from "./contract";
const action = {
  mode: z.enum(["PREVIEW", "APPLY"]).default("PREVIEW"),
  preview_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
const calendar = z
  .strictObject({ start_date: date, end_date: date.optional() })
  .refine((x) => !x.end_date || x.end_date >= x.start_date);
export const createItemInput = z.strictObject({
  ...action,
  request_id: uuid,
  trip_id: uuid,
  item: z
    .strictObject({
      family: z.enum(["P1", "P3", "P4", "P6"]),
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(5000).nullable().optional(),
      dates: calendar,
      place: z.string().trim().min(1).max(256).optional(),
      property_name: z.string().trim().min(1).max(256).optional(),
    })
    .refine((x) => x.family !== "P3" || !!x.dates.end_date, "P3 needs checkout date")
    .refine((x) => !x.property_name || x.family === "P3", "property_name belongs to P3"),
});
export const updateItemInput = z.strictObject({
  ...action,
  request_id: uuid,
  trip_id: uuid,
  item_id: uuid,
  expected_revision: z.number().int().positive().safe(),
  change: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("TEXT"),
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(5000).nullable().optional(),
    }),
    z.strictObject({ kind: z.literal("DATES"), dates: calendar }),
  ]),
});
export const createTripInput = z.strictObject({
  ...action,
  request_id: uuid,
  name: z.string().trim().min(1).max(256),
  destinations: z.array(z.string().trim().min(1).max(256)).max(20),
  dates: calendar.optional(),
});
export const operationInput = z.strictObject({
  trip_id: uuid,
  operation_id: uuid,
  target: z.enum(["TRIP", "ITEM"]),
});
export const mutationOutput = z.object({
  version: z.literal("otr.mcp.mutation/1"),
  trip_id: uuid,
  item_id: uuid.optional(),
  operation_id: uuid,
  outcome: z.enum([
    "PREVIEW",
    "NEEDS_CONFIRMATION",
    "APPLIED",
    "NO_CHANGE",
    "CONFLICT",
    "UNKNOWN",
    "REJECTED",
  ]),
  current_revision: z.number().int().nonnegative().nullable(),
  preview_digest: z.string(),
  summary: z.string(),
  error_code: z.string().optional(),
  query: operationInput,
});
export type MutationResult = z.infer<typeof mutationOutput>;
export const previewChangesInput = z
  .strictObject({
    trip_id: uuid,
    changes: z
      .array(
        z.union([
          createItemInput
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("CREATE") }),
          updateItemInput
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("UPDATE") }),
        ]),
      )
      .min(1)
      .max(12),
  })
  .refine(
    (x) => new Set(x.changes.map((c) => c.request_id)).size === x.changes.length,
    "Duplicate operation ID",
  );
export const applyChangesInput = previewChangesInput.extend({
  preview_digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const batchOutput = z.object({
  version: z.literal("otr.mcp.batch/1"),
  trip_id: uuid,
  preview_digest: z.string(),
  outcome: z.enum([
    "PREVIEW",
    "NEEDS_CONFIRMATION",
    "PARTIAL",
    "APPLIED",
    "UNKNOWN",
    "CONFLICT",
    "REJECTED",
  ]),
  operations: z.array(mutationOutput).max(12),
  warnings: z.array(z.string()).max(24),
});

export const operationOutput = z.object({
  version: z.literal("otr.mcp.status/1"),
  ...operationInput.shape,
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED", "UNKNOWN"]),
  current_revision: z.number().int().nonnegative().nullable(),
  error_code: z.string().optional(),
});
