import { projectFlightEvidenceCoverage } from "./flightEvidenceCoverage";
import type { FlightCandidateSet } from "./flightInterpretation";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type {
  CoreCandidatePublicationTransport,
  CoreSourcePlanTransport,
} from "../api/tripCoreV2Transport";
import type { InterpretationRequest } from "@/domain/intelligence/interpretation";
import {
  flightCommandLeaves,
  flightEndpointSchema,
  matchFlightV1,
} from "@/domain/trip/flightAdmission";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import {
  coreCandidatePublicationV2Schema,
  fieldRef,
  type CoreCandidatePublicationV2,
} from "@/domain/trip/tripCoreV2CandidatePublication";
import { coreSourcePrepareV2Schema } from "@/domain/trip/tripCoreV2SourceContract";
import { canonicalCoreJson } from "@/domain/trip/tripCoreV2Json";
import { coreDefaults, coreUuid } from "@/domain/trip/tripCoreV2";

// IDs are allocated and persisted by the caller before publication/queue insertion.
export async function buildCaptureFlightPublicationV2(
  context: AccountRequestContext,
  supplied: FlightCandidateSet,
  materials: InterpretationRequest["materials"],
  publicationId: string,
  hash: ImportHash,
  getAccountId: () => Promise<string>,
) {
  const set = structuredClone(supplied);
  const coverage = await projectFlightEvidenceCoverage(
    context,
    set,
    materials,
    hash,
    getAccountId,
  );
  const pins = set.publication_request.inputs;
  const sources = new Set(pins.map((p) => p.source_id));
  const revisions = new Set(pins.map((p) => p.material_revision));
  if (sources.size !== 1 || revisions.size !== 1 || !set.candidates.length)
    throw new Error("CONTRACT_UNSUPPORTED");
  const sourceId = pins[0].source_id,
    sourceRevision = pins[0].material_revision;
  const evidence: CoreCandidatePublicationV2["evidence"] = [];
  const candidates = set.candidates.map((c) => {
    if (
      c.run_id !== set.run_id ||
      c.source_ids.length !== 1 ||
      c.source_ids[0] !== sourceId
    )
      throw new Error("IMPORT_SCOPE_MISMATCH");
    const fields = c.proposal.fields;
    const services = fields.services?.proposed_value;
    const origin = flightEndpointSchema.safeParse(fields.origin?.proposed_value);
    const destination = flightEndpointSchema.safeParse(
      fields.destination?.proposed_value,
    );
    const unmappedObservations = (["origin", "destination"] as const).flatMap((role) => {
      const parsed = role === "origin" ? origin : destination;
      const proposed = fields[role]?.proposed_value;
      return proposed && !parsed.success
        ? [
            {
              key: role + ".UNRESOLVED_TEMPORAL",
              value: canonicalCoreJson(proposed),
              evidenceRefs: [],
            },
          ]
        : [];
    });
    const facts = {
      flightNumberLiteral: services?.[0]?.service_literal ?? null,
      departureDate:
        c.occurrence["origin.local_date"]?.knowledge === "PRESENT"
          ? (c.occurrence["origin.local_date"].value as string)
          : null,
      ...(origin.success ? { origin: origin.data } : {}),
      ...(destination.success ? { destination: destination.data } : {}),
      ...(services
        ? {
            services,
            core: { title: fields.title?.proposed_value ?? services[0].service_literal },
          }
        : {}),
    };
    const leaves = {
      flightNumberLiteral: facts.flightNumberLiteral,
      departureDate: facts.departureDate,
      ...flightCommandLeaves({ ...facts, title: facts.core?.title }),
    };
    const fieldKnowledge: CoreCandidatePublicationV2["candidates"][number]["fieldKnowledge"] =
      {};
    const fieldEvidence: CoreCandidatePublicationV2["candidates"][number]["fieldEvidence"] =
      {};
    for (const [key, value] of Object.entries(leaves)) {
      let path =
        key === "flightNumberLiteral" ||
        key === "ROOT.title" ||
        key.startsWith("SERVICE.")
          ? "service"
          : key === "departureDate"
            ? "origin.local_date"
            : key.split(".")[0].toLowerCase() +
              "." +
              (key.endsWith("authored_label") ? "airport" : key.split(".")[1]);
      if (!c.occurrence[path] && key.endsWith("supplied_offset_seconds"))
        path = key.split(".")[0].toLowerCase() + ".source_instant";
      const observation = c.occurrence[path];
      fieldKnowledge[key] =
        value === null ? "UNKNOWN" : (observation?.knowledge ?? "UNKNOWN");
      const fragments = [
        ...new Set(observation?.observations.flatMap((o) => o.fragment_ids) ?? []),
      ].sort();
      const fragment = set.fragments.find((f) => f.id === fragments[0]);
      if (fragment) {
        fieldEvidence[key] = [fieldRef(c.id, key)];
        evidence.push({
          candidateId: c.id,
          fieldKey: key,
          inputId: fragment.locator.input_id,
          locator: fragment.locator,
        });
      }
    }
    const hints = c.anchors
      .map((anchor) => matchFlightV1(anchor, set.matching_scope))
      .filter((match) => match.assessment === "SAME_ITEM");
    const targets = [...new Set(hints.map((h) => h.targetId))];
    if (targets.length > 1) throw new Error("CONTRACT_UNSUPPORTED");
    const hint = set.matching_scope.occurrences.find((o) => o.eventId === targets[0]);
    return {
      schemaId: "otr.trip.capture.candidate/2" as const,
      candidateId: c.id,
      accountId: context.accountId,
      tripId: context.tripId,
      sourceId,
      sourceRevision,
      runId: set.run_id,
      inputRepresentationIds: [
        ...new Set(
          c.input_ids.map((id) => {
            const pin = pins.find((p) => p.id === id);
            if (!pin) throw new Error("EVIDENCE_INPUT_MISMATCH");
            return pin.representation_id;
          }),
        ),
      ].sort(),
      kind: "P2" as const,
      facts,
      fieldKnowledge,
      fieldEvidence,
      existingTargetHint: hint
        ? { kind: "ITEM" as const, id: hint.eventId, revision: hint.semanticRevision }
        : null,
      unmappedObservations,
    };
  });
  const publication = coreCandidatePublicationV2Schema.parse({
    publicationVersion: 2,
    publicationId,
    sourceId,
    sourceRevision,
    runId: set.run_id,
    inputCatalogSha256: set.input_sha256,
    candidates,
    evidence,
  });
  await assertAccountRequestContext(context, getAccountId);
  return {
    publication,
    quality: coverage.quality,
    sourcePublication: set.publication_request,
  };
}

