import { z } from "zod";
import { canonicalCoreJson } from "./tripCoreV2Json";
import { coreUuid, coreHash } from "./tripCoreV2";
import {
  bookingReviewHashV1,
  bookingPublicationV1Schema,
  bookingPurposeBindingV1Schema,
  bookingReviewBindingV1Schema,
  bookingFieldV1Schema,
} from "./bookingOutputPurposeV1";
export const sourceBookingPublishRequestSchema = z.strictObject({
  commercialVersion: z.literal(1),
  binding: bookingPurposeBindingV1Schema,
  publication: bookingPublicationV1Schema,
});
export const sourceBookingReviewRequestSchema = z.strictObject({
  commercialVersion: z.literal(1),
  action: z.literal("CONFIRM_SELECTION"),
  binding: bookingPurposeBindingV1Schema,
  publicationSha256: coreHash,
  decisionId: coreUuid,
  selectedFields: z.array(bookingFieldV1Schema).min(2).max(3),
});
export const sourceBookingWorkflowResultSchema = z.strictObject({
  commercialVersion: z.literal(1),
  binding: bookingPurposeBindingV1Schema,
  publicationSha256: coreHash,
  state: z.enum(["REVIEW_REQUIRED", "DECISION_SAVED"]),
  decision: bookingReviewBindingV1Schema.nullable(),
  admission: z.literal("BLOCKED"),
  reasonCode: z.enum([
    "COMMERCIAL_REVIEW_REQUIRED",
    "COMMERCIAL_ADMISSION_GATE_REQUIRED",
  ]),
  readyCommands: z.array(z.never()).max(0),
});
export type SourceBookingPublishRequest = z.infer<
  typeof sourceBookingPublishRequestSchema
>;
export type SourceBookingReviewRequest = z.infer<typeof sourceBookingReviewRequestSchema>;
export type SourceBookingWorkflowResult = z.infer<
  typeof sourceBookingWorkflowResultSchema
>;
export type SourceBookingWorkflowPort = {
  publish(
    actorAccountId: string,
    tripId: string,
    input: unknown,
  ): Promise<SourceBookingWorkflowResult>;
  confirm(
    actorAccountId: string,
    tripId: string,
    input: unknown,
  ): Promise<SourceBookingWorkflowResult>;
  read(
    actorAccountId: string,
    tripId: string,
    planId: string,
  ): Promise<SourceBookingWorkflowResult | null>;
};

export async function validateSourceBookingWorkflowResult(
  input: unknown,
  binding: import("./bookingOutputPurposeV1").BookingPurposeBindingV1,
  hash: import("./flightImportReview").ImportHash,
) {
  const result = sourceBookingWorkflowResultSchema.parse(input);
  if (canonicalCoreJson(result.binding) !== canonicalCoreJson(binding))
    throw new Error("INVALID_PROVENANCE");
  if (result.state === "REVIEW_REQUIRED") {
    if (result.decision !== null || result.reasonCode !== "COMMERCIAL_REVIEW_REQUIRED")
      throw new Error("INVALID_PROVENANCE");
  } else {
    if (!result.decision || result.reasonCode !== "COMMERCIAL_ADMISSION_GATE_REQUIRED")
      throw new Error("INVALID_PROVENANCE");
    const { decisionSha256, ...unsigned } = result.decision;
    if (
      canonicalCoreJson(result.decision.binding) !== canonicalCoreJson(binding) ||
      result.decision.publicationSha256 !== result.publicationSha256 ||
      (await bookingReviewHashV1(unsigned, hash)) !== decisionSha256
    )
      throw new Error("COMMERCIAL_REVIEW_STALE");
  }
  return result;
}
