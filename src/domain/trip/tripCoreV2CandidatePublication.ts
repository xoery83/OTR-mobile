import { z } from "zod";
import { coreUuid, coreHash } from "./tripCoreV2";
import { canonicalCoreJson, type Json } from "./tripCoreV2Json";
import { coreHashValue } from "./tripCoreV2Read";
import { flightEndpointSchema, flightServicesSchema } from "./flightAdmission";
import { flightLocatorSchema, type ImportHash } from "./flightImportReview";
import {
  flightPurposeIdentityV2Schema,
  flightPurposeEvidenceV2Schema,
} from "./flightOutputPurposeV2";
import { interpretationMaterialSchema } from "../intelligence/interpretation";
const date = z.string().regex(/^\d{4}-\d\d-\d\d$/);
const field = z
  .string()
  .max(128)
  .regex(
    /^(flightNumberLiteral|departureDate|ROOT\.title|(ORIGIN|DESTINATION)\.(local_date|local_time|zone_id|supplied_offset_seconds|source_instant|authored_label|authored_text|accepted_place_id)|SERVICE\.[A-Za-z0-9._:-]{1,32}\.(operator_namespace|operator_issuer|operator_value|operator_literal|service_number|service_literal|attribution|codeshare_operating_key))$/,
  );
const uniqueIds = z
  .array(coreUuid)
  .min(1)
  .max(64)
  .refine((a) => new Set(a).size === a.length);
const ref = z
  .string()
  .max(512)
  .regex(/^track-c\/field-evidence\/[0-9a-f-]{36}\/[A-Za-z0-9._:-]{1,128}$/);
export const coreFlightCandidateV2Schema = z
  .strictObject({
    schemaId: z.literal("otr.trip.capture.candidate/2"),
    candidateId: coreUuid,
    accountId: coreUuid,
    tripId: coreUuid,
    sourceId: coreUuid,
    sourceRevision: z.number().int().positive().safe(),
    runId: coreUuid,
    inputRepresentationIds: uniqueIds,
    kind: z.literal("P2"),
    facts: z.strictObject({
      flightNumberLiteral: z.string().min(1).max(255).nullable(),
      departureDate: date.nullable(),
      core: z.strictObject({ title: z.string().min(1).max(200) }).optional(),
      origin: flightEndpointSchema.optional(),
      destination: flightEndpointSchema.optional(),
      services: flightServicesSchema.optional(),
    }),
    fieldKnowledge: z.record(
      field,
      z.enum(["UNKNOWN", "AMBIGUOUS", "PRESENT", "NOT_APPLICABLE"]),
    ),
    fieldEvidence: z.record(field, z.array(ref).min(1).max(16)),
    existingTargetHint: z
      .strictObject({
        kind: z.literal("ITEM"),
        id: coreUuid,
        revision: z.number().int().positive().safe(),
      })
      .nullable(),
    unmappedObservations: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(128),
          value: z.string().max(2000),
          evidenceRefs: z.array(z.string().max(512)).max(16),
        }),
      )
      .max(64),
  })
  .superRefine((v, c) => {
    if (
      Object.keys(v.fieldKnowledge).length > 256 ||
      Object.keys(v.fieldEvidence).length > 256 ||
      new TextEncoder().encode(canonicalCoreJson(v as Json)).length > 32768
    )
      c.addIssue({ code: "custom", message: "CANDIDATE_LIMIT" });
  });
export const coreCandidatePublicationV2Schema = z
  .strictObject({
    publicationVersion: z.literal(2),
    publicationId: coreUuid,
    sourceId: coreUuid,
    sourceRevision: z.number().int().positive().safe(),
    runId: coreUuid,
    inputCatalogSha256: coreHash,
    candidates: z.array(coreFlightCandidateV2Schema).min(1).max(64),
    evidence: z
      .array(
        z.strictObject({
          candidateId: coreUuid,
          fieldKey: field,
          inputId: coreUuid,
          locator: flightLocatorSchema,
        }),
      )
      .min(1)
      .max(4096),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.candidates.map((x) => x.candidateId)).size !== v.candidates.length ||
      new Set(v.evidence.map((x) => x.candidateId + ":" + x.fieldKey)).size !==
        v.evidence.length ||
      v.evidence.some(
        (x) =>
          x.locator.input_id !== x.inputId ||
          !v.candidates.some((k) => k.candidateId === x.candidateId),
      ) ||
      new TextEncoder().encode(canonicalCoreJson(v as Json)).length > 32768
    )
      c.addIssue({ code: "custom", message: "INVALID_PUBLICATION" });
  });
