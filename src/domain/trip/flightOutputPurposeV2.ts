import { z } from "zod";
import { importDigest, type ImportHash } from "./flightImportReview";
import { validateCalendarDate } from "./dayReadModel";
import type { Json } from "./eventIntentJson";

const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().positive().safe();
const boundedIdentity = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => v === v.trim() && !v.includes("\0"));
const supplierIdentity = z.strictObject({
  namespace: boundedIdentity,
  issuer: boundedIdentity,
  value: boundedIdentity,
  scopeId: boundedIdentity,
});
const airport = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => v === v.trim() && !v.includes("\0"));
export const flightPurposeIdentityV2Schema = z
  .strictObject({
    namespace: z.enum(["IATA_AIRLINE", "ICAO_AIRLINE"]),
    issuer: z.enum(["IATA", "ICAO"]),
    operator: z.string().regex(/^[A-Z0-9]{2,3}$/),
    serviceNumber: z
      .string()
      .min(1)
      .max(64)
      .refine((v) => v === v.trim() && !v.includes("\0")),
    originDate: z.string().refine((value) => {
      try {
        validateCalendarDate(value);
        return true;
      } catch {
        return false;
      }
    }),
    originAirportId: airport,
    destinationAirportId: airport,
    operatingOccurrence: boundedIdentity.optional(),
    supplierOccurrence: supplierIdentity.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.namespace === "IATA_AIRLINE"
        ? value.issuer !== "IATA" || !/^[A-Z0-9]{2}$/.test(value.operator)
        : value.issuer !== "ICAO" || !/^[A-Z]{3}$/.test(value.operator)
    )
      context.addIssue({ code: "custom", message: "UNRESOLVED_IDENTITY" });
    if (value.originAirportId === value.destinationAirportId)
      context.addIssue({ code: "custom", message: "UNRESOLVED_IDENTITY" });
  });
const evidenceRef = z
  .string()
  .max(512)
  .regex(
    /^track-c\/field-evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._:-]{1,128}$/,
  );
export type FlightPurposeEvidenceV2 = z.infer<typeof flightPurposeEvidenceV2Schema>;
export const flightPurposeEvidenceV2Schema = z.strictObject({
  service: z.array(evidenceRef).min(1).max(16),
  originDate: z.array(evidenceRef).min(1).max(16),
  originAirportId: z.array(evidenceRef).min(1).max(16),
  destinationAirportId: z.array(evidenceRef).min(1).max(16),
  operatingOccurrence: z.array(evidenceRef).min(1).max(16).optional(),
  supplierOccurrence: z.array(evidenceRef).min(1).max(16).optional(),
});
const purposeFields = {
  version: z.literal(2),
  planId: uuid,
  slotId: uuid,
  sourceId: uuid,
  sourceRevision: revision,
  inputCatalogSha256: hash,
  candidateSha256: hash,
  targetKind: z.literal("ITEM"),
  targetId: uuid,
  purposeKind: z.literal("FLIGHT_OCCURRENCE"),
};
export const flightPurposeBindingV2Schema = z.strictObject({
  accountId: uuid,
  tripId: uuid,
  runId: uuid,
  candidateId: uuid,
  ...purposeFields,
});
export const flightOutputPurposeV2Schema = z.strictObject({
  ...purposeFields,
  identityFacts: flightPurposeIdentityV2Schema,
  identityEvidenceRefs: flightPurposeEvidenceV2Schema,
  purposeSha256: hash,
});
export type FlightPurposeBindingV2 = z.infer<typeof flightPurposeBindingV2Schema>;
export type FlightPurposeIdentityV2 = z.infer<typeof flightPurposeIdentityV2Schema>;
export type FlightOutputPurposeV2 = z.infer<typeof flightOutputPurposeV2Schema>;
export type CertifiedFlightPurposeV2 = {
  purpose: FlightOutputPurposeV2;
  identitySha256: string;
};
export type FlightPurposeEvidenceVerifierV2 = (input: {
  binding: FlightPurposeBindingV2;
  identityFacts: FlightPurposeIdentityV2;
  identityEvidenceRefs: z.infer<typeof flightPurposeEvidenceV2Schema>;
}) => Promise<void>;

