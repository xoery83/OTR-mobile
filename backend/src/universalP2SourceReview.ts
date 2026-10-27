import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import { universalP2SourceReviewSchema } from "../../src/domain/trip/universalP2SourceReview";
import {
  normalizeFlightObservation,
  parseReferenceFlightText,
} from "../../src/domain/trip/referenceFlightExtractor";
import { interpretationMaterialSchema } from "../../src/domain/intelligence/interpretation";
import { flightCommandLeaves } from "../../src/domain/trip/flightAdmission";
import { buildCaptureFlightSourcePlanV2 } from "../../src/data/interpretation/captureFlightCoreV2";
import { universalP1Identity } from "./universalP1Source";
import {
  coreCandidatePublicationV2Schema,
  fieldRef,
  sourceValues,
  observationPath,
  type CoreCandidatePublicationV2,
} from "./tripCoreV2CandidatePublication";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";

const selectionSchema = z.strictObject({
  token: z.string().min(1).max(128),
  resultSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceReview: universalP2SourceReviewSchema,
});
// Explicit literal review only; owning Flight publication and Admission remain mandatory.
export async function reviewUniversalP2Selection(
  input: {
    context: AccountRequestContext;
    result: unknown;
    resultSha256: string;
    selection: unknown;
    material: {
      inputId: string;
      sourceId: string;
      sourceRevision: number;
      representationId: string;
      sha256: string;
      bytes: Uint8Array;
    };
  },
  deps: { hash: ImportHash; getAccountId(): Promise<string> },
) {
  await assertAccountRequestContext(input.context, deps.getAccountId);
  const result = universalResultSchema.parse(input.result),
    selection = selectionSchema.parse(input.selection),
    review = selection.sourceReview,
    material = input.material;
  if (
    result.actorId !== input.context.accountId ||
    result.accountId !== input.context.accountId ||
    result.tripId !== input.context.tripId ||
    result.providerOutcome !== "SETTLED" ||
    result.status !== "CANDIDATES_READY" ||
    selection.resultSha256 !== input.resultSha256 ||
    review.sourceRevision !== material.sourceRevision ||
    (await deps.hash(material.bytes)) !== material.sha256
  )
    throw Error("UNIVERSAL_SELECTION_UNAVAILABLE");
  const candidates = result.candidates.filter((c) => c.token === selection.token);
  if (
    candidates.length !== 1 ||
    candidates[0].kind !== "P2" ||
    candidates[0].subtype !== "FLIGHT" ||
    candidates[0].bookingTokens.length ||
    candidates[0].ticketTokens.length ||
    result.unresolved.length ||
    result.advisoryStatus === "INVALID"
  )
    throw Error("OWNING_REVIEW_REQUIRED");
  const candidate = candidates[0];
  const bindings = result.sourceBindings.filter(
    (b) =>
      b.sourceId === material.sourceId &&
      b.inputId === material.inputId &&
      b.representationId === material.representationId &&
      b.revision === material.sourceRevision &&
      b.originalSha256 === material.sha256 &&
      b.submittedSha256 === material.sha256 &&
      b.status === "READY",
  );
  if (bindings.length !== 1) throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const fields = (paths: string[], raw: string) => {
    const selected = candidate.fields.filter((f) => paths.includes(f.path));
    if (!selected.length || selected.some((f) => f.raw !== raw || f.uncertainty))
      throw Error("SOURCE_REVIEW_MISMATCH");
    for (const f of selected) {
      if (
        !("start" in f) ||
        f.sourceId !== bindings[0].alias ||
        f.start < 0 ||
        f.end <= f.start ||
        f.end > material.bytes.length ||
        new TextDecoder("utf-8", { fatal: true }).decode(
          material.bytes.subarray(f.start, f.end),
        ) !== f.raw
      )
        throw Error("IMPORT_EVIDENCE_INVALID");
    }
    return selected;
  };
  normalizeFlightObservation("service", review.flightNumberLiteral);
  const evidence = [
    ...fields(
      ["service", "flight_number", "marketing_flight"],
      review.flightNumberLiteral,
    ),
    ...fields(["origin.local_date"], review.departureDate),
  ];
  await assertAccountRequestContext(input.context, deps.getAccountId);
  return {
    taskId: result.taskId,
    batchId: result.batchId,
    token: candidate.token,
    sourceId: material.sourceId,
    sourceRevision: material.sourceRevision,
    resultSha256: input.resultSha256,
    sourceReview: review,
    flightNumberLiteral: review.flightNumberLiteral,
    departureDate: review.departureDate,
    evidence,
    sourceObservations: candidate.fields.filter((f) => !evidence.includes(f)),
    grantsAdmission: false as const,
    requiresOwningFlightProof: true as const,
  };
}

