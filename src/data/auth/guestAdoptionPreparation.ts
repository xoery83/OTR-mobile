import { guestP1DraftSnapshotSchema as draft } from "@/domain/auth/guestP1Draft";
import { guestTripDraftSnapshotSchema } from "@/domain/auth/guestTripDraft";
import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { guestSourceCheckpointSchema } from "./guestTripP1SourceSchema";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const draftEntry = z.strictObject({
  id: coreUuid,
  canonicalText: z.string(),
  sha256: digest,
  bytes: z.number().int().nonnegative().safe(),
});
export const guestAdoptionBindingSchema = z.strictObject({
  schemaId: z.enum([
    "otr.auth.guest-adoption-recovery/1",
    "otr.auth.guest-adoption-recovery/2",
    "otr.auth.guest-adoption-recovery/3",
  ]),
  sourceKind: z.literal("GUEST"),
  sourceGuestLocalId: coreUuid,
  adoptionId: coreUuid,
  targetAccountId: coreUuid,
});
const preparationFields = guestAdoptionBindingSchema.extend({
  checkpoint: z.literal("PREPARED"),
  inventorySha256: digest,
  tripIds: z.array(coreUuid),
  drafts: z.array(draftEntry),
  source: guestSourceCheckpointSchema.optional(),
});
export const guestAdoptionPreparationSchema = preparationFields.superRefine(
  (value, context) => {
    if (
      (value.schemaId === "otr.auth.guest-adoption-recovery/3") !==
      (value.source !== undefined)
    )
      context.addIssue({
        code: "custom",
        message: "GUEST_ADOPTION_RECOVERY_SOURCE_VERSION",
      });
  },
);
export type GuestAdoptionPreparation = z.infer<typeof guestAdoptionPreparationSchema>;
const canonical = (value: unknown) => canonicalCoreJson(value as Json);
const sha = (text: string) => tripCoreSha256Hex(new TextEncoder().encode(text));

export async function verifyGuestAdoptionDrafts(
  input: Pick<
    GuestAdoptionPreparation,
    "schemaId" | "sourceGuestLocalId" | "tripIds" | "drafts"
  >,
) {
  const value = preparationFields
    .pick({
      schemaId: true,
      sourceGuestLocalId: true,
      tripIds: true,
      drafts: true,
    })
    .strip()
    .parse(input);
  if (
    new Set(value.tripIds).size !== value.tripIds.length ||
    new Set(value.drafts.map((entry) => entry.id)).size !== value.drafts.length
  )
    throw Error("GUEST_ADOPTION_RECOVERY_DUPLICATE");
  for (const entry of value.drafts) {
    const body = (
      value.schemaId === "otr.auth.guest-adoption-recovery/1"
        ? draft
        : z.union([draft, guestTripDraftSnapshotSchema])
    ).parse(JSON.parse(entry.canonicalText));
    const isP1 = body.schemaId === "otr.auth.guest-p1-draft/1";
    const id = isP1 ? body.itemId : body.draftId;
    if (
      !isP1 &&
      body.mode === "EDIT" &&
      body.value.context.metadataBase &&
      body.value.context.metadataBase.actorAccountId !== value.sourceGuestLocalId
    )
      throw Error("GUEST_ADOPTION_RECOVERY_DRAFT_SCOPE");
    // An unsubmitted Trip Create remains recovery material, never a published Trip shell.
    const tripBound =
      !isP1 && body.mode === "CREATE"
        ? !value.tripIds.includes(body.tripId)
        : value.tripIds.includes(body.tripId);
    if (
      id !== entry.id ||
      !tripBound ||
      canonical(body) !== entry.canonicalText ||
      new TextEncoder().encode(entry.canonicalText).byteLength !== entry.bytes ||
      (await sha(entry.canonicalText)) !== entry.sha256
    )
      throw Error("GUEST_ADOPTION_RECOVERY_DRAFT_PIN");
  }
}
