import { z } from "zod";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  flightEndpointSchema,
  flightCommandLeaves,
  type FlightValues,
} from "../../src/domain/trip/flightAdmission";
import {
  flightLocatorSchema,
  type ImportHash,
} from "../../src/domain/trip/flightImportReview";
import {
  REFERENCE_FLIGHT_DESCRIPTOR,
  UNKNOWN_FLIGHT_TIME,
  referenceFlightExtract,
} from "../../src/domain/trip/referenceFlightExtractor";
import {
  interpretationMaterialSchema,
  type InterpretationItem,
} from "../../src/domain/intelligence/interpretation";
import { flightPurposeIdentityV2Schema } from "../../src/domain/trip/flightOutputPurposeV2";
import {
  coreCandidatePublicationV2Schema,
  coreAirportBindingSchema,
  sealedCoreFlightCandidateSchema,
  fieldRef,
  type CoreCandidatePublicationV2,
  type CoreAirportBinding,
  type CorePublicationMaterial,
  type SealedCoreFlightCandidate,
} from "../../src/domain/trip/tripCoreV2CandidatePublication";
export * from "../../src/domain/trip/tripCoreV2CandidatePublication";
const json = (v: unknown) => canonicalCoreJson(v as Json);
function unique(item: InterpretationItem, path: string) {
  const fields = item.fields.filter((f) => f.path === path);
  if (
    !fields.length ||
    fields.some((f) => f.uncertainty.length) ||
    new Set(fields.map((f) => json(f.normalized))).size !== 1
  )
    return undefined;
  return fields[0];
}
export function sourceValues(item: InterpretationItem): FlightValues {
  const service = unique(item, "service")?.normalized as FlightValues["services"] extends
    (infer T)[] | undefined
    ? T
    : never;
  const values: FlightValues = {};
  if (service) values.services = [service];
  for (const role of ["origin", "destination"] as const) {
    const airport = unique(item, `${role}.airport`)?.normalized as
      { value: string } | undefined;
    if (!airport) continue;
    const value = (key: string) => unique(item, `${role}.${key}`)?.normalized;
    const clock = value("local_time") as
        { value: string; precision: number; quality: "EXACT" | "ESTIMATED" } | undefined,
      instant = value("source_instant") as
        { value: string; precision: number; supplied_offset_seconds: number } | undefined;
    values[role] = flightEndpointSchema.parse({
      location: {
        authored_label: airport.value,
        authored_text: null,
        accepted_place_id: null,
      },
      time: {
        ...UNKNOWN_FLIGHT_TIME,
        local_date: value("local_date") ?? null,
        local_time: clock?.value ?? null,
        clock_precision: clock?.precision ?? null,
        quality: clock?.quality ?? (instant ? "EXACT" : "UNKNOWN"),
        basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
        zone_id: value("zone_id") ?? null,
        supplied_offset_seconds:
          value("supplied_offset_seconds") ?? instant?.supplied_offset_seconds ?? null,
        source_instant: instant?.value ?? null,
        source_instant_precision: instant?.precision ?? null,
      },
    });
  }
  return values;
}
export function observationPath(key: string) {
  if (key === "flightNumberLiteral" || key === "ROOT.title" || key.startsWith("SERVICE."))
    return "service";
  if (key === "departureDate") return "origin.local_date";
  const [role, leaf] = key.split(".");
  return role.toLowerCase() + "." + (leaf === "authored_label" ? "airport" : leaf);
}
function sameLocator(
  a: z.infer<typeof flightLocatorSchema>,
  b: z.infer<typeof flightLocatorSchema>,
) {
  const { excerpt: _a, ...aa } = a,
    { excerpt: _b, ...bb } = b;
  return json(aa) === json(bb);
}
export async function extractCoreFlightPublication(
  request: CoreCandidatePublicationV2,
  materials: CorePublicationMaterial[],
  actorAccountId: string,
  tripId: string,
  hash: ImportHash,
  resolveAirport: (code: string, date: string) => Promise<CoreAirportBinding | null>,
) {
  request = coreCandidatePublicationV2Schema.parse(request);
  materials = materials.map((m) => interpretationMaterialSchema.parse(m));
  for (const c of request.candidates)
    if (
      c.accountId !== actorAccountId ||
      c.tripId !== tripId ||
      c.sourceId !== request.sourceId ||
      c.sourceRevision !== request.sourceRevision ||
      c.runId !== request.runId
    )
      throw new Error("IMPORT_SCOPE_MISMATCH");
  for (const m of materials) {
    const bytes = new TextEncoder().encode(m.text);
    if (
      m.pin.source_id !== request.sourceId ||
      m.pin.material_revision !== request.sourceRevision ||
      bytes.length !== m.pin.byte_count ||
      (await hash(bytes)) !== m.pin.payload_sha256
    )
      throw new Error("SOURCE_INTEGRITY_FAILURE");
  }
  const clock = new Date().toISOString(),
    response = await referenceFlightExtract(
      {
        binding: {
          request_id: request.publicationId,
          idempotency_key: request.publicationId,
          schema_dialect: "OTR_TYPED_V1",
          consumer_id: "otr-import-v1",
          contract_version: "otr-intelligence-v1",
          account_id: actorAccountId,
          trip_id: tripId,
          run_id: request.runId,
          generation: 1,
          input_sha256: request.inputCatalogSha256,
          schema_id: "otr.import.flight",
          schema_version: 1,
          schema_sha256: "0".repeat(64),
          descriptor: {
            ...REFERENCE_FLIGHT_DESCRIPTOR,
            capabilities: [...REFERENCE_FLIGHT_DESCRIPTOR.capabilities],
            modalities: [...REFERENCE_FLIGHT_DESCRIPTOR.modalities],
            configuration_sha256: "0".repeat(64),
          },
          observed_at: clock,
          observation_clock: "CALLER_OBSERVED",
          deadline: clock,
          privacy: "LOCAL_ONLY",
          limits: REFERENCE_FLIGHT_DESCRIPTOR.limits,
        },
        materials,
      },
      hash,
    );
  const selected = new Map<string, InterpretationItem>();
  for (const c of request.candidates) {
    const packet = request.evidence.find(
      (e) => e.candidateId === c.candidateId && e.fieldKey === "flightNumberLiteral",
    );
    if (!packet) continue;
    const matches = response.items.filter((item) =>
      item.fields
        .filter((f) => f.path === "service")
        .some((f) =>
          f.fragment_ids.some((id) => {
            const fragment = response.fragments.find((k) => k.id === id);
            return fragment && sameLocator(fragment.locator, packet.locator);
          }),
        ),
    );
    if (matches.length === 1) selected.set(c.candidateId, matches[0]);
  }
  const complete =
    response.status === "SUCCEEDED" &&
    response.coverage.length === materials.length &&
    response.coverage.every((c) => c.status === "PROCESSED" && !c.ignored.length) &&
    selected.size === request.candidates.length &&
    new Set([...selected.values()].map((i) => i.token)).size === response.items.length;
  const hazard = response.items.some((i) =>
    i.fields.some((f) =>
      ["change_notice", "supplier_occurrence", "operating_service"].includes(f.path),
    ),
  );
  const sealed: SealedCoreFlightCandidate[] = [];
  for (const candidate of request.candidates) {
    const body: SealedCoreFlightCandidate = {
      version: 2,
      publicationId: request.publicationId,
      candidate,
      status: "REVIEW",
      errorCode: null,
      identityFacts: null,
      identityEvidenceRefs: null,
      values: {},
      fieldEvidence: {},
      airportBindings: [],
    };
    try {
      if (!complete) throw new Error("INCOMPLETE_SOURCE_EVIDENCE");
      if (hazard) throw new Error("UNRESOLVED_MATCH");
      if (candidate.existingTargetHint) throw new Error("CONTRACT_UNSUPPORTED");
      const item = selected.get(candidate.candidateId)!;
      const expected = sourceValues(item),
        service = expected.services?.[0];
      if (!service) throw new Error("UNRESOLVED_IDENTITY");
      const actual: FlightValues = {
        ...(candidate.facts.core ? { title: candidate.facts.core.title } : {}),
        ...(candidate.facts.origin ? { origin: candidate.facts.origin } : {}),
        ...(candidate.facts.destination
          ? { destination: candidate.facts.destination }
          : {}),
        ...(candidate.facts.services ? { services: candidate.facts.services } : {}),
      };
      if (
        candidate.facts.flightNumberLiteral !== service.service_literal ||
        candidate.facts.departureDate !==
          (unique(item, "origin.local_date")?.normalized ?? null) ||
        Object.entries(actual).some(
          ([k, v]) =>
            json(v) !==
            json(
              k === "title" ? service.service_literal : expected[k as keyof FlightValues],
            ),
        )
      )
        throw new Error("INVALID_PROVENANCE");
      const leaves: Record<string, Json> = {
        flightNumberLiteral: candidate.facts.flightNumberLiteral,
        departureDate: candidate.facts.departureDate,
        ...flightCommandLeaves(actual),
      };
      if (
        Object.keys(candidate.fieldKnowledge).sort().join("|") !==
          Object.keys(leaves).sort().join("|") ||
        Object.keys(candidate.fieldEvidence).sort().join("|") !==
          Object.keys(leaves).sort().join("|") ||
        request.evidence.filter((e) => e.candidateId === candidate.candidateId).length !==
          Object.keys(leaves).length
      )
        throw new Error("INVALID_PROVENANCE");
      for (const [key, value] of Object.entries(leaves)) {
        if (candidate.fieldKnowledge[key] !== "PRESENT" || value === null)
          throw new Error("UNRESOLVED_IDENTITY");
        const refs = candidate.fieldEvidence[key];
        if (refs.length !== 1 || refs[0] !== fieldRef(candidate.candidateId, key))
          throw new Error("INVALID_PROVENANCE");
        const packet = request.evidence.find(
            (e) => e.candidateId === candidate.candidateId && e.fieldKey === key,
          )!,
          path = observationPath(key);
        let observation = unique(item, path);
        if (!observation && key.endsWith("supplied_offset_seconds"))
          observation = unique(item, key.split(".")[0].toLowerCase() + ".source_instant");
        if (!observation) throw new Error("INVALID_PROVENANCE");
        const fragment = response.fragments.find(
          (f) =>
            observation!.fragment_ids.includes(f.id) &&
            sameLocator(f.locator, packet.locator),
        );
        const material = materials.find((m) => m.pin.id === packet.inputId);
        if (
          !fragment ||
          !material ||
          !candidate.inputRepresentationIds.includes(material.pin.representation_id) ||
          packet.locator.kind !== "TEXT_SPAN"
        )
          throw new Error("INVALID_PROVENANCE");
        if (
          packet.locator.excerpt !== undefined &&
          packet.locator.excerpt !==
            new TextDecoder("utf-8", { fatal: true }).decode(
              new TextEncoder()
                .encode(material.text)
                .slice(packet.locator.start!, packet.locator.end!),
            )
        )
          throw new Error("INVALID_PROVENANCE");
        body.fieldEvidence[key] = {
          ref: refs[0],
          sourceId: material.pin.source_id,
          sourceRevision: material.pin.material_revision,
          representationId: material.pin.representation_id,
          inputId: material.pin.id,
          payloadSha256: material.pin.payload_sha256,
          locator: fragment.locator,
          value,
        };
      }
      if (
        new Set(Object.values(body.fieldEvidence).map((e) => e.representationId)).size !==
        candidate.inputRepresentationIds.length
      )
        throw new Error("INVALID_PROVENANCE");
      body.values = actual as Json;
      if (
        !actual.origin ||
        !actual.destination ||
        !actual.services ||
        !candidate.facts.departureDate
      )
        throw new Error("UNRESOLVED_IDENTITY");
      const origin = actual.origin.location.authored_label!,
        destination = actual.destination.location.authored_label!,
        day = candidate.facts.departureDate;
      for (const other of response.items) {
        if (other.token === item.token) continue;
        const otherDay = unique(other, "origin.local_date")?.normalized,
          otherOrigin = (
            unique(other, "origin.airport")?.normalized as { value: string } | undefined
          )?.value,
          otherDestination = (
            unique(other, "destination.airport")?.normalized as
              { value: string } | undefined
          )?.value;
        if (
          (otherDay !== undefined && otherDay !== day) ||
          (otherOrigin === destination && otherDestination === origin)
        )
          continue;
        const otherService = unique(other, "service")?.normalized;
        if (!otherService || !otherOrigin || !otherDestination)
          throw new Error("UNRESOLVED_MATCH");
      }
      const airports = [
        await resolveAirport(origin, day),
        await resolveAirport(destination, day),
      ];
      if (airports.some((a) => a === null)) throw new Error("UNRESOLVED_IDENTITY");
      body.airportBindings = airports.map((a, i) => {
        const b = coreAirportBindingSchema.parse(a);
        if (
          b.code !== [origin, destination][i] ||
          b.identityId !== "IATA_AIRPORT:" + b.code ||
          b.validFrom > day ||
          (b.validUntil !== null && b.validUntil < day)
        )
          throw new Error("INVALID_PROVENANCE");
        return b;
      });
      const s = actual.services[0];
      body.identityFacts = flightPurposeIdentityV2Schema.parse({
        namespace: s.operator_namespace,
        issuer: s.operator_issuer,
        operator: s.operator_value,
        serviceNumber: s.service_number,
        originDate: day,
        originAirportId: body.airportBindings[0].identityId,
        destinationAirportId: body.airportBindings[1].identityId,
      });
      body.identityEvidenceRefs = {
        service: [
          fieldRef(candidate.candidateId, `SERVICE.${s.service_key}.service_number`),
        ],
        originDate: [fieldRef(candidate.candidateId, "ORIGIN.local_date")],
        originAirportId: [fieldRef(candidate.candidateId, "ORIGIN.authored_label")],
        destinationAirportId: [
          fieldRef(candidate.candidateId, "DESTINATION.authored_label"),
        ],
      };
      body.status = "QUALIFIED";
    } catch (error) {
      if (
        !(error instanceof z.ZodError) &&
        !(
          error instanceof Error &&
          [
            "INVALID_PROVENANCE",
            "UNRESOLVED_IDENTITY",
            "UNRESOLVED_MATCH",
            "INCOMPLETE_SOURCE_EVIDENCE",
            "CONTRACT_UNSUPPORTED",
          ].includes(error.message)
        )
      )
        throw error;
      body.errorCode =
        error instanceof z.ZodError ? "INVALID_PROVENANCE" : (error as Error).message;
      body.identityFacts = null;
      body.identityEvidenceRefs = null;
      body.airportBindings = [];
    }
    sealed.push(sealedCoreFlightCandidateSchema.parse(body));
  }
  const verification = {
    version: 2,
    grammar: "otr-reference-flight/1",
    inputCatalogSha256: request.inputCatalogSha256,
    sourceRevision: request.sourceRevision,
    items: response.items,
    fragments: response.fragments,
    coverage: response.coverage,
    complete,
    hazard,
  };
  return { sealed, verification };
}
