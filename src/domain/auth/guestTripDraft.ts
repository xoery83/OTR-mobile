import { z } from "zod";
import { coreUuid } from "../trip/tripCoreV2";
import { localPersonNameSlotSchema } from "../trip/localTripPerson";
import { localTripDestinationInputSchema } from "../trip/localTripDestination";
import { tripMetadataSchema } from "../trip/tripMetadataContract";
import {
  structuredTripMetadataSchema,
  structuredTripMetadataSnapshotSchema,
} from "../trip/tripStructuredDestinationContract";

// Raw UI values: never trim, normalize or require a finished valid Trip draft.
const text = z.string().max(256);
const dates = { start: z.string().max(10), end: z.string().max(10) };
const selection = z.strictObject({
  localId: coreUuid,
  text,
  source: z.enum(["MANUAL", "APPLE"]),
  match: z
    .strictObject({
      provider: z.literal("apple"),
      providerPlaceId: z.string().nullable(),
      title: z.string(),
      secondary: z.string(),
      address: z.string().optional(),
      point: z
        .strictObject({ latitude: z.number().finite(), longitude: z.number().finite() })
        .optional(),
      category: z.string().optional(),
    })
    .optional(),
});
const base = {
  schemaId: z.literal("otr.auth.guest-trip-draft/1"),
  draftId: coreUuid,
  tripId: coreUuid,
};
export const guestTripEditContextSchema = z.strictObject({
  tripId: coreUuid,
  syncFormatVersion: z.literal(2).nullable(),
  metadataBase: structuredTripMetadataSnapshotSchema.nullable(),
  deferredMetadataBase: structuredTripMetadataSchema.nullable(),
  deferredActionId: coreUuid.nullable(),
});
export const guestTripDraftSnapshotSchema = z
  .discriminatedUnion("mode", [
    z.strictObject({
      ...base,
      mode: z.literal("CREATE"),
      value: z.strictObject({
        operation: z.strictObject({ operationId: coreUuid, tripId: coreUuid }),
        name: text,
        ...dates,
        destinations: z.array(selection),
        selfNickname: text,
        knownSelfName: text,
        travelers: z.array(localPersonNameSlotSchema),
      }),
    }),
    z.strictObject({
      ...base,
      mode: z.literal("EDIT"),
      value: z.strictObject({
        fields: z.strictObject({
          before: tripMetadataSchema,
          beforeCover: z.string().nullable(),
          draftCover: z.string().nullable(),
          coverChanged: z.boolean(),
          initialDestinations: z.array(selection),
          destinationItems: z.array(selection),
          destinationsBefore: z.array(localTripDestinationInputSchema),
          name: text,
          destination: text,
          ...dates,
        }),
        context: guestTripEditContextSchema,
      }),
    }),
  ])
  .superRefine((snapshot, context) => {
    const tripId =
      snapshot.mode === "CREATE"
        ? snapshot.value.operation.tripId
        : snapshot.value.context.tripId;
    if (
      snapshot.mode === "EDIT" &&
      snapshot.value.context.metadataBase &&
      snapshot.value.context.metadataBase.tripId !== snapshot.tripId
    )
      context.addIssue({ code: "custom", message: "GUEST_TRIP_DRAFT_METADATA_SCOPE" });
    if (tripId !== snapshot.tripId)
      context.addIssue({ code: "custom", message: "GUEST_TRIP_DRAFT_SCOPE" });
  });
export type GuestTripDraftSnapshot = z.infer<typeof guestTripDraftSnapshotSchema>;