export type CoreCandidatePublicationV2 = z.infer<typeof coreCandidatePublicationV2Schema>;
export const coreAirportBindingSchema = z.strictObject({
  namespace: z.literal("IATA_AIRPORT"),
  issuer: z.literal("IATA"),
  code: z.string().regex(/^[A-Z]{3}$/),
  identityId: z.string().regex(/^IATA_AIRPORT:[A-Z]{3}$/),
  registryVersion: z.string().min(1).max(128),
  registrySha256: coreHash,
  validFrom: date,
  validUntil: date.nullable(),
});
export type CoreAirportBinding = z.infer<typeof coreAirportBindingSchema>;
const verifiedField = z.strictObject({
  ref,
  sourceId: coreUuid,
  sourceRevision: z.number().int().positive().safe(),
  representationId: coreUuid,
  inputId: coreUuid,
  payloadSha256: coreHash,
  locator: flightLocatorSchema,
  value: z.json(),
});
export const sealedCoreFlightCandidateSchema = z.strictObject({
  version: z.literal(2),
  publicationId: coreUuid,
  candidate: coreFlightCandidateV2Schema,
  status: z.enum(["QUALIFIED", "REVIEW"]),
  errorCode: z.string().nullable(),
  identityFacts: flightPurposeIdentityV2Schema.nullable(),
  identityEvidenceRefs: flightPurposeEvidenceV2Schema.nullable(),
  values: z.json(),
  fieldEvidence: z.record(field, verifiedField),
  airportBindings: z.array(coreAirportBindingSchema).max(2),
  derivativeSeals: z
    .array(z.strictObject({ representationId: coreUuid, sealSha256: coreHash }))
    .max(64)
    .optional(),
});
export type SealedCoreFlightCandidate = z.infer<typeof sealedCoreFlightCandidateSchema>;
export const fieldRef = (candidateId: string, key: string) =>
  `track-c/field-evidence/${candidateId}/${key}`;
export async function candidatePublicationHash(
  body: SealedCoreFlightCandidate,
  hash: ImportHash,
) {
  return coreHashValue("otr-trip-core-source-candidate-v2", body as Json, hash);
}
export type CorePublicationMaterial = z.infer<typeof interpretationMaterialSchema>;

export const coreCandidatePublicationResultSchema = z
  .strictObject({
    publicationVersion: z.literal(2),
    publicationId: coreUuid,
    accountId: coreUuid,
    tripId: coreUuid,
    sourceId: coreUuid,
    sourceRevision: z.number().int().positive().safe(),
    runId: coreUuid,
    inputCatalogSha256: coreHash,
    requestSha256: coreHash,
    candidates: z
      .array(
        z.strictObject({
          candidateId: coreUuid,
          candidateSha256: coreHash,
          status: z.enum(["QUALIFIED", "REVIEW"]),
          errorCode: z.string().max(128).nullable(),
        }),
      )
      .min(1)
      .max(64),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.candidates.map((x) => x.candidateId)).size !== v.candidates.length ||
      v.candidates.some((x) => (x.status === "QUALIFIED") !== (x.errorCode === null))
    )
      c.addIssue({ code: "custom", message: "INVALID_PUBLICATION_RESULT" });
  });
export type CoreCandidatePublicationResult = z.infer<
  typeof coreCandidatePublicationResultSchema
>;
export async function candidatePublicationRequestHash(
  request: CoreCandidatePublicationV2,
  hash: ImportHash,
) {
  return coreHashValue("otr-trip-core-source-publication-v2", request as Json, hash);
}
