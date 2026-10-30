import { z } from "zod";
import { coreHash, coreUuid } from "@/domain/trip/tripCoreV2";
import { guestAdoptionPreflightGrantSchema } from "@/domain/auth/guestAdoptionPreflight";
import { guestAdoptionStatusRequestSchema } from "@/domain/auth/guestAdoptionStatus";
import { guestSourceCheckpointSchema } from "@/data/auth/guestTripP1SourceSchema";

export const guestAdoptionTargetConfirmationHeader = "X-OTR-Guest-Target-Confirmed";
export const guestAdoptionStageRequestSchema = z.strictObject({
  grant: guestAdoptionPreflightGrantSchema,
  preparation: guestSourceCheckpointSchema,
});
export const guestAdoptionStageResultSchema = guestAdoptionStatusRequestSchema.extend({
  status: z.literal("STAGED"),
  grantId: coreUuid,
  preparationSha256: coreHash,
  planSha256: coreHash,
});
export const guestAdoptionPublicationRequestSchema =
  guestAdoptionStatusRequestSchema.extend({ planSha256: coreHash });
