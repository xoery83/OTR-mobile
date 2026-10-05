import { z } from "zod";
import {
  tripImportCatalogSchemas,
  tripImportSnapshotSchema,
  flightProposalSchema,
  type TripImportCatalogName,
} from "../api/tripImportCatalogContracts";
import { validateImportSnapshot } from "../repositories/tripImportCatalogRecovery";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import {
  interpretationRequestSchema,
  interpretationResponseSchema,
  type InterpretationItem,
  type InterpretationResponse,
} from "@/domain/intelligence/interpretation";
import {
  FLIGHT_OBSERVATION_PATHS,
  normalizeFlightObservation,
  referenceFlightExtract,
  UNKNOWN_FLIGHT_TIME,
} from "@/domain/trip/referenceFlightExtractor";
import {
  FLIGHT_MATCH_POLICY,
  matchFlightV1,
  flightTimeInputSchema,
  flightServicesSchema,
  type FlightOccurrenceAnchor,
  type FlightService,
} from "@/domain/trip/flightAdmission";
import { importDigest, type ImportHash } from "@/domain/trip/flightImportReview";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";

const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const anchorSchema = z.strictObject({
  eventId: uuid,
  semanticRevision: z.number().int().positive().safe(),
  namespace: z.enum(["IATA_AIRLINE", "ICAO_AIRLINE"]),
  issuer: z.string().min(1).max(128),
  operator: z.string().min(1).max(128),
  serviceNumber: z.string().min(1).max(64),
  originDate: z.string().max(10),
  originAirportId: z.string().min(1).max(128),
  destinationAirportId: z.string().min(1).max(128),
  departureClock: z.string().max(15).nullable(),
  qualified: z.boolean(),
  operatingOccurrence: z.string().min(1).max(500).optional(),
  contradictory: z.boolean().optional(),
  supplierOccurrence: z
    .strictObject({
      namespace: z.string().min(1).max(128),
      issuer: z.string().min(1).max(128),
      value: z.string().min(1).max(128),
      scopeId: z.string().min(1).max(128),
      verified: z.boolean(),
    })
    .optional(),
});
const seamSchema = z.strictObject({
  request: interpretationRequestSchema,
  catalog: tripImportSnapshotSchema,
  batch_id: uuid,
  manifest_version: z.number().int().positive().safe(),
  matching: z.strictObject({
    complete: z.boolean(),
    current: z.boolean(),
    proposalsComplete: z.boolean(),
    lineageComplete: z.boolean(),
    servicesAtEventBaselines: z.boolean(),
    baseline_id: z.string().min(1).max(128),
    occurrences: z.array(anchorSchema).max(64),
  }),
  predecessor_run_ids: z.array(uuid).max(64),
  predecessor_candidate_ids: z.array(uuid).max(64),
  resolved_airports: z
    .array(
      z.strictObject({
        input_id: uuid,
        code: z.string().regex(/^[A-Z]{3}$/),
        airport_id: z.string().min(1).max(128),
        namespace: z.literal("IATA_AIRPORT"),
        unique: z.literal(true),
        resolution_observation_id: z.string().min(1).max(128),
      }),
    )
    .max(128),
  supplier_scopes: z
    .array(
      z.strictObject({
        issuer: z.string().min(1).max(128),
        scope_id: z.string().min(1).max(128),
        documented_uniqueness: z.literal("ONE_LEG_WITHIN_SCOPE"),
      }),
    )
    .max(64),
});
type CatalogRows = {
  [K in TripImportCatalogName]: z.infer<(typeof tripImportCatalogSchemas)[K]>[];
};
export type FlightInterpretationBatch = Omit<z.infer<typeof seamSchema>, "catalog"> & {
  catalog: z.infer<typeof tripImportSnapshotSchema> & CatalogRows;
};
type FieldObservation = InterpretationItem["fields"][number] & {
  item_token: string;
  observation_id: string;
};
export type FlightInterpretationCandidate = {
  id: string;
  candidate_key: string;
  run_id: string;
  candidate_kind: "TRANSPORT";
  proposal_version: 1;
  proposal: z.infer<typeof flightProposalSchema>;
  proposal_sha256: string;
  occurrence: Record<
    string,
    {
      knowledge: "PRESENT" | "AMBIGUOUS" | "UNKNOWN";
      value: Json | null;
      observations: FieldObservation[];
    }
  >;
  evidence_support: Record<string, string[]>;
  contradictions: { path: string; observation_ids: string[]; alternatives: Json[] }[];
  ambiguity: string[];
  observation_tokens: string[];
  entity_resolution: FlightResolution[];
  input_ids: string[];
  source_ids: string[];
  deferred_dimensions: {
    dimension: InterpretationItem["deferred"][number]["dimension"];
    candidate_field_key: null;
    input_id: string;
    locator: InterpretationResponse["fragments"][number]["locator"];
    reason: "UNSUPPORTED_DIMENSION";
  }[];
  predecessor_candidate_ids: string[];
  anchors: FlightOccurrenceAnchor[];
};
export type FlightResolution = {
  left: string;
  right: string;
  outcome: "SAME_ITEM" | "POSSIBLE_DUPLICATE" | "UNRESOLVED_MATCH" | "DISTINCT_ITEM";
  reason: string;
  policy: typeof FLIGHT_MATCH_POLICY;
};
export const FLIGHT_INTERPRETATION_SCHEMA = {
  id: "otr.import.flight",
  version: 1,
  normalization_version: 1,
  reference_grammar: 1,
  field_paths: FLIGHT_OBSERVATION_PATHS,
  candidate_families: ["transport_subtype", "title", "origin", "destination", "services"],
};
const json = (v: unknown) => canonicalEventJson(v as Json);
const sorted = (v: string[]) => [...new Set(v)].sort();
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(code = "INTERPRETATION_INVALID"): never {
  throw new Error(code);
}
export function flightInterpretationConfiguration(
  batch: Omit<FlightInterpretationBatch, "catalog" | "request">,
) {
  return {
    batch_id: batch.batch_id,
    manifest_version: batch.manifest_version,
    matching: batch.matching,
    predecessor_run_ids: batch.predecessor_run_ids,
    predecessor_candidate_ids: batch.predecessor_candidate_ids,
    supplier_scopes: batch.supplier_scopes,
    resolved_airports: batch.resolved_airports,
  };
}
export async function flightRunInputDigest(
  materials: FlightInterpretationBatch["request"]["materials"],
  representations: z.infer<typeof tripImportCatalogSchemas.trip_source_representations>[],
  sha256: ImportHash,
) {
  const pins = materials
    .map((m) => m.pin)
    .sort(
      (a, b) =>
        a.source_id.localeCompare(b.source_id) ||
        a.material_revision - b.material_revision ||
        a.representation_id.localeCompare(b.representation_id) ||
        a.id.localeCompare(b.id),
    );
  const descriptors = pins.map((i) => {
    const r =
      representations.find(
        (r) => r.id === i.representation_id && r.source_id === i.source_id,
      ) ?? fail("INPUT_INVALID");
    return [
      i.id,
      i.source_id,
      i.material_revision,
      i.representation_id,
      i.payload_sha256,
      i.byte_count,
      i.observed_source_row_revision,
      i.historical_selection,
      r.introduced_revision,
      r.role,
      r.material_kind,
      r.transform_key,
      r.transform_version,
      r.transform_options_sha256,
      r.parent_ids,
    ];
  });
  return importDigest("otr-source-run-input-v1", [1, descriptors] as Json, sha256);
}
async function proposalId(runId: string, tokens: string[], hash: ImportHash) {
  const digest = await importDigest(
    "otr-import-proposal-id-v1",
    [runId, sorted(tokens)],
    hash,
  );
  // Run-scoped opaque proposal identity, never a global occurrence key.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function uniqueField(item: InterpretationItem, path: string): Json | null {
  if (item.fields.some((f) => f.path === path && f.uncertainty.length > 0)) return null;
  const values = item.fields
    .filter((f) => f.path === path && f.uncertainty.length === 0)
    .map((f) => f.normalized as Json);
  return values.length && new Set(values.map(json)).size === 1 ? values[0] : null;
}
function itemAnchor(
  item: InterpretationItem,
  id: string,
  batch: FlightInterpretationBatch,
  fragments: InterpretationResponse["fragments"],
): FlightOccurrenceAnchor {
  const s = uniqueField(item, "service") as FlightService | null;
  const operating = uniqueField(item, "operating_service") as FlightService | null;
  const origin = uniqueField(item, "origin.airport") as {
    namespace: string;
    value: string;
  } | null;
  const destination = uniqueField(item, "destination.airport") as {
    namespace: string;
    value: string;
  } | null;
  const inputIds = new Set(
    item.fields.flatMap((f) =>
      f.fragment_ids.map(
        (id) => fragments.find((fragment) => fragment.id === id)!.locator.input_id,
      ),
    ),
  );
  const resolvedAirport = (code: string | undefined) => {
    const resolutions = batch.resolved_airports.filter(
      (r) => r.code === code && inputIds.has(r.input_id),
    );
    const ids = sorted(resolutions.map((r) => r.airport_id));
    return ids.length === 1 ? ids[0] : "";
  };
  const originId = resolvedAirport(origin?.value),
    destinationId = resolvedAirport(destination?.value);
  const date = uniqueField(item, "origin.local_date");
  const clock = uniqueField(item, "origin.local_time") as { value: string } | null;
  const supplier = uniqueField(item, "supplier_occurrence") as {
    issuer: string;
    scopeId: string;
    value: string;
  } | null;
  const a: FlightOccurrenceAnchor = {
    eventId: id,
    semanticRevision: 1,
    namespace: "IATA_AIRLINE",
    issuer: s?.operator_issuer ?? "",
    operator: s?.operator_value ?? "",
    serviceNumber: s?.service_number ?? "",
    originDate: typeof date === "string" ? date : "",
    originAirportId: originId,
    destinationAirportId: destinationId,
    departureClock: clock?.value
      ? `${clock.value.slice(0, 5)}:${clock.value.length === 5 ? "00" : clock.value.slice(6, 8)}${clock.value.includes(".") ? clock.value.slice(8).replace(/0+$/, "").replace(/\.$/, "") : ""}`
      : null,
    qualified:
      !!s &&
      !!originId &&
      !!destinationId &&
      typeof date === "string" &&
      originId !== destinationId,
  };
  const op = operating;
  if (op && a.qualified)
    a.operatingOccurrence = json([
      op.operator_namespace,
      op.operator_issuer,
      op.operator_value,
      op.service_number,
      a.originDate,
      a.originAirportId,
      a.destinationAirportId,
    ]);
  if (
    supplier &&
    batch.supplier_scopes.some(
      (s) => s.issuer === supplier.issuer && s.scope_id === supplier.scopeId,
    )
  )
    a.supplierOccurrence = {
      namespace: "SUPPLIER_OCCURRENCE",
      ...supplier,
      verified: true,
    };
  if (
    item.fields.some(
      (f) =>
        [
          "service",
          "origin.airport",
          "destination.airport",
          "origin.local_date",
        ].includes(f.path) && uniqueField(item, f.path) === null,
    )
  )
    a.contradictory = true;
  return a;
}
function resolve(
  left: FlightOccurrenceAnchor,
  right: FlightOccurrenceAnchor,
  batch: FlightInterpretationBatch,
  change: boolean,
  proposals: FlightOccurrenceAnchor[],
  conflictingClocks: Set<string>,
): FlightResolution {
  const result = (
    outcome: FlightResolution["outcome"],
    reason: string,
  ): FlightResolution => ({
    left: left.eventId,
    right: right.eventId,
    outcome,
    reason,
    policy: FLIGHT_MATCH_POLICY,
  });
  const sameSupplier =
    left.supplierOccurrence?.verified &&
    right.supplierOccurrence?.verified &&
    json(left.supplierOccurrence) === json(right.supplierOccurrence);
  const sameService =
    left.namespace === right.namespace &&
    left.issuer === right.issuer &&
    left.operator === right.operator &&
    left.serviceNumber === right.serviceNumber;
  // Change evidence is retained, not treated as human continuity approval.
  if (change || (sameSupplier && !sameService))
    return result("UNRESOLVED_MATCH", "CONTINUITY_REVIEW_REQUIRED");
  // An admitted independent supplier leg anchor can establish identity despite
  // conflicting schedule facts. Keep both clocks in observations; only tuple-only
  // matching must treat unequal clocks as competing occurrences.
  const relevant = proposals.filter(
    (o) =>
      o.qualified &&
      o.originDate === left.originDate &&
      o.originAirportId === left.originAirportId &&
      o.destinationAirportId === left.destinationAirportId &&
      ((o.namespace === left.namespace &&
        o.issuer === left.issuer &&
        o.operator === left.operator &&
        o.serviceNumber === left.serviceNumber) ||
        (left.operatingOccurrence !== undefined &&
          o.operatingOccurrence === left.operatingOccurrence)),
  );
  if (
    !sameSupplier &&
    left.originDate === right.originDate &&
    left.originAirportId === right.originAirportId &&
    left.destinationAirportId === right.destinationAirportId &&
    (new Set(relevant.map((o) => o.departureClock).filter((c) => c !== null)).size > 1 ||
      relevant.some((o) => conflictingClocks.has(o.eventId)))
  )
    return result("UNRESOLVED_MATCH", "COMPETING_PROPOSAL_CLOCKS");
  const l = sameSupplier ? { ...left, departureClock: null } : left;
  const r = sameSupplier ? { ...right, departureClock: null } : right;
  // Two observations of the same admitted baseline are not two canonical
  // occurrences. Reuse match-v1 for both before adding the peer to search scope.
  const leftBaseline = matchFlightV1(l, batch.matching);
  const rightBaseline = matchFlightV1(r, batch.matching);
  if (
    leftBaseline.assessment === "SAME_ITEM" &&
    rightBaseline.assessment === "SAME_ITEM" &&
    leftBaseline.targetId === rightBaseline.targetId
  )
    return result("SAME_ITEM", "SAME_QUALIFIED_CANONICAL_TARGET");
  const matched = matchFlightV1(l, {
    ...batch.matching,
    occurrences: [r, ...batch.matching.occurrences],
  });
  if (matched.assessment === "SAME_ITEM")
    return result("SAME_ITEM", sameSupplier ? "QUALIFIED_SUPPLIER_LEG" : matched.reason);
  if (matched.assessment === "NEW_ITEM") return result("DISTINCT_ITEM", matched.reason);
  return result(
    matched.reason === "CODESHARE_OR_SUPERSESSION_UNRESOLVED"
      ? "POSSIBLE_DUPLICATE"
      : "UNRESOLVED_MATCH",
    matched.reason,
  );
}
function consolidateProposal(
  occurrence: FlightInterpretationCandidate["occurrence"],
  fragments: InterpretationResponse["fragments"],
) {
  const fields: z.infer<typeof flightProposalSchema>["fields"] = {};
  const get = (path: string) =>
    occurrence[path]?.knowledge === "PRESENT" ? occurrence[path].value : null;
  const support = (paths: string[]) => {
    const refs = sorted(
      paths.flatMap(
        (p) => occurrence[p]?.observations.flatMap((o) => o.fragment_ids) ?? [],
      ),
    );
    const supports = refs.map((id) => fragments.find((f) => f.id === id)!);
    if (supports.length > 64) fail("LIMIT_EXCEEDED");
    return {
      input_ids: sorted(supports.map((f) => f.locator.input_id)),
      locators: supports.map((f) => f.locator),
    };
  };
  if (get("transport_subtype"))
    fields.transport_subtype = {
      proposed_value: "FLIGHT",
      ...support(["transport_subtype"]),
    };
  const serviceValue = get("service") as FlightService | FlightService[] | null;
  const marketing = serviceValue
    ? Array.isArray(serviceValue)
      ? serviceValue
      : [serviceValue]
    : [];
  const op = get("operating_service") as FlightService | null;
  if (
    marketing.length > 0 &&
    (!occurrence.operating_service ||
      occurrence.operating_service.knowledge === "PRESENT")
  ) {
    const ordered = [...marketing].sort((a, b) => json(a).localeCompare(json(b)));
    if (ordered.length > (op ? 3 : 1)) fail("LIMIT_EXCEEDED");
    const services = op
      ? [
          { ...op },
          ...ordered.map((s, i) => ({
            ...s,
            service_key: `marketing${i}`,
            attribution: "MARKETING" as const,
            codeshare_operating_key: op.service_key,
          })),
        ].sort((a, b) => a.service_key.localeCompare(b.service_key))
      : ordered;
    fields.services = {
      proposed_value: flightServicesSchema.parse(services),
      ...support(["service", "operating_service"]),
    };
    fields.title = {
      proposed_value: ordered.map((s) => s.service_literal).join(" / "),
      ...support(["service"]),
    };
  }
  for (const role of ["origin", "destination"] as const) {
    const airport = get(`${role}.airport`) as { value: string } | null;
    const paths = Object.keys(occurrence).filter((p) => p.startsWith(`${role}.`));
    if (!airport || paths.some((p) => occurrence[p].knowledge === "AMBIGUOUS")) continue;
    const clock = get(`${role}.local_time`) as {
      value: string;
      precision: number;
      quality: "EXACT" | "ESTIMATED";
    } | null;
    const instant = get(`${role}.source_instant`) as {
      value: string;
      precision: number;
      supplied_offset_seconds: number;
    } | null;
    const time = flightTimeInputSchema.parse({
      ...UNKNOWN_FLIGHT_TIME,
      local_date: get(`${role}.local_date`),
      local_time: clock?.value ?? null,
      clock_precision: clock?.precision ?? null,
      quality: clock?.quality ?? (instant ? "EXACT" : "UNKNOWN"),
      basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
      zone_id: get(`${role}.zone_id`),
      supplied_offset_seconds:
        get(`${role}.supplied_offset_seconds`) ??
        instant?.supplied_offset_seconds ??
        null,
      source_instant: instant?.value ?? null,
      source_instant_precision: instant?.precision ?? null,
    });
    fields[role] = {
      proposed_value: {
        time,
        location: {
          authored_label: airport.value,
          authored_text: null,
          accepted_place_id: null,
        },
      },
      ...support(paths),
    };
  }
  return flightProposalSchema.parse({ fields });
}

