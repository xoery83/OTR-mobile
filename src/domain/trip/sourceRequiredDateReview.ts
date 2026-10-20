import { z } from "zod";
import { flightTimeInputSchema } from "./flightAdmission";
import { flightInputSchema } from "./flightImportReview";

const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const version = z.number().int().positive().safe();
// This slice answers one required field. It does not qualify a flight or time.
export const requiredDateTargetSchema = z.strictObject({
  jobId: uuid,
  candidateId: uuid,
});
export const requiredDatePinsSchema = z.strictObject({
  batchId: uuid,
  runId: uuid,
  runGeneration: version,
  candidateSha256: hash,
  inputSha256: hash,
  inputs: z.array(flightInputSchema).min(1).max(64),
  bindingSha256: hash,
});
export const requiredDateDecisionSchema = z.strictObject({
  target: requiredDateTargetSchema,
  pins: requiredDatePinsSchema,
  decisionId: uuid,
  expectedVersion: z.number().int().nonnegative().safe(),
  // Use the existing calendar validator; null is not a submitted answer.
  date: flightTimeInputSchema.shape.local_date.unwrap(),
});
export type RequiredDateTarget = z.infer<typeof requiredDateTargetSchema>;
export type RequiredDatePins = z.infer<typeof requiredDatePinsSchema>;
export type RequiredDateDecision = z.infer<typeof requiredDateDecisionSchema>;
export const requiredDateUnitId = (batchId: string, candidateId: string) =>
  `required-date:${uuid.parse(batchId)}:${uuid.parse(candidateId)}:ORIGIN.local_date`;
export type RequiredDateSavedAnswer = {
  decisionId: string;
  version: number;
  date: string;
  recordedAt: string;
  clock: "DEVICE_WALL";
  pins: RequiredDatePins;
};
export function requiredDateDecisionState(
  current: RequiredDatePins,
  latest: RequiredDateSavedAnswer | null,
) {
  const same =
    latest !== null && JSON.stringify(current) === JSON.stringify(latest.pins);
  return {
    decision:
      latest === null
        ? ("UNANSWERED" as const)
        : same
          ? ("SAVED" as const)
          : ("NEEDS_RECHECK" as const),
    application: "APPLY_UNAVAILABLE" as const,
    resolution: "WAITING" as const,
    remainingChange: 0 as const,
    canonicalReceipt: null,
  };
}
