import {
  interpretationMaterialSchema,
  type InterpretationRequest,
} from "@/domain/intelligence/interpretation";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { flightLocatorSchema, type ImportHash } from "@/domain/trip/flightImportReview";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { z } from "zod";
import type { FlightCandidateSet } from "./flightInterpretation";

import { assessFlightInterpretationQuality } from "./flightInterpretationQuality";
import { decideFlightEnrichment } from "./flightEnrichmentDecision";

// Private, transient evidence view; no Document identity or attachment acquisition is inferred.
export async function projectFlightEvidenceCoverage(
  context: AccountRequestContext,
  source: FlightCandidateSet,
  supplied: InterpretationRequest["materials"],
  sha256: ImportHash,
  getAccountId: () => Promise<string>,
  qualityOptions?: Parameters<typeof assessFlightInterpretationQuality>[1],
) {
  source = structuredClone(source);
  const materials = supplied.map((m) => interpretationMaterialSchema.parse(m));
  await assertAccountRequestContext(context, getAccountId);
  if (source.account_id !== context.accountId || source.trip_id !== context.tripId)
    throw new Error("IMPORT_SCOPE_MISMATCH");
  const pins = source.publication_request.inputs;
  if (
    materials.length !== pins.length ||
    new Set(materials.map((m) => m.pin.id)).size !== materials.length ||
    materials.reduce((n, m) => n + new TextEncoder().encode(m.text).length, 0) > 4194304
  )
    throw new Error("EVIDENCE_INPUT_MISMATCH");
  for (const material of materials) {
    const pin = pins.find((p) => p.id === material.pin.id);
    const bytes = new TextEncoder().encode(material.text);
    if (
      !pin ||
      canonicalEventJson(pin as Json) !== canonicalEventJson(material.pin as Json) ||
      bytes.length !== pin.byte_count ||
      (await sha256(bytes)) !== pin.payload_sha256
    )
      throw new Error("EVIDENCE_INPUT_MISMATCH");
  }
  function evidence(locator: z.infer<typeof flightLocatorSchema>) {
    locator = flightLocatorSchema.parse(locator);
    const material = materials.find((m) => m.pin.id === locator.input_id);
    if (!material) throw new Error("EVIDENCE_INVALID");
    const bytes = new TextEncoder().encode(material.text);
    if (
      locator.kind === "TEXT_SPAN" &&
      (locator.end! > bytes.length || locator.start! > locator.end!)
    )
      throw new Error("EVIDENCE_INVALID");
    return {
      pin: material.pin,
      locator,
      raw:
        locator.kind === "TEXT_SPAN"
          ? new TextDecoder("utf-8", { fatal: true }).decode(
              bytes.slice(locator.start!, locator.end!),
            )
          : null,
    };
  }
  const quality = assessFlightInterpretationQuality(source, qualityOptions);
  const result = {
    quality,
    enrichment: decideFlightEnrichment(quality),
    access: "OWNER_PRIVATE" as const,
    materials,
    interpreted: source.candidates.map((candidate) => ({
      candidateId: candidate.id,
      // Candidate sort order is opaque; tokens and byte locators retain source ordering.
      observationTokens: candidate.observation_tokens,
      fields: Object.entries(candidate.occurrence).map(([path, field]) => ({
        path,
        knowledge: field.knowledge,
        value: field.value,
        observations: field.observations.map((observation) => ({
          ...observation,
          evidence: observation.fragment_ids.map((id) => {
            const fragment = source.fragments.find((f) => f.id === id);
            if (!fragment) throw new Error("EVIDENCE_INVALID");
            const retained = evidence(fragment.locator);
            if (
              fragment.source_id !== retained.pin.source_id ||
              fragment.representation_id !== retained.pin.representation_id ||
              fragment.material_revision !== retained.pin.material_revision ||
              (retained.raw !== null && retained.raw !== observation.raw)
            )
              throw new Error("EVIDENCE_INVALID");
            return retained;
          }),
        })),
      })),
    })),
    coverage: source.coverage.map((input) => ({
      ...input,
      unmapped: input.ignored.map(evidence),
    })),
    deferred: source.candidates.flatMap((candidate) =>
      candidate.deferred_dimensions.map((dimension) => ({
        candidateId: candidate.id,
        dimension: dimension.dimension,
        reason: dimension.reason,
        ...evidence(dimension.locator),
      })),
    ),
    unprocessedInputIds: source.unprocessed_input_ids,
  };
  await assertAccountRequestContext(context, getAccountId);
  return result;
}
