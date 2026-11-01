import { z } from "zod";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
export type FormScanConsumer<Result> = (
  binding: StaySuggestionBinding,
  signal: AbortSignal,
  material: readonly CaptureSelection[],
) => Result | Promise<Result>;

// Validate advisory UI data; this is not Source parsing, evidence or write authority.
export const formScanResponseSchema = z
  .strictObject({
    kind: z.enum(["SYNTHETIC_STAY_SUGGESTIONS", "SYNTHETIC_FORM_SUGGESTIONS"]),
    family: z.enum(["P2", "P4", "P5", "P6"]).optional(),
    binding: z.strictObject({
      formId: z.string().min(1).max(128),
      tripId: z.string().min(1).max(128),
      itemId: z.string().min(1).max(128),
      generation: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      itemRevision: z.number().int().positive().nullable().optional(),
      mode: z.enum(["CREATE", "EDIT"]),
    }),
    candidates: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          targetItemId: z.string().min(1).max(128).optional(),
          fields: z
            .record(
              z.string().min(1).max(128),
              z.union([z.string().max(5000), z.boolean(), z.null()]),
            )
            .refine((value) => Object.keys(value).length <= 32),
          unsupported: z
            .array(
              z.strictObject({
                field: z.string().min(1).max(128),
                state: z.enum(["UNSUPPORTED", "NEEDS_INPUT"]),
              }),
            )
            .max(32)
            .optional(),
        }),
      )
      .max(12),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.candidates.map((candidate) => candidate.id)).size !==
      value.candidates.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["candidates"],
      });
  });