/** Explicit, unwired Builder-B seam. Returns immutable observations/publication
 * input only. Does not install a Run, authorize closure, or prepare any output. */
export async function interpretFlightBatch(
  raw: FlightInterpretationBatch,
  dependencies: {
    sha256: ImportHash;
    getAccountId(): Promise<string>;
    now(): string;
    plugin?: (
      request: FlightInterpretationBatch["request"],
    ) => Promise<InterpretationResponse>;
  },
) {
  const parsed = seamSchema.safeParse(raw);
  if (!parsed.success)
    fail(
      parsed.error.issues.some((i) => i.code === "too_big")
        ? "LIMIT_EXCEEDED"
        : "INTERPRETATION_INVALID",
    );
  const batch = parsed.data as FlightInterpretationBatch,
    { sha256, getAccountId, now } = dependencies;
  const request = batch.request,
    context = await captureAccountRequestContext(request.binding.trip_id, getAccountId);
  if (
    context.accountId !== request.binding.account_id ||
    batch.catalog.actor_account_id !== context.accountId ||
    batch.catalog.trip_id !== context.tripId
  )
    fail("INTERPRETATION_SCOPE");
  if (Date.parse(request.binding.deadline) <= Date.parse(now()))
    fail("INTERPRETATION_DEADLINE");
  if (
    request.binding.descriptor.network_required ||
    request.binding.descriptor.execution_location !== "DETERMINISTIC_LOCAL"
  )
    fail("PRIVACY_POLICY_BLOCKED");
  if (new TextEncoder().encode(json(batch)).length > 4194304) fail("LIMIT_EXCEEDED");
  const catalogs = Object.fromEntries(
    Object.entries(tripImportCatalogSchemas).map(([name, schema]) => [
      name,
      z
        .array(schema)
        .max(64)
        .parse(batch.catalog[name as keyof typeof batch.catalog]),
    ]),
  ) as unknown as Record<TripImportCatalogName, Record<string, unknown>[]>;
  await validateImportSnapshot(context.accountId, context.tripId, catalogs, sha256);
  const sources = catalogs.trip_sources as z.infer<
    typeof tripImportCatalogSchemas.trip_sources
  >[];
  const representations = catalogs.trip_source_representations as z.infer<
    typeof tripImportCatalogSchemas.trip_source_representations
  >[];
  if (
    batch.resolved_airports.some(
      (r) => !request.materials.some((m) => m.pin.id === r.input_id),
    )
  )
    fail("INTERPRETATION_SCOPE");
  if (new Set(request.materials.map((m) => m.pin.id)).size !== request.materials.length)
    fail("INPUT_INVALID");
  for (const material of request.materials) {
    const i = material.pin;
    const s = sources.find((s) => s.id === i.source_id) ?? fail("INPUT_INVALID");
    const r =
      representations.find(
        (r) => r.id === i.representation_id && r.source_id === i.source_id,
      ) ?? fail("INPUT_INVALID");
    const rev =
      catalogs.trip_source_revisions.find(
        (r) => r.source_id === s.id && r.material_revision === i.material_revision,
      ) ?? fail("INPUT_INVALID");
    if (
      s.lifecycle !== "ACTIVE" ||
      s.retention_state !== "RETAINED" ||
      rev.retention_state !== "RETAINED" ||
      s.row_revision !== i.observed_source_row_revision ||
      (!i.historical_selection && s.current_material_revision !== i.material_revision) ||
      r.retention_state !== "RETAINED" ||
      r.material_kind !== "TEXT" ||
      r.text_content !== material.text ||
      r.payload_sha256 !== i.payload_sha256 ||
      r.byte_count !== i.byte_count
    )
      fail("INPUT_STALE");
    const visited = new Set<string>();
    const walk = (id: string, path: Set<string>): void => {
      if (path.has(id) || path.size >= 64) fail("INPUT_INVALID");
      if (visited.has(id)) return;
      const p =
        representations.find((r) => r.id === id && r.source_id === s.id) ??
        fail("INPUT_INVALID");
      if (p.retention_state !== "RETAINED") fail("INPUT_INVALID");
      if (
        p.parent_ids.length === 0 &&
        !(rev.original_representation_ids as string[]).includes(id)
      )
        fail("INPUT_INVALID");
      for (const parent of p.parent_ids) walk(parent, new Set([...path, id]));
      visited.add(id);
    };
    walk(r.id, new Set());
  }
  if (
    request.binding.input_sha256 !==
      (await flightRunInputDigest(request.materials, representations, sha256)) ||
    request.binding.schema_sha256 !==
      (await importDigest(
        "otr-flight-interpretation-schema-v1",
        FLIGHT_INTERPRETATION_SCHEMA as Json,
        sha256,
      )) ||
    request.binding.descriptor.configuration_sha256 !==
      (await importDigest(
        "otr-flight-interpretation-config-v1",
        flightInterpretationConfiguration(batch) as unknown as Json,
        sha256,
      ))
  )
    fail("INTERPRETATION_BINDING");
  if (catalogs.trip_source_runs.some((r) => r.id === request.binding.run_id))
    fail("RUN_PUBLICATION_SEALED");
  for (const ids of [batch.predecessor_run_ids, batch.predecessor_candidate_ids])
    if (json(ids) !== json(sorted(ids))) fail("INVALID_LINEAGE");
  for (const id of batch.predecessor_run_ids)
    if (!catalogs.trip_source_runs.some((r) => r.id === id && r.state === "READY"))
      fail("INVALID_LINEAGE");
  const predecessorRuns = new Set(batch.predecessor_run_ids);
  const pending = [...predecessorRuns];
  while (pending.length) {
    const id = pending.pop();
    for (const edge of catalogs.trip_source_run_predecessors)
      if (
        edge.child_run_id === id &&
        !predecessorRuns.has(edge.parent_run_id as string)
      ) {
        predecessorRuns.add(edge.parent_run_id as string);
        pending.push(edge.parent_run_id as string);
      }
    if (predecessorRuns.size > 64) fail("LIMIT_EXCEEDED");
  }
  for (const id of batch.predecessor_candidate_ids)
    if (
      !catalogs.trip_source_candidates.some(
        (c) => c.id === id && predecessorRuns.has(c.run_id as string),
      )
    )
      fail("INVALID_LINEAGE");
  // An overlapping earlier Run cannot disappear merely by allocating new IDs.
  for (const run of catalogs.trip_source_runs)
    if (
      (run.scope_source_ids as string[]).some((id) =>
        request.materials.some((m) => m.pin.source_id === id),
      ) &&
      !predecessorRuns.has(run.id as string)
    )
      fail("LINEAGE_INCOMPLETE");
  for (const c of catalogs.trip_source_candidates)
    if (
      predecessorRuns.has(c.run_id as string) &&
      !batch.predecessor_candidate_ids.includes(c.id as string)
    )
      fail("LINEAGE_INCOMPLETE");
  await assertAccountRequestContext(context, getAccountId);
  freeze(request);
  let rawResponse: InterpretationResponse;
  try {
    rawResponse = await (
      dependencies.plugin ?? ((r) => referenceFlightExtract(r, sha256))
    )(request);
  } catch {
    // Adapter errors never expose private source content or vendor diagnostics.
    fail("INTERPRETATION_PLUGIN_FAILURE");
  }
  const checkedResponse = interpretationResponseSchema.safeParse(rawResponse);
  if (!checkedResponse.success)
    fail(
      checkedResponse.error.issues.some((i) => i.code === "too_big")
        ? "LIMIT_EXCEEDED"
        : "MALFORMED_OUTPUT",
    );
  const response = checkedResponse.data;
  freeze(response);
  await assertAccountRequestContext(context, getAccountId);
  if (Date.parse(request.binding.deadline) <= Date.parse(now()))
    fail("INTERPRETATION_DEADLINE");
  const { response_sha256, ...body } = response;
  if (
    json(response.binding) !== json(request.binding) ||
    response_sha256 !==
      (await importDigest(
        "otr-intelligence-response-v1",
        body as unknown as Json,
        sha256,
      )) ||
    new TextEncoder().encode(json(response)).length > 4194304
  )
    fail("INTERPRETATION_BINDING");
  const fragments = new Map(response.fragments.map((f) => [f.id, f]));
  if (
    fragments.size !== response.fragments.length ||
    new Set(response.items.map((i) => i.token)).size !== response.items.length
  )
    fail("EVIDENCE_INVALID");
  const bytesAt = (id: string) =>
    new TextEncoder().encode(
      request.materials.find((m) => m.pin.id === id)?.text ?? fail("EVIDENCE_INVALID"),
    );
  for (const f of response.fragments) {
    const m =
      request.materials.find((m) => m.pin.id === f.locator.input_id) ??
      fail("EVIDENCE_INVALID");
    if (
      f.source_id !== m.pin.source_id ||
      f.representation_id !== m.pin.representation_id ||
      f.material_revision !== m.pin.material_revision ||
      f.locator.kind !== "TEXT_SPAN" ||
      f.locator.start === null ||
      f.locator.end === null ||
      f.locator.start >= f.locator.end ||
      f.locator.end > bytesAt(m.pin.id).length ||
      f.locator.excerpt !== undefined
    )
      fail("EVIDENCE_INVALID");
  }
  const references = new Set<string>();
  for (const item of response.items) {
    if (
      !item.fields.some(
        (f) => f.path === "transport_subtype" && f.normalized === "FLIGHT",
      )
    )
      fail("NORMALIZATION_INVALID");
    for (const field of item.fields) {
      const normalized = normalizeFlightObservation(field.path, field.raw);
      if (
        json(field.normalized) !== json(normalized.value) ||
        json(field.uncertainty) !== json(normalized.uncertainty)
      )
        fail("NORMALIZATION_INVALID");
      for (const id of field.fragment_ids) {
        const f = fragments.get(id) ?? fail("EVIDENCE_INVALID");
        references.add(id);
        const literal = new TextDecoder("utf-8", { fatal: true }).decode(
          bytesAt(f.locator.input_id).slice(f.locator.start!, f.locator.end!),
        );
        if (literal !== field.raw) fail("EVIDENCE_INVALID");
      }
    }
    for (const d of item.deferred) {
      const f = fragments.get(d.fragment_id) ?? fail("EVIDENCE_INVALID");
      references.add(f.id);
      const literal = new TextDecoder("utf-8", { fatal: true }).decode(
        bytesAt(f.locator.input_id).slice(f.locator.start!, f.locator.end!),
      );
      const marker = /^(passenger|pnr|seat|ticket|baggage|fare|cabin)\s*[:=]/i.exec(
        literal,
      );
      const dimension = {
        passenger: "passengers",
        pnr: "bookings",
        seat: "seats",
        ticket: "tickets",
        baggage: "baggage",
        fare: "fare",
        cabin: "cabin",
      }[marker?.[1].toLowerCase() ?? ""];
      if (dimension !== d.dimension) fail("EVIDENCE_INVALID");
    }
  }
  if (references.size !== fragments.size) fail("EVIDENCE_INVALID");
  if (
    response.coverage.length !== request.materials.length ||
    new Set(response.coverage.map((c) => c.input_id)).size !== response.coverage.length
  )
    fail("COVERAGE_INVALID");
  for (const c of response.coverage) {
    if (!request.materials.some((m) => m.pin.id === c.input_id)) fail("COVERAGE_INVALID");
    const expected = response.items
      .filter((i) =>
        [
          ...i.fields.flatMap((f) => f.fragment_ids),
          ...i.deferred.map((d) => d.fragment_id),
        ].some((id) => fragments.get(id)?.locator.input_id === c.input_id),
      )
      .map((i) => i.token);
    if (
      json(sorted(expected)) !== json(sorted(c.item_tokens)) ||
      (c.status !== "PROCESSED" && c.item_tokens.length) ||
      (c.status === "PROCESSED") !== (c.code === null)
    )
      fail("COVERAGE_INVALID");
    for (const l of c.ignored)
      if (
        l.input_id !== c.input_id ||
        l.kind !== "TEXT_SPAN" ||
        l.start === null ||
        l.end === null ||
        l.start >= l.end ||
        l.end > bytesAt(c.input_id).length
      )
        fail("COVERAGE_INVALID");
  }
  const unprocessed = response.coverage
    .filter((c) => c.status !== "PROCESSED")
    .map((c) => c.input_id)
    .sort();
  const status = !unprocessed.length
    ? "SUCCEEDED"
    : unprocessed.length === response.coverage.length
      ? "FAILED"
      : "PARTIAL";
  if (
    json(unprocessed) !== json(response.unprocessed_input_ids) ||
    response.status !== status
  )
    fail("COVERAGE_INVALID");
  const failedCoverage = response.coverage.filter(
    (c) => c.code === "INPUT_INVALID" || c.code === "LIMIT_EXCEEDED",
  );
  if (
    response.failures.length !== failedCoverage.length ||
    failedCoverage.some(
      (c) =>
        !response.failures.some(
          (f) =>
            f.request_id === request.binding.request_id &&
            f.code === c.code &&
            f.category === c.code &&
            json(f.input_ids) === json([c.input_id]),
        ),
    )
  )
    fail("COVERAGE_INVALID");
  const ids = await Promise.all(
    response.items.map((i) => proposalId(request.binding.run_id, [i.token], sha256)),
  );
  const anchors = response.items.map((item, i) =>
    itemAnchor(item, ids[i], batch, response.fragments),
  );
  const conflictingClocks = new Set(
    response.items
      .filter(
        (item) =>
          new Set(
            item.fields
              .filter((f) => f.path === "origin.local_time" && f.normalized !== null)
              .map((f) => json(f.normalized)),
          ).size > 1,
      )
      .map((item) => ids[response.items.indexOf(item)]),
  );
  const resolutions: FlightResolution[] = [];
  // ponytail: bounded pairwise scan (64 observations); partition only if Run limits change.
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++)
      resolutions.push(
        resolve(
          anchors[i],
          anchors[j],
          batch,
          response.items[i].fields.some((f) => f.path === "change_notice") ||
            response.items[j].fields.some((f) => f.path === "change_notice"),
          anchors,
          conflictingClocks,
        ),
      );
  const groups: number[][] = [];
  for (let i = 0; i < anchors.length; i++) {
    const group = groups.find((g) =>
      g.every((j) =>
        resolutions.some(
          (r) =>
            r.outcome === "SAME_ITEM" &&
            ((r.left === ids[i] && r.right === ids[j]) ||
              (r.left === ids[j] && r.right === ids[i])),
        ),
      ),
    );
    if (group) group.push(i);
    else groups.push([i]);
  }
  const candidates: FlightInterpretationCandidate[] = [];
  for (const group of groups) {
    const observations = group.map((i) => response.items[i]);
    const occurrence: FlightInterpretationCandidate["occurrence"] = {};
    let observationCount = 0;
    for (const item of observations)
      for (const field of item.fields) {
        const entry = (occurrence[field.path] ??= {
          knowledge: "UNKNOWN",
          value: null,
          observations: [],
        });
        const observation_id = await importDigest(
          "otr-flight-observation-v1",
          [
            request.binding.run_id,
            item.token,
            field.path,
            field.raw,
            field.fragment_ids,
          ] as Json,
          sha256,
        );
        entry.observations.push({ ...field, item_token: item.token, observation_id });
        observationCount++;
      }
    if (Object.keys(occurrence).length > 64 || observationCount > 4096)
      fail("LIMIT_EXCEEDED");
    const contradictions: FlightInterpretationCandidate["contradictions"] = [];
    for (const [path, entry] of Object.entries(occurrence)) {
      const values = [
        ...new Map(
          entry.observations
            .filter((o) => o.normalized !== null)
            .map((o) => [json(o.normalized), o.normalized as Json]),
        ).values(),
      ];
      entry.knowledge =
        values.length > 1 || entry.observations.some((o) => o.uncertainty.length)
          ? "AMBIGUOUS"
          : values.length === 1
            ? "PRESENT"
            : "UNKNOWN";
      entry.value = entry.knowledge === "PRESENT" ? values[0] : null;
      const operatingValues =
        occurrence.operating_service?.observations
          .filter((o) => o.normalized !== null && !o.uncertainty.length)
          .map((o) => o.normalized) ?? [];
      if (
        path === "service" &&
        values.length > 1 &&
        new Set(operatingValues.map(json)).size === 1 &&
        !entry.observations.some((o) => o.uncertainty.length) &&
        !occurrence.operating_service?.observations.some((o) => o.uncertainty.length)
      ) {
        // Several evidenced marketing designators for one operating occurrence are
        // compatible scoped services, not rival values for a single service fact.
        entry.knowledge = "PRESENT";
        entry.value = values;
      } else if (values.length > 1)
        contradictions.push({
          path,
          observation_ids: sorted(entry.observations.map((o) => o.observation_id)),
          alternatives: values,
        });
    }
    const tokens = observations.map((i) => i.token).sort();
    const id = await proposalId(request.binding.run_id, tokens, sha256);
    const proposal = consolidateProposal(occurrence, response.fragments);
    const deferred = observations
      .flatMap((i) => i.deferred)
      .map((d) => {
        const f = fragments.get(d.fragment_id)!;
        return {
          dimension: d.dimension,
          candidate_field_key: null,
          input_id: f.locator.input_id,
          locator: f.locator,
          reason: d.reason,
        };
      });
    if (deferred.length > 64) fail("LIMIT_EXCEEDED");
    const inputIds = sorted(
      Object.values(occurrence).flatMap((v) =>
        v.observations.flatMap((o) =>
          o.fragment_ids.map((id) => fragments.get(id)!.locator.input_id),
        ),
      ),
    );
    candidates.push({
      id,
      candidate_key: `flight:${id}`,
      run_id: request.binding.run_id,
      candidate_kind: "TRANSPORT",
      proposal_version: 1,
      proposal,
      proposal_sha256: await importDigest(
        "otr-source-candidate-v1",
        proposal as Json,
        sha256,
      ),
      occurrence,
      evidence_support: Object.fromEntries(
        Object.entries(occurrence).map(([p, v]) => [
          p,
          sorted(v.observations.flatMap((o) => o.fragment_ids)),
        ]),
      ),
      contradictions,
      ambiguity: sorted([
        ...Object.entries(occurrence)
          .filter(([, v]) => v.knowledge !== "PRESENT")
          .map(([p]) => p),
        ...(["origin", "destination"] as const)
          .filter(
            (role) =>
              proposal.fields[role]?.proposed_value.time.local_time !== null &&
              proposal.fields[role]?.proposed_value.time.source_instant === null,
          )
          .map((role) => `${role}.TEMPORAL_RESOLUTION_PENDING`),
      ]),
      observation_tokens: tokens,
      entity_resolution: resolutions.filter((r) =>
        group.some((i) => ids[i] === r.left || ids[i] === r.right),
      ),
      input_ids: inputIds,
      source_ids: sorted(
        inputIds.map(
          (id) => request.materials.find((m) => m.pin.id === id)!.pin.source_id,
        ),
      ),
      deferred_dimensions: deferred,
      predecessor_candidate_ids: batch.predecessor_candidate_ids,
      anchors: group.map((i) => anchors[i]),
    });
  }
  candidates.sort((a, b) => a.candidate_key.localeCompare(b.candidate_key));
  const sourceIds = sorted(request.materials.map((m) => m.pin.source_id));
  const predecessors = batch.predecessor_run_ids.map((id) => ({
    parent_run_id: id,
    relation: "CONSOLIDATE" as const,
  }));
  const lineage = candidates.flatMap((c) =>
    c.predecessor_candidate_ids.map((id) => ({
      child_candidate_id: c.id,
      parent_candidate_id: id,
      relation: "CONSOLIDATE" as const,
    })),
  );
  if (
    lineage.length > 64 ||
    candidates.some((c) => new TextEncoder().encode(json(c)).length > 262144) ||
    new TextEncoder().encode(json(candidates)).length > 4194304
  )
    fail("LIMIT_EXCEEDED");
  const result = {
    candidate_set_id: await proposalId(
      request.binding.run_id,
      [batch.batch_id, String(batch.manifest_version)],
      sha256,
    ),
    version: 1 as const,
    batch_id: batch.batch_id,
    manifest_version: batch.manifest_version,
    account_id: context.accountId,
    trip_id: context.tripId,
    run_id: request.binding.run_id,
    run_generation: request.binding.generation,
    input_sha256: request.binding.input_sha256,
    match_policy: FLIGHT_MATCH_POLICY,
    interpretation_binding: response.binding,
    interpretation_response_sha256: response_sha256,
    status: response.status,
    candidates,
    fragments: response.fragments,
    coverage: response.coverage,
    unprocessed_input_ids: response.unprocessed_input_ids,
    failures: response.failures,
    resolutions,
    observation_proposals: response.items.map((item, i) => ({
      token: item.token,
      id: ids[i],
    })),
    matching_scope: batch.matching,
    matching_configuration: flightInterpretationConfiguration(batch),
    predecessors,
    lineage,
    // Exact existing internal publication request; not sent or labelled published.
    publication_request: {
      id: request.binding.run_id,
      operation_key: request.binding.idempotency_key,
      scope_source_ids: sourceIds,
      extractor_key: request.binding.descriptor.plugin_id,
      extractor_version: request.binding.descriptor.adapter_version,
      extractor_options_sha256: request.binding.descriptor.configuration_sha256,
      inputs: request.materials
        .map((m) => m.pin)
        .sort((a, b) => a.id.localeCompare(b.id)),
      candidates: candidates.map(
        ({ id, candidate_key, candidate_kind, proposal_version, proposal }) => ({
          id,
          candidate_key,
          candidate_kind,
          proposal_version,
          proposal,
        }),
      ),
      predecessors,
      lineage,
    },
  };
  if (new TextEncoder().encode(json(result)).length > 4194304) fail("LIMIT_EXCEEDED");
  return withAccountApplyGate(async () => {
    await assertAccountRequestContext(context, getAccountId);
    return freeze(result);
  });
}

// The one public Candidate Set; closure uses an explicit review projection.
export type FlightCandidateSet = Awaited<ReturnType<typeof interpretFlightBatch>>;
