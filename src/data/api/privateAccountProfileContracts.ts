import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { privateAccountProfileFieldsSchema } from "@/domain/auth/privateAccountProfile";

export const privateAccountProfilePath = "/v1/account/private-profile";
export const privateAccountProfileSnapshotSchema = z.strictObject({
  schemaId: z.literal("otr.auth.private-profile/1"),
  accountId: coreUuid,
  revision: z.number().int().nonnegative().safe(),
  fields: privateAccountProfileFieldsSchema,
});
export const privateAccountProfileMutationSchema = z.strictObject({
  operationId: coreUuid,
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  changes: privateAccountProfileFieldsSchema.refine(
    (fields) => Object.keys(fields).length > 0,
    "PROFILE_CHANGES_REQUIRED",
  ),
});
export const privateAccountProfileReceiptSchema = z.strictObject({
  schemaId: z.literal("otr.auth.private-profile-receipt/1"),
  accountId: coreUuid,
  operationId: coreUuid,
  revision: z.number().int().positive().safe(),
  recordedAt: z.iso.datetime({ offset: true }),
});
export type PrivateAccountProfileSnapshot = z.infer<
  typeof privateAccountProfileSnapshotSchema
>;
export type PrivateAccountProfileMutation = z.infer<
  typeof privateAccountProfileMutationSchema
>;
export type PrivateAccountProfileReceipt = z.infer<
  typeof privateAccountProfileReceiptSchema
>;