async function identityDigest(identity: FlightPurposeIdentityV2, sha256: ImportHash) {
  const {
    operatingOccurrence: _operating,
    supplierOccurrence: _supplier,
    ...tuple
  } = identity;
  return importDigest("otr-trip-core-flight-identity-v2", tuple as Json, sha256);
}
function requireContinuityEvidence(
  identity: FlightPurposeIdentityV2,
  evidence: z.infer<typeof flightPurposeEvidenceV2Schema>,
) {
  for (const key of ["operatingOccurrence", "supplierOccurrence"] as const)
    if ((identity[key] === undefined) !== (evidence[key] === undefined))
      throw new Error("INVALID_PROVENANCE");
}

export async function mintFlightOutputPurposeV2(
  binding: FlightPurposeBindingV2,
  identityFacts: FlightPurposeIdentityV2,
  identityEvidenceRefs: z.infer<typeof flightPurposeEvidenceV2Schema>,
  verifyEvidence: FlightPurposeEvidenceVerifierV2,
  sha256: ImportHash,
): Promise<CertifiedFlightPurposeV2> {
  const pinned = structuredClone({ binding, identityFacts, identityEvidenceRefs });
  pinned.binding = flightPurposeBindingV2Schema.parse(pinned.binding);
  pinned.identityFacts = flightPurposeIdentityV2Schema.parse(pinned.identityFacts);
  pinned.identityEvidenceRefs = flightPurposeEvidenceV2Schema.parse(
    pinned.identityEvidenceRefs,
  );
  requireContinuityEvidence(pinned.identityFacts, pinned.identityEvidenceRefs);
  for (const refs of Object.values(pinned.identityEvidenceRefs)) {
    if (new Set(refs).size !== refs.length) throw new Error("INVALID_PROVENANCE");
    refs.sort();
  }
  // The owning verifier checks sealed Source/run/candidate pins and exact values, not confidence.
  await verifyEvidence(structuredClone(pinned));
  const {
    accountId: _account,
    tripId: _trip,
    runId: _run,
    candidateId: _candidate,
    ...fields
  } = pinned.binding;
  const unsigned = {
    ...fields,
    identityFacts: pinned.identityFacts,
    identityEvidenceRefs: pinned.identityEvidenceRefs,
  };
  return {
    purpose: {
      ...unsigned,
      purposeSha256: await importDigest(
        "otr-trip-core-output-purpose-v2",
        unsigned as Json,
        sha256,
      ),
    },
    identitySha256: await identityDigest(pinned.identityFacts, sha256),
  };
}

async function verifyCertificate(
  certified: CertifiedFlightPurposeV2,
  binding: FlightPurposeBindingV2,
  sha256: ImportHash,
) {
  const purpose = flightOutputPurposeV2Schema.parse(certified.purpose);
  const expected = flightPurposeBindingV2Schema.parse(binding);
  requireContinuityEvidence(purpose.identityFacts, purpose.identityEvidenceRefs);
  const { purposeSha256, ...unsigned } = purpose;
  for (const key of Object.keys(purposeFields) as (keyof typeof purposeFields)[])
    if (purpose[key] !== expected[key])
      throw new Error("OUTPUT_PURPOSE_BINDING_MISMATCH");
  if (
    purposeSha256 !==
      (await importDigest("otr-trip-core-output-purpose-v2", unsigned as Json, sha256)) ||
    certified.identitySha256 !== (await identityDigest(purpose.identityFacts, sha256))
  )
    throw new Error("INVALID_OUTPUT_PURPOSE");
  return purpose;
}

