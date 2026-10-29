import { z } from "zod";
import { coreParticipationSchema, coreUuid } from "../trip/tripCoreV2";

const draftFields = z.strictObject({
  title: z.string().max(200),
  startDate: z.string().max(10),
  startTime: z.string().max(5).nullable(),
  endDate: z.string().max(10).nullable(),
  endTime: z.string().max(5).nullable(),
  location: z.string().max(500).nullable(),
  description: z.string().max(5000).nullable(),
  participation: coreParticipationSchema,
});
export const guestP1DraftSnapshotSchema = z.strictObject({
  schemaId: z.literal("otr.auth.guest-p1-draft/1"),
  tripId: coreUuid,
  itemId: coreUuid,
  mode: z.enum(["CREATE", "EDIT"]),
  fields: draftFields,
  initialFields: draftFields,
  firstAttempt: z.null(),
  placeSelection: z.null(),
});
export type GuestP1DraftSnapshot = z.infer<typeof guestP1DraftSnapshotSchema>;
