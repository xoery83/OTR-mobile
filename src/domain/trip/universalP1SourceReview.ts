import { z } from "zod";
import { validateCalendarDate } from "./dayReadModel";

export const universalP1SourceReviewSchema = z.strictObject({
  version: z.literal("otr.universal.p1-source-review/1"),
  decision: z.literal("NEW"),
  sourceRevision: z.number().int().positive().safe(),
  title: z.string().min(1).max(500),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originalReviewed: z.literal(true),
  tripReviewed: z.literal(true),
});
export type UniversalP1SourceReview = z.infer<typeof universalP1SourceReviewSchema>;
export const universalP3SourceReviewSchema = universalP1SourceReviewSchema.extend({
  version: z.literal("otr.universal.p3-source-review/1"),
  endLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const universalP4SourceReviewSchema = universalP1SourceReviewSchema.extend({
  version: z.literal("otr.universal.p4-source-review/1"),
  endLocalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const universalP5SourceReviewSchema = universalP1SourceReviewSchema.extend({
  version: z.literal("otr.universal.p5-source-review/1"),
});
export const universalItemSourceReviewSchema = z.discriminatedUnion("version", [
  universalP1SourceReviewSchema,
  universalP3SourceReviewSchema,
  universalP4SourceReviewSchema,
  universalP5SourceReviewSchema,
]);
export type UniversalItemSourceReview = z.infer<typeof universalItemSourceReviewSchema>;

// shortcut: ISO or English abbreviated month only; add formats only with source fixtures.
export function sourceReviewCivilDate(raw: string): string {
  const match =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12]\d|3[01]), (\d{4})$/.exec(
      raw,
    );
  const date = match
    ? `${match[3]}-${String(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`
    : raw;
  validateCalendarDate(date);
  return date;
}