// Proposals use the existing independent Flight grammar and Source Plan builder.
// The caller must supply owning Published Task/Run/catalog pins, never client hashes.
export async function projectUniversalP2SourceProposal(
  input: Omit<Parameters<typeof reviewUniversalP2Selection>[0], "material"> & {
    runId: string;
    inputCatalogSha256: string;
    material: import("./tripCoreV2CandidatePublication").CorePublicationMaterial;
  },
  deps: Parameters<typeof reviewUniversalP2Selection>[1],
) {
  const material = interpretationMaterialSchema.parse(input.material);
  if (
    material.form !== "TEXT" ||
    material.media_type !== "text/plain" ||
    material.pin.historical_selection
  )
    throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const reviewed = await reviewUniversalP2Selection(
    {
      ...input,
      material: {
        inputId: material.pin.id,
        sourceId: material.pin.source_id,
        sourceRevision: material.pin.material_revision,
        representationId: material.pin.representation_id,
        sha256: material.pin.payload_sha256,
        bytes: Buffer.from(material.text),
      },
    },
    deps,
  );
  if (Buffer.byteLength(material.text) !== material.pin.byte_count)
    throw Error("SOURCE_INTEGRITY_FAILURE");
  const parsed = parseReferenceFlightText(material.pin.id, material.text);
  if (
    parsed.items.length !== 1 ||
    parsed.ignored.length ||
    parsed.items.some((item) =>
      item.fields.some(
        (f) =>
          ![
            "transport_subtype",
            "service",
            "origin.airport",
            "destination.airport",
            "origin.local_date",
          ].includes(f.path),
      ),
    )
  )
    throw Error("INCOMPLETE_SOURCE_EVIDENCE");
  const item = parsed.items[0],
    values = sourceValues(item);
  if (
    values.services?.[0]?.service_literal !== reviewed.flightNumberLiteral ||
    values.origin?.time.local_date !== reviewed.departureDate
  )
    throw Error("SOURCE_REVIEW_MISMATCH");
  const identity = (purpose: string) =>
    universalP1Identity(reviewed.taskId, reviewed.token, "p2-" + purpose);
  const candidateId = identity("candidate");
  const facts = {
    flightNumberLiteral: reviewed.flightNumberLiteral,
    departureDate: reviewed.departureDate,
    ...values,
  };
  const leaves = {
    flightNumberLiteral: reviewed.flightNumberLiteral,
    departureDate: reviewed.departureDate,
    ...flightCommandLeaves(values),
  };
  const evidence: CoreCandidatePublicationV2["evidence"] = [];
  for (const key of Object.keys(leaves)) {
    const fields = item.fields.filter((f) => f.path === observationPath(key));
    if (
      fields.length !== 1 ||
      fields[0].uncertainty.length ||
      fields[0].fragment_ids.length !== 1
    )
      throw Error("INCOMPLETE_SOURCE_EVIDENCE");
    const fragment = parsed.fragments.find((f) => f.id === fields[0].fragment_ids[0]);
    if (!fragment) throw Error("IMPORT_EVIDENCE_INVALID");
    evidence.push({
      candidateId,
      fieldKey: key,
      inputId: material.pin.id,
      locator: fragment.locator,
    });
  }
  const unbound = coreCandidatePublicationV2Schema.parse({
    publicationVersion: 2,
    publicationId: identity("publication"),
    sourceId: material.pin.source_id,
    sourceRevision: material.pin.material_revision,
    runId: z.uuid().parse(input.runId),
    inputCatalogSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(input.inputCatalogSha256),
    candidates: [
      {
        schemaId: "otr.trip.capture.candidate/2",
        candidateId,
        accountId: input.context.accountId,
        tripId: input.context.tripId,
        sourceId: material.pin.source_id,
        sourceRevision: material.pin.material_revision,
        runId: input.runId,
        inputRepresentationIds: [material.pin.representation_id],
        kind: "P2",
        facts,
        fieldKnowledge: Object.fromEntries(
          Object.keys(leaves).map((key) => [key, "PRESENT"]),
        ),
        fieldEvidence: Object.fromEntries(
          Object.keys(leaves).map((key) => [key, [fieldRef(candidateId, key)]]),
        ),
        existingTargetHint: null,
        unmappedObservations: [],
      },
    ],
    evidence,
  });
  const plan = buildCaptureFlightSourcePlanV2(
    unbound,
    identity("plan"),
    [
      {
        candidateId,
        itemId: identity("item"),
        createSlotId: identity("slot"),
        createOperationId: identity("operation"),
        qualifySlotId: identity("qualify-slot"),
        qualifyOperationId: identity("qualify-operation"),
      },
    ],
    "SPARSE_ONLY",
  );
  const binding = {
    version: "otr.universal.p2-source-proposal/1" as const,
    taskId: reviewed.taskId,
    batchId: reviewed.batchId,
    runId: input.runId,
    resultSha256: reviewed.resultSha256,
    token: reviewed.token,
    sourceReview: reviewed.sourceReview,
    proposedPlanSha256: await coreHashValue(
      "otr-trip-core-source-plan-v2",
      plan,
      deps.hash,
    ),
  };
  const publication = coreCandidatePublicationV2Schema.parse({
    ...unbound,
    universalP2: binding,
  });
  await assertAccountRequestContext(input.context, deps.getAccountId);
  return {
    publication,
    plan,
    binding,
    grantsAdmission: false as const,
  };
}