export function compareFlightOutputPurposesV2(
  left: FlightPurposeIdentityV2,
  right: FlightPurposeIdentityV2,
): "SAME_OUTPUT" | "DISTINCT_OUTPUT" | "UNKNOWN" {
  left = flightPurposeIdentityV2Schema.parse(left);
  right = flightPurposeIdentityV2Schema.parse(right);
  const sameSupplier =
    left.supplierOccurrence &&
    right.supplierOccurrence &&
    ["namespace", "issuer", "value", "scopeId"].every(
      (key) =>
        left.supplierOccurrence![key as keyof typeof left.supplierOccurrence] ===
        right.supplierOccurrence![key as keyof typeof right.supplierOccurrence],
    );
  const sameOperating =
    left.operatingOccurrence !== undefined &&
    left.operatingOccurrence === right.operatingOccurrence;
  if (left.originDate !== right.originDate)
    return sameSupplier || sameOperating ? "UNKNOWN" : "DISTINCT_OUTPUT";
  const sameRoute =
    left.originAirportId === right.originAirportId &&
    left.destinationAirportId === right.destinationAirportId;
  if ((sameSupplier || sameOperating) && !sameRoute) return "UNKNOWN";
  if (sameRoute)
    return sameSupplier ||
      sameOperating ||
      (left.namespace === right.namespace &&
        left.issuer === right.issuer &&
        left.operator === right.operator &&
        left.serviceNumber === right.serviceNumber)
      ? "SAME_OUTPUT"
      : "UNKNOWN";
  if (
    left.originAirportId === right.destinationAirportId &&
    left.destinationAirportId === right.originAirportId
  )
    return "DISTINCT_OUTPUT";
  // shortcut: reroutes/connections without reviewed leg continuity stay UNKNOWN; extend with that contract.
  return "UNKNOWN";
}

export type FlightOutputClaimV2 =
  | {
      kind: "LEGACY";
      accountId: string;
      tripId: string;
      slotId: string;
      outcome: "UNKNOWN" | "SUCCEEDED" | "NO_COMMIT";
    }
  | {
      kind: "CERTIFIED";
      binding: FlightPurposeBindingV2;
      certified: CertifiedFlightPurposeV2;
      outcome: "UNKNOWN" | "SUCCEEDED" | "NO_COMMIT";
    };

export async function assertFlightOutputClaimsV2(
  binding: FlightPurposeBindingV2,
  certified: CertifiedFlightPurposeV2,
  priorClaims: readonly FlightOutputClaimV2[],
  sha256: ImportHash,
): Promise<"NEW_OUTPUT" | "EXACT_REPLAY"> {
  const pinned = structuredClone({ binding, certified, priorClaims });
  const purpose = await verifyCertificate(pinned.certified, pinned.binding, sha256);
  if (pinned.priorClaims.length > 64) throw new Error("IMPORT_RESOURCE_LIMIT");
  let replay = false;
  // Caller holds Source/claim locks and supplies the complete authoritative lineage claim set.
  for (const claim of pinned.priorClaims) {
    const accountId =
      claim.kind === "LEGACY" ? uuid.parse(claim.accountId) : claim.binding.accountId;
    const tripId =
      claim.kind === "LEGACY" ? uuid.parse(claim.tripId) : claim.binding.tripId;
    if (accountId !== pinned.binding.accountId || tripId !== pinned.binding.tripId)
      throw new Error("IMPORT_SCOPE_MISMATCH");
    if (claim.kind === "LEGACY") {
      if (claim.outcome === "NO_COMMIT") continue;
      throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
    }
    const previous = flightPurposeBindingV2Schema.parse(claim.binding);
    const other = await verifyCertificate(claim.certified, previous, sha256);
    if (other.slotId === purpose.slotId) {
      if (
        other.purposeSha256 !== purpose.purposeSha256 ||
        previous.runId !== pinned.binding.runId ||
        previous.candidateId !== pinned.binding.candidateId ||
        previous.accountId !== pinned.binding.accountId ||
        previous.tripId !== pinned.binding.tripId
      )
        throw new Error("OPERATION_REUSE_MISMATCH");
      replay = true;
      continue;
    }
    if (claim.outcome === "NO_COMMIT") continue;
    if (other.targetId === purpose.targetId) throw new Error("OUTPUT_TARGET_COLLISION");
    const relation = compareFlightOutputPurposesV2(
      purpose.identityFacts,
      other.identityFacts,
    );
    if (relation === "SAME_OUTPUT") throw new Error("OUTPUT_PURPOSE_COLLISION");
    if (relation === "UNKNOWN") throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
  }
  return replay ? "EXACT_REPLAY" : "NEW_OUTPUT";
}
