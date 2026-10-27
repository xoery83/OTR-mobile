import { z } from "zod";
import { validateCalendarDate } from "./dayReadModel";

export const universalP2SourceReviewSchema = z.strictObject({
  version: z.literal("otr.universal.p2-source-review/1"),
  decision: z.literal("NEW"),
  sourceRevision: z.number().int().positive().safe(),
  flightNumberLiteral: z.string().min(1).max(255),
  departureDate: z.string().refine((date) => {
    try {
      validateCalendarDate(date);
      return true;
    } catch {
      return false;
    }
  }),
  originalReviewed: z.literal(true),
  tripReviewed: z.literal(true),
});
export type UniversalP2SourceReview = z.infer<typeof universalP2SourceReviewSchema>;
