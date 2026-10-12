import { z } from "zod";
import { coreUuid, coreHash } from "./tripCoreV2";
import { sourcePdfSealRequestSchema, sourcePdfSealSchema } from "./sourcePdfAuthority";
export const sourcePdfRegistrationRequestSchema = sourcePdfSealRequestSchema.extend({
  verificationOperationId: coreUuid,
  verificationResultSha256: coreHash,
});
export type SourcePdfRegistrationRequest = z.infer<
  typeof sourcePdfRegistrationRequestSchema
>;
export const sourcePdfRegistrationBodySchema = sourcePdfSealSchema.extend({
  request: sourcePdfRegistrationRequestSchema,
});
export const sourcePdfRegistrationReceiptSchema = z.strictObject({
  derivativeVersion: z.literal(1),
  operationId: coreUuid,
  registrationSha256: coreHash,
  body: sourcePdfRegistrationBodySchema,
});
export const sourcePdfVerifyCommandSchema = z.strictObject({
  contract_version: z.literal(1),
  command: z.literal("VERIFY_REPRESENTATION"),
  operation_id: coreUuid,
  operation_key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  actor_account_id: coreUuid,
  trip_id: coreUuid,
  source_id: coreUuid,
  operation_sha256: coreHash,
  payload: z.strictObject({
    material_revision: z.number().int().positive().safe(),
    expected_source_row_revision: z.number().int().positive().safe(),
    expected_source_state: z.strictObject({
      lifecycle: z.literal("ACTIVE"),
      retention_state: z.literal("RETAINED"),
    }),
    representation_id: coreUuid,
    expected_representation_row_revision: z.number().int().positive().safe(),
    expected_representation_state: z.strictObject({
      remote_state: z.literal("PENDING"),
      retention_state: z.literal("RETAINED"),
    }),
  }),
});
export type SourcePdfVerifyCommand = z.infer<typeof sourcePdfVerifyCommandSchema>;