export async function publishCaptureFlightSetV2(
  context: AccountRequestContext,
  input: Awaited<ReturnType<typeof buildCaptureFlightPublicationV2>>,
  transport: CoreCandidatePublicationTransport,
) {
  // Only the owning publisher's result is authoritative; advisory quality never grants dispatch.
  return transport.publishSourceCandidates(context, input.publication);
}

export type CaptureFlightCoreIds = {
  candidateId: string;
  itemId: string;
  createSlotId: string;
  createOperationId: string;
  qualifySlotId: string;
  qualifyOperationId: string;
};
export function buildCaptureFlightSourcePlanV2(
  publication: CoreCandidatePublicationV2,
  planId: string,
  identities: readonly CaptureFlightCoreIds[],
) {
  publication = coreCandidatePublicationV2Schema.parse(publication);
  if (
    identities.length !== publication.candidates.length ||
    new Set(identities.map((i) => i.candidateId)).size !== identities.length ||
    new Set(identities.map((i) => i.itemId)).size !== identities.length
  )
    throw new Error("INVALID_SOURCE_PLAN");
  const slots = publication.candidates.flatMap((c) => {
    const ids = identities.find((i) => i.candidateId === c.candidateId);
    if (!ids) throw new Error("INVALID_SOURCE_PLAN");
    Object.values(ids).forEach((id) => coreUuid.parse(id));
    const full = {
      origin: c.facts.origin,
      destination: c.facts.destination,
      services: c.facts.services,
    };
    const keys = Object.keys(flightCommandLeaves(full));
    const refs = (selected: string[]) =>
      Object.fromEntries(
        selected.filter((k) => c.fieldEvidence[k]).map((k) => [k, c.fieldEvidence[k]]),
      );
    return [
      {
        slotId: ids.createSlotId,
        slotKey: "create",
        candidateId: c.candidateId,
        targetKind: "ITEM" as const,
        target: { kind: "ITEM" as const, id: ids.itemId },
        command: "CREATE_SPARSE_FLIGHT" as const,
        operationId: ids.createOperationId,
        dependsOn: [],
        selectedFields: ["flightNumberLiteral", "departureDate"],
        evidenceRefs: refs([
          "flightNumberLiteral",
          "departureDate",
          `SERVICE.${c.facts.services?.[0]?.service_key}.service_number`,
          "ORIGIN.local_date",
          "ORIGIN.authored_label",
          "DESTINATION.authored_label",
        ]),
        baseVector: [{ kind: "ITEM" as const, id: ids.itemId, revision: null }],
        payload: {
          flightNumberLiteral: c.facts.flightNumberLiteral,
          departureDate: c.facts.departureDate,
          ...coreDefaults("member"),
        },
      },
      ...(c.facts.origin && c.facts.destination && c.facts.services
        ? [
            {
              slotId: ids.qualifySlotId,
              slotKey: "qualify",
              candidateId: c.candidateId,
              targetKind: "ITEM" as const,
              target: { kind: "ITEM" as const, id: ids.itemId },
              command: "QUALIFY_FLIGHT" as const,
              operationId: ids.qualifyOperationId,
              dependsOn: [ids.createSlotId],
              selectedFields: keys,
              evidenceRefs: refs(keys),
              baseVector: null,
              payload: {
                ...full,
                proofs: Object.fromEntries(
                  keys
                    .filter((k) => c.fieldEvidence[k])
                    .map((k) => [k, { kind: "TRACK_C", ref: c.fieldEvidence[k][0] }]),
                ),
              },
            },
          ]
        : []),
    ];
  });
  return coreSourcePrepareV2Schema.parse({
    captureVersion: 2,
    planId,
    sourceId: publication.sourceId,
    sourceRevision: publication.sourceRevision,
    mode: "REVIEWED_SOURCE",
    policyVersion: null,
    candidateIds: publication.candidates.map((c) => c.candidateId),
    slots,
  });
}

// Explicit reviewed proposal orchestration; command delivery stays in the existing Core queue.
export async function prepareCaptureFlightSetV2(
  context: AccountRequestContext,
  built: Awaited<ReturnType<typeof buildCaptureFlightPublicationV2>>,
  planId: string,
  identities: readonly CaptureFlightCoreIds[],
  transport: CoreCandidatePublicationTransport & CoreSourcePlanTransport,
) {
  const plan = buildCaptureFlightSourcePlanV2(built.publication, planId, identities);
  const publication = await publishCaptureFlightSetV2(context, built, transport);
  const preparation = await transport.prepareSourcePlan(context, plan);
  return { publication, preparation, plan };
}
