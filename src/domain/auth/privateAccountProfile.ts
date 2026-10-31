import { z } from "zod";

// Original characters are retained; PostgreSQL text/JSON cannot retain NUL.
const name = z.string().refine((value) => !value.includes("\0"), "PROFILE_NAME_INVALID");

export const travelDocumentNameSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("SPLIT"),
    familyName: name.nullable(),
    givenNames: name.nullable(),
  }),
  z.strictObject({ mode: z.literal("UNSPLIT"), fullName: name }),
]);

// Account-private values only. Identity, roles and connection proofs belong to their owning contracts.
export const privateAccountProfileFieldsSchema = z.strictObject({
  displayName: name.nullable().optional(),
  travelDocumentName: travelDocumentNameSchema.nullable().optional(),
});

export type TravelDocumentName = z.infer<typeof travelDocumentNameSchema>;
export type PrivateAccountProfileFields = z.infer<
  typeof privateAccountProfileFieldsSchema
>;

export const privateProfileNameDraftSchema = z.strictObject({
  displayName: name,
  mode: z.enum(["SPLIT", "UNSPLIT"]),
  familyName: name,
  givenNames: name,
  fullName: name,
});
export type PrivateProfileNameDraft = Readonly<z.infer<typeof privateProfileNameDraftSchema>>;

export function privateProfileDraft(
  fields: PrivateAccountProfileFields = {},
): PrivateProfileNameDraft {
  const document = fields.travelDocumentName;
  return {
    displayName: fields.displayName ?? "",
    mode: document?.mode ?? "SPLIT",
    familyName: document?.mode === "SPLIT" ? document.familyName ?? "" : "",
    givenNames: document?.mode === "SPLIT" ? document.givenNames ?? "" : "",
    fullName: document?.mode === "UNSPLIT" ? document.fullName : "",
  };
}
