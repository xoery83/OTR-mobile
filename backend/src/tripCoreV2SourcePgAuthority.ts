import { randomUUID } from "node:crypto";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import {
  applyCoreCommand,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import {
  validateCoreCommand,
  type CoreCommand,
} from "../../src/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import {
  flightCommandLeaves,
  type FlightValues,
} from "../../src/domain/trip/flightAdmission";
import {
  flightInputSchema,
  type ImportHash,
} from "../../src/domain/trip/flightImportReview";
import {
  flightOutputPurposeV2Schema,
  assertFlightOutputClaimsV2,
  compareFlightOutputPurposesV2,
  type FlightOutputClaimV2,
} from "../../src/domain/trip/flightOutputPurposeV2";
import {
  coreCandidatePublicationV2Schema,
  coreCandidatePublicationResultSchema,
  candidatePublicationRequestHash,
  candidatePublicationHash,
  sealedCoreFlightCandidateSchema,
  coreAirportBindingSchema,
  type CoreCandidatePublicationResult,
  type SealedCoreFlightCandidate,
  type CorePublicationMaterial,
} from "../../src/domain/trip/tripCoreV2CandidatePublication";
import { extractCoreFlightPublication } from "./tripCoreV2CandidatePublication";
import {
  withCoreSourcePgLease,
  readOwningLegacySourceCatalog,
} from "./tripCoreV2SourcePgStorage";
import {
  readCorePgGraph,
  lockCorePgActor,
  type CorePgConnection,
  type CorePgLease,
  type CorePgAdmission,
} from "./tripCoreV2PgStorage";
import type {
  CoreSourceScopeV2,
  CoreSourceCatalogV2,
  CoreSourcePlanStorageV2,
  CoreSourceStoredPlanV2,
  CoreSourcePlanTransactionV2,
  CoreSourceStoredSlotV2,
} from "./tripCoreV2Source";
const json = (v: unknown) => canonicalCoreJson(v as Json);
const supported = new Set([
  "CREATE_SPARSE_FLIGHT",
  "QUALIFY_FLIGHT",
  "UPDATE_FLIGHT_FACTS",
]);
const scopeParams = (s: CoreSourceScopeV2 & { sourceId: string }) => [
  s.actorAccountId,
  s.tripId,
  s.sourceId,
];
async function registry(lease: CorePgLease, code: string, day: string) {
  const value = (
    await lease.query(
      "SELECT public.trip_core_resolve_airport('IATA_AIRPORT','IATA',$1,$2::date) AS identity",
      [code, day],
    )
  ).rows[0]?.identity;
  return value === null ? null : coreAirportBindingSchema.parse(value);
}
async function sourceReader<T>(lease: CorePgLease, work: () => Promise<T>) {
  const role = (await lease.query("SELECT current_user AS role")).rows[0]?.role;
  if (!["otr_trip_core_v2_gateway", "otr_trip_core_v2_writer"].includes(role as string))
    throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
  if (role === "otr_trip_core_v2_gateway")
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
  try {
    return await work();
  } finally {
    if (role === "otr_trip_core_v2_gateway")
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
  }
}
async function lockSource(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
) {
  const role = (await lease.query("SELECT current_user AS role")).rows[0]?.role;
  if (role === "otr_trip_core_v2_writer")
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
  try {
    if (
      (
        await lease.query(
          "SELECT public.trip_core_lock_source_scope($1::uuid,$2::uuid,$3::uuid) AS allowed",
          scopeParams(scope),
        )
      ).rows[0]?.allowed !== true
    )
      throw new Error("NOT_VISIBLE");
  } finally {
    if (role === "otr_trip_core_v2_writer")
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
  }
}
async function materials(
  lease: CorePgLease,
  catalog: CoreSourceCatalogV2,
): Promise<CorePublicationMaterial[]> {
  const result: CorePublicationMaterial[] = [];
  const revision = (
    await lease.query(
      "SELECT original_representation_ids,retention_state FROM public.trip_source_revisions WHERE source_id=$1::uuid AND material_revision=$2",
      [catalog.sourceId, catalog.sourceRevision],
    )
  ).rows[0];
  if (!revision || revision.retention_state !== "RETAINED")
    throw new Error("SOURCE_INTEGRITY_FAILURE");
  const originals = revision.original_representation_ids as string[],
    selected = catalog.inputs.map(
      (p) => (p as { representation_id: string }).representation_id,
    );
  if (
    originals.length !== selected.length ||
    [...originals].sort().join("|") !== selected.sort().join("|")
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  for (const input of catalog.inputs) {
    const pin = flightInputSchema.parse(input),
      row = (
        await lease.query(
          "SELECT role,material_kind,text_content,payload_sha256,byte_count,retention_state FROM public.trip_source_representations WHERE source_id=$1::uuid AND id=$2::uuid",
          [pin.source_id, pin.representation_id],
        )
      ).rows[0];
    if (
      !row ||
      row.retention_state !== "RETAINED" ||
      row.payload_sha256 !== pin.payload_sha256 ||
      Number(row.byte_count) !== pin.byte_count
    )
      throw new Error("SOURCE_INTEGRITY_FAILURE");
    if (
      row.role !== "ORIGINAL" ||
      row.material_kind !== "TEXT" ||
      typeof row.text_content !== "string"
    )
      throw new Error("CONTRACT_UNSUPPORTED");
    result.push({ pin, media_type: "text/plain", form: "TEXT", text: row.text_content });
  }
  return result;
}
async function verifyBytes(
  lease: CorePgLease,
  catalog: CoreSourceCatalogV2,
  hash: ImportHash,
) {
  for (const m of await materials(lease, catalog)) {
    const bytes = new TextEncoder().encode(m.text);
    if (bytes.length !== m.pin.byte_count || (await hash(bytes)) !== m.pin.payload_sha256)
      throw new Error("SOURCE_INTEGRITY_FAILURE");
  }
}
async function publication(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
  id: string,
  hash: ImportHash,
) {
  const row = (
    await lease.query(
      "SELECT * FROM public.trip_source_core_v2_publications WHERE publication_id=$1::uuid",
      [id],
    )
  ).rows[0];
  if (
    !row ||
    row.account_id !== scope.actorAccountId ||
    row.trip_id !== scope.tripId ||
    row.source_id !== scope.sourceId
  )
    throw new Error("INVALID_PROVENANCE");
  const request = coreCandidatePublicationV2Schema.parse(row.request_json),
    response = coreCandidatePublicationResultSchema.parse(row.response_json);
  if (
    (await candidatePublicationRequestHash(request, hash)) !== row.request_sha256 ||
    response.requestSha256 !== row.request_sha256 ||
    response.accountId !== scope.actorAccountId ||
    response.tripId !== scope.tripId ||
    response.sourceId !== scope.sourceId ||
    response.publicationId !== id ||
    response.runId !== row.run_id ||
    response.sourceRevision !== Number(row.source_revision) ||
    response.inputCatalogSha256 !== row.input_catalog_sha256
  )
    throw new Error("INVALID_PROVENANCE");
  return { row, request, response };
}
async function catalogForCandidates(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
  candidateIds: readonly string[],
  hash: ImportHash,
  historical = false,
): Promise<CoreSourceCatalogV2> {
  const selected = (
    await lease.query(
      "SELECT candidate_json FROM public.trip_source_core_v2_candidates WHERE account_id=$1::uuid AND trip_id=$2::uuid AND source_id=$3::uuid AND candidate_id IN(SELECT v::uuid FROM jsonb_array_elements_text($4::jsonb) v)",
      [...scopeParams(scope), json(candidateIds)],
    )
  ).rows;
  if (!selected.length) return readOwningLegacySourceCatalog(lease, scope);
  if (selected.length !== candidateIds.length) throw new Error("INVALID_PROVENANCE");
  const bodies = selected.map((r) =>
    sealedCoreFlightCandidateSchema.parse(r.candidate_json),
  );
  const ids = new Set(bodies.map((c) => c.publicationId));
  if (ids.size !== 1) throw new Error("CONTRACT_UNSUPPORTED");
  const pub = await publication(lease, scope, bodies[0].publicationId, hash),
    catalog = await readOwningLegacySourceCatalog(
      lease,
      scope,
      pub.response.runId,
      historical ? pub.response.sourceRevision : undefined,
    );
  if (
    catalog.sourceRevision !== pub.response.sourceRevision ||
    catalog.inputCatalogSha256 !== pub.response.inputCatalogSha256
  )
    throw new Error("INPUT_STALE");
  const mixed =
    catalog.runScopeSourceIds?.length !== 1 ||
    catalog.runScopeSourceIds[0] !== scope.sourceId ||
    catalog.inputs.some(
      (pin) => (pin as { source_id?: string }).source_id !== scope.sourceId,
    );
  if (mixed && pub.response.candidates.some((c) => c.status === "QUALIFIED"))
    throw new Error("INVALID_PROVENANCE");
  if (!mixed && pub.response.candidates.some((c) => c.status === "QUALIFIED"))
    await verifyBytes(lease, catalog, hash);
  const rows = (
    await lease.query(
      "SELECT candidate_id,run_id,source_revision,input_catalog_sha256,candidate_sha256,candidate_json FROM public.trip_source_core_v2_candidates WHERE account_id=$1::uuid AND trip_id=$2::uuid AND source_id=$3::uuid AND candidate_json->>'publicationId'=$4 ORDER BY candidate_id LIMIT 65",
      [...scopeParams(scope), pub.response.publicationId],
    )
  ).rows;
  if (rows.length !== pub.request.candidates.length || rows.length > 64)
    throw new Error("INVALID_PROVENANCE");
  catalog.candidates = [];
  for (const r of rows) {
    const body = sealedCoreFlightCandidateSchema.parse(r.candidate_json),
      expected = pub.response.candidates.find((c) => c.candidateId === r.candidate_id);
    if (
      !expected ||
      body.candidate.accountId !== scope.actorAccountId ||
      body.candidate.tripId !== scope.tripId ||
      body.candidate.sourceId !== scope.sourceId ||
      body.candidate.sourceRevision !== catalog.sourceRevision ||
      body.candidate.runId !== r.run_id ||
      r.run_id !== pub.response.runId ||
      Number(r.source_revision) !== catalog.sourceRevision ||
      r.input_catalog_sha256 !== catalog.inputCatalogSha256 ||
      (await candidatePublicationHash(body, hash)) !== r.candidate_sha256 ||
      expected.candidateSha256 !== r.candidate_sha256 ||
      body.status !== expected.status ||
      body.errorCode !== expected.errorCode ||
      json(body.candidate) !==
        json(pub.request.candidates.find((c) => c.candidateId === r.candidate_id))
    )
      throw new Error("INVALID_PROVENANCE");
    if (body.status === "QUALIFIED") {
      if (
        !body.identityFacts ||
        !body.identityEvidenceRefs ||
        body.airportBindings.length !== 2 ||
        (pub.row.verification_json as { complete?: boolean; hazard?: boolean })
          .complete !== true ||
        (pub.row.verification_json as { hazard?: boolean }).hazard !== false
      )
        throw new Error("INVALID_PROVENANCE");
      for (const airport of historical ? [] : body.airportBindings) {
        if (
          json(await registry(lease, airport.code, body.identityFacts.originDate)) !==
          json(airport)
        )
          throw new Error("INPUT_STALE");
      }
    }
    catalog.candidates.push({
      candidateId: r.candidate_id as string,
      runId: r.run_id as string,
      kind: "P2",
      candidateSha256: r.candidate_sha256 as string,
      snapshot: body as Json,
      identityFacts: body.status === "QUALIFIED" ? body.identityFacts : null,
      identityEvidenceRefs:
        body.status === "QUALIFIED" ? body.identityEvidenceRefs : null,
    });
  }
  return catalog;
}
function verifyPayload(
  body: SealedCoreFlightCandidate,
  slot: CoreSourceStoredSlotV2["proposed"],
  command: CoreCommand,
) {
  if (
    body.status !== "QUALIFIED" ||
    !body.identityFacts ||
    !body.identityEvidenceRefs ||
    !supported.has(command.command) ||
    command.admission.mode !== "REVIEWED_SOURCE"
  )
    throw new Error("CONTRACT_UNSUPPORTED");
  const payload = command.payload as Record<string, any>,
    values = body.values as FlightValues;
  let selected: Record<string, Json>;
  if (command.command === "CREATE_SPARSE_FLIGHT") {
    if (
      payload.flightNumberLiteral !== body.candidate.facts.flightNumberLiteral ||
      payload.departureDate !== body.candidate.facts.departureDate ||
      (payload.core &&
        Object.keys(payload.core).some(
          (k) => k !== "title" || payload.core.title !== body.candidate.facts.core?.title,
        ))
    )
      throw new Error("INVALID_PROVENANCE");
    selected = {
      flightNumberLiteral: payload.flightNumberLiteral,
      departureDate: payload.departureDate,
      ...(payload.core?.title ? { "ROOT.title": payload.core.title } : {}),
    };
  } else {
    const changes = (
      command.command === "UPDATE_FLIGHT_FACTS" ? payload.changes : payload
    ) as FlightValues;
    for (const [key, value] of Object.entries(changes)) {
      if (key === "proofs") continue;
      if (
        values[key as keyof FlightValues] === undefined ||
        json(value) !== json(values[key as keyof FlightValues])
      )
        throw new Error("INVALID_PROVENANCE");
    }
    selected = flightCommandLeaves(changes);
    if (
      Object.keys(payload.proofs).sort().join("|") !==
        Object.keys(selected).sort().join("|") ||
      Object.entries(payload.proofs).some(
        ([key, p]: [string, any]) =>
          p.kind !== "TRACK_C" || p.ref !== body.fieldEvidence[key]?.ref,
      )
    )
      throw new Error("INVALID_PROVENANCE");
  }
  if (
    [...slot.selectedFields].sort().join("|") !== Object.keys(selected).sort().join("|")
  )
    throw new Error("INVALID_PROVENANCE");
  for (const [key, value] of Object.entries(selected))
    if (!body.fieldEvidence[key] || json(body.fieldEvidence[key].value) !== json(value))
      throw new Error("INVALID_PROVENANCE");
  const needed = new Set([
      ...Object.keys(selected).map((k) => body.fieldEvidence[k].ref),
      ...Object.values(body.identityEvidenceRefs).flat(),
    ]),
    actual = Object.values(slot.evidenceRefs).flat();
  if (
    new Set(actual).size !== actual.length ||
    [...needed].sort().join("|") !== actual.sort().join("|")
  )
    throw new Error("INVALID_PROVENANCE");
}
function checkUpdateTarget(
  graph: CoreGraph,
  command: CoreCommand,
  body: SealedCoreFlightCandidate,
) {
  if (command.command !== "UPDATE_FLIGHT_FACTS") return;
  const origin = graph.itinerary_transport_endpoints.find(
      (r) => r.event_id === command.target.id && r.role === "ORIGIN",
    ),
    destination = graph.itinerary_transport_endpoints.find(
      (r) => r.event_id === command.target.id && r.role === "DESTINATION",
    ),
    services = graph.itinerary_transport_services.filter(
      (r) => r.event_id === command.target.id,
    ),
    identity = body.identityFacts!;
  if (
    !origin ||
    !destination ||
    services.length !== 1 ||
    origin.local_date !== identity.originDate ||
    "IATA_AIRPORT:" + origin.authored_label !== identity.originAirportId ||
    "IATA_AIRPORT:" + destination.authored_label !== identity.destinationAirportId ||
    services[0].operator_namespace !== identity.namespace ||
    services[0].operator_issuer !== identity.issuer ||
    services[0].operator_value !== identity.operator ||
    services[0].service_number !== identity.serviceNumber
  )
    throw new Error("OUTPUT_TARGET_COLLISION");
  const changes = (command.payload as { changes: FlightValues }).changes;
  for (const role of ["origin", "destination"] as const) {
    const endpoint = changes[role];
    if (!endpoint) continue;
    const old = role === "origin" ? origin : destination;
    for (const [key, value] of Object.entries({ ...endpoint.time, ...endpoint.location }))
      if (key !== "fold_choice" && value === null && old[key] !== null)
        throw new Error("INVALID_PROVENANCE");
  }
}
async function claims(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
  legacy: FlightOutputClaimV2[],
  hash: ImportHash,
): Promise<FlightOutputClaimV2[]> {
  const rows = (
    await lease.query(
      "SELECT s.*,c.run_id FROM public.trip_source_core_v2_slots s JOIN public.trip_source_core_v2_candidates c ON c.candidate_id=s.candidate_id WHERE s.account_id=$1::uuid AND s.trip_id=$2::uuid AND s.source_id=$3::uuid AND s.command IN('CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT','UPDATE_FLIGHT_FACTS') ORDER BY s.output_slot_id LIMIT 65 FOR UPDATE OF s",
      scopeParams(scope),
    )
  ).rows;
  if (rows.length + legacy.length > 64) throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
  const result = [...legacy];
  for (const row of rows) {
    const purpose = flightOutputPurposeV2Schema.parse(row.output_purpose),
      {
        identityFacts: _facts,
        identityEvidenceRefs: _refs,
        purposeSha256: _sha,
        ...fields
      } = purpose;
    let outcome: "UNKNOWN" | "SUCCEEDED" | "NO_COMMIT" = "UNKNOWN";
    const raw = (
      await lease.query(
        "SELECT body FROM public.trip_core_command_receipts WHERE actor_account_id=$1::uuid AND trip_id=$2::uuid AND operation_id=$3::uuid",
        [scope.actorAccountId, scope.tripId, row.operation_id],
      )
    ).rows[0]?.body;
    if (raw) {
      const receipt = await validateCoreReceipt(raw, hash);
      if (
        receipt.intentSha256 !== row.intent_sha256 ||
        receipt.command !== row.command ||
        !receipt.targetVector.some(
          (v) => v.kind === row.target_kind && v.id === row.target_id,
        )
      )
        throw new Error("RECEIPT_TARGET_MISMATCH");
      if (["APPLIED", "NO_CHANGE"].includes(receipt.outcome)) outcome = "SUCCEEDED";
      else if (
        receipt.outcome === "REJECTED" &&
        !(
          await lease.query("SELECT id FROM public.itinerary_events WHERE id=$1::uuid", [
            row.target_id,
          ])
        ).rows.length
      )
        outcome = "NO_COMMIT";
    }
    result.push({
      kind: "CERTIFIED",
      binding: {
        accountId: scope.actorAccountId,
        tripId: scope.tripId,
        runId: row.run_id as string,
        candidateId: row.candidate_id as string,
        ...fields,
      },
      certified: { purpose, identitySha256: row.identity_sha256 as string },
      outcome,
    });
  }
  return result;
}
function checkKnownTarget(
  all: FlightOutputClaimV2[],
  targetId: string,
  body: SealedCoreFlightCandidate,
) {
  for (const claim of all) {
    if (claim.outcome === "NO_COMMIT") continue;
    if (claim.kind === "LEGACY") throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
    const other = claim.certified.purpose,
      relation = compareFlightOutputPurposesV2(body.identityFacts!, other.identityFacts);
    if (other.targetId === targetId) {
      if (relation !== "SAME_OUTPUT") throw new Error("OUTPUT_TARGET_COLLISION");
    } else if (relation === "SAME_OUTPUT") throw new Error("OUTPUT_PURPOSE_COLLISION");
    else if (relation === "UNKNOWN") throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
  }
}
async function putPlan(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
  plan: CoreSourceStoredPlanV2,
) {
  if (
    plan.scope.actorAccountId !== scope.actorAccountId ||
    plan.scope.tripId !== scope.tripId ||
    plan.scope.planId !== scope.planId ||
    plan.request.sourceId !== scope.sourceId
  )
    throw new Error("IMPORT_SCOPE_MISMATCH");
  await lease.query(
    "INSERT INTO public.trip_source_core_v2_intents(plan_id,account_id,trip_id,source_id,source_revision,proposal_version,intent_version,request_sha256,request_json,prepared_json,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,2,2,$6,$7::jsonb,$8::jsonb,clock_timestamp()) ON CONFLICT(plan_id) DO UPDATE SET prepared_json=excluded.prepared_json WHERE trip_source_core_v2_intents.account_id=excluded.account_id AND trip_source_core_v2_intents.trip_id=excluded.trip_id AND trip_source_core_v2_intents.source_id=excluded.source_id AND trip_source_core_v2_intents.request_sha256=excluded.request_sha256",
    [
      scope.planId,
      scope.actorAccountId,
      scope.tripId,
      scope.sourceId,
      plan.request.sourceRevision,
      plan.proposalSha256,
      json(plan.request),
      json(plan),
    ],
  );
  for (const slot of plan.slots) {
    if (!slot.certified || !slot.binding || !slot.command || !slot.intentSha256) continue;
    const command = validateCoreCommand(slot.command);
    await lease.query(
      "INSERT INTO public.trip_source_core_v2_slots(output_slot_id,plan_id,account_id,trip_id,candidate_id,slot_key,target_kind,target_id,operation_id,command,canonical_intent_text,intent_sha256,target_vector,dependency_ids,source_id,output_purpose,purpose_sha256,identity_sha256,state,domain_receipt_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::uuid,$9::uuid,$10,$11,$12,$13::jsonb,ARRAY(SELECT v::uuid FROM jsonb_array_elements_text($14::jsonb) v),$15::uuid,$16::jsonb,$17,$18,$19,$20::uuid) ON CONFLICT(output_slot_id) DO UPDATE SET state=excluded.state,domain_receipt_id=excluded.domain_receipt_id WHERE trip_source_core_v2_slots.plan_id=excluded.plan_id AND trip_source_core_v2_slots.account_id=excluded.account_id AND trip_source_core_v2_slots.trip_id=excluded.trip_id AND trip_source_core_v2_slots.candidate_id=excluded.candidate_id AND trip_source_core_v2_slots.target_id=excluded.target_id AND trip_source_core_v2_slots.operation_id=excluded.operation_id AND trip_source_core_v2_slots.intent_sha256=excluded.intent_sha256 AND trip_source_core_v2_slots.purpose_sha256=excluded.purpose_sha256",
      [
        slot.proposed.slotId,
        scope.planId,
        scope.actorAccountId,
        scope.tripId,
        slot.proposed.candidateId,
        slot.proposed.slotKey,
        slot.proposed.targetKind,
        slot.proposed.target.id,
        slot.proposed.operationId,
        slot.proposed.command,
        json(command),
        slot.intentSha256,
        json(command.baseVector),
        json(slot.proposed.dependsOn),
        scope.sourceId,
        json(slot.certified.purpose),
        slot.certified.purpose.purposeSha256,
        slot.certified.identitySha256,
        slot.state,
        slot.domainReceiptId,
      ],
    );
    const saved = (
      await lease.query(
        "SELECT canonical_intent_text,intent_sha256 FROM public.trip_source_core_v2_slots WHERE output_slot_id=$1::uuid",
        [slot.proposed.slotId],
      )
    ).rows[0];
    if (
      !saved ||
      saved.canonical_intent_text !== json(command) ||
      saved.intent_sha256 !== slot.intentSha256
    )
      throw new Error("OPERATION_REUSE_MISMATCH");
  }
}
export function createCoreSourcePgAuthority(
  connection: CorePgConnection,
  hash: ImportHash,
) {
  const source: CoreSourcePlanStorageV2 = {
    withLockedSourcePlan: async (scope, work) =>
      withCoreSourcePgLease(connection, scope, async (lease, legacy) => {
        const plan = await legacy.readPlan(),
          owned = { ...scope, sourceId: scope.sourceId ?? plan?.request.sourceId };
        if (!owned.sourceId) throw new Error("NOT_VISIBLE");
        const own = owned as CoreSourceScopeV2 & { sourceId: string },
          ids = scope.candidateIds ?? plan?.request.candidateIds ?? [];
        let catalog: CoreSourceCatalogV2 | undefined;
        const verifiedBodies = new Map<string, SealedCoreFlightCandidate>();
        const load = async () =>
          (catalog ??= await catalogForCandidates(lease, own, ids, hash));
        const tx: CoreSourcePlanTransactionV2 = {
          ...legacy,
          readSealedCatalog: load,
          readClaims: async () => claims(lease, own, await legacy.readClaims(), hash),
          verifyFlightEvidence: async ({
            catalog: provided,
            candidate,
            binding,
            slot,
            command,
          }) => {
            const current = await load(),
              known = current.candidates.find(
                (c) => c.candidateId === candidate.candidateId,
              );
            if (
              !known ||
              json(current) !== json(provided) ||
              json(known) !== json(candidate) ||
              binding.candidateSha256 !== known.candidateSha256 ||
              binding.inputCatalogSha256 !== current.inputCatalogSha256
            )
              throw new Error("INVALID_PROVENANCE");
            const body = sealedCoreFlightCandidateSchema.parse(known.snapshot);
            verifyPayload(body, slot, command);
            verifiedBodies.set(command.operationId, body);
          },
          assertCommandAdmission: async (command) => {
            const gate = (
              await lease.query(
                "SELECT runtime_enabled,enabled_commands,enabled_families,enabled_admission_modes FROM public.trip_core_activation_gate WHERE singleton",
              )
            ).rows[0];
            if (
              !gate?.runtime_enabled ||
              !(gate.enabled_commands as string[]).includes(command.command) ||
              !(gate.enabled_families as string[]).includes("P2") ||
              !(gate.enabled_admission_modes as string[]).includes(command.admission.mode)
            )
              throw new Error("CORE_CAPABILITY_CLOSED");
            await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
            let actor: CoreActor;
            try {
              actor = await lockCorePgActor(lease, own.actorAccountId, own.tripId);
            } finally {
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
            }
            for (const target of command.baseVector) {
              await lease.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
                "otr-core2-identity:" + target.id,
              ]);
              const row = (
                await lease.query(
                  "SELECT trip_id,business_contract_version FROM public.itinerary_events WHERE id=$1::uuid FOR SHARE",
                  [target.id],
                )
              ).rows[0];
              if (
                row &&
                (row.trip_id !== own.tripId || row.business_contract_version !== 2)
              )
                throw new Error("CROSS_TRIP_REFERENCE");
            }
            const graph = await readCorePgGraph(lease, own.tripId),
              body = verifiedBodies.get(command.operationId);
            if (!body) throw new Error("INVALID_PROVENANCE");
            checkUpdateTarget(graph, command, body);
            if (command.command !== "CREATE_SPARSE_FLIGHT")
              checkKnownTarget(await tx.readClaims(), command.target.id, body);
            applyCoreCommand(graph, command, actor!, new Date().toISOString(), true);
          },
          putPlan: (p) => putPlan(lease, own, p),
          finalizeEvidence: async (slot, receipt) => {
            const old = (
              await lease.query(
                "SELECT * FROM public.trip_source_core_v2_associations WHERE output_slot_id=$1::uuid",
                [slot.proposed.slotId],
              )
            ).rows[0];
            if (old) {
              if (
                old.domain_receipt_id !== slot.domainReceiptId ||
                old.receipt_sha256 !== receipt.receiptSha256 ||
                old.target_id !== slot.proposed.target.id
              )
                throw new Error("RECEIPT_TARGET_MISMATCH");
              return { state: "COMPLETE", errorCode: null };
            }
            let current: CoreSourceCatalogV2;
            try {
              current = await catalogForCandidates(lease, own, ids, hash, true);
            } catch (error) {
              if (
                error instanceof Error &&
                ["INPUT_STALE", "SOURCE_INTEGRITY_FAILURE"].includes(error.message)
              )
                return { state: "EVIDENCE_PENDING", errorCode: error.message };
              throw error;
            }
            const c = current.candidates.find(
                (c) => c.candidateId === slot.proposed.candidateId,
              ),
              body = sealedCoreFlightCandidateSchema.parse(c?.snapshot),
              vector = receipt.targetVector.find(
                (v) => v.kind === "ITEM" && v.id === slot.proposed.target.id,
              );
            if (
              !slot.certified ||
              !slot.domainReceiptId ||
              !vector?.committedRevision ||
              !c
            )
              throw new Error("RECEIPT_TARGET_MISMATCH");
            const id = randomUUID();
            await lease.query(
              "INSERT INTO public.trip_source_core_v2_associations(id,account_id,trip_id,source_id,source_revision,run_id,candidate_id,output_slot_id,target_kind,target_id,target_revision,domain_receipt_id,receipt_sha256,identity_sha256,field_evidence,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid,$7::uuid,$8::uuid,'ITEM',$9::uuid,$10,$11::uuid,$12,$13,$14::jsonb,clock_timestamp())",
              [
                id,
                own.actorAccountId,
                own.tripId,
                own.sourceId,
                current.sourceRevision,
                c.runId,
                c.candidateId,
                slot.proposed.slotId,
                slot.proposed.target.id,
                vector.committedRevision,
                slot.domainReceiptId,
                receipt.receiptSha256,
                slot.certified.identitySha256,
                json(body.fieldEvidence),
              ],
            );
            await lease.query(
              "UPDATE public.trip_source_core_v2_slots SET source_lineage_id=$2::uuid WHERE output_slot_id=$1::uuid",
              [slot.proposed.slotId, id],
            );
            return { state: "COMPLETE", errorCode: null };
          },
        };
        return work(tx);
      }),
  };
  async function publish(
    actorAccountId: string,
    tripId: string,
    input: unknown,
  ): Promise<CoreCandidatePublicationResult> {
    const request = coreCandidatePublicationV2Schema.parse(input),
      requestSha256 = await candidatePublicationRequestHash(request, hash);
    coreUuid.parse(actorAccountId);
    coreUuid.parse(tripId);
    for (const candidate of request.candidates)
      if (candidate.accountId !== actorAccountId || candidate.tripId !== tripId)
        throw new Error("IMPORT_SCOPE_MISMATCH");
    const scope = {
      actorAccountId,
      tripId,
      planId: request.publicationId,
      sourceId: request.sourceId,
    };
    return withCoreSourcePgLease(connection, scope, async (lease) => {
      const prior = (
        await lease.query(
          "SELECT request_sha256,response_json FROM public.trip_source_core_v2_publications WHERE publication_id=$1::uuid",
          [request.publicationId],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_sha256 !== requestSha256)
          throw new Error("OPERATION_REUSE_MISMATCH");
        const result = coreCandidatePublicationResultSchema.parse(prior.response_json);
        if (
          result.accountId !== actorAccountId ||
          result.tripId !== tripId ||
          result.sourceId !== request.sourceId ||
          result.requestSha256 !== requestSha256
        )
          throw new Error("IMPORT_SCOPE_MISMATCH");
        return result;
      }
      const catalog = await readOwningLegacySourceCatalog(lease, scope, request.runId);
      if (
        catalog.sourceRevision !== request.sourceRevision ||
        catalog.inputCatalogSha256 !== request.inputCatalogSha256
      )
        throw new Error("INPUT_STALE");
      let extracted: Awaited<ReturnType<typeof extractCoreFlightPublication>>;
      try {
        if (
          catalog.runScopeSourceIds?.length !== 1 ||
          catalog.runScopeSourceIds[0] !== request.sourceId ||
          catalog.inputs.some(
            (pin) => (pin as { source_id?: string }).source_id !== request.sourceId,
          )
        )
          throw new Error("CONTRACT_UNSUPPORTED");
        extracted = await extractCoreFlightPublication(
          request,
          await materials(lease, catalog),
          actorAccountId,
          tripId,
          hash,
          (code, day) => registry(lease, code, day),
        );
      } catch (error) {
        if (!(error instanceof Error && error.message === "CONTRACT_UNSUPPORTED"))
          throw error;
        extracted = {
          sealed: request.candidates.map((candidate) => ({
            version: 2,
            publicationId: request.publicationId,
            candidate,
            status: "REVIEW",
            errorCode: "CONTRACT_UNSUPPORTED",
            identityFacts: null,
            identityEvidenceRefs: null,
            values: {},
            fieldEvidence: {},
            airportBindings: [],
          })),
          verification: {
            version: 2,
            grammar: "otr-reference-flight/1",
            sourceRevision: request.sourceRevision,
            inputCatalogSha256: request.inputCatalogSha256,
            items: [],
            fragments: [],
            coverage: [],
            complete: false,
            hazard: true,
          },
        };
      }
      const result: CoreCandidatePublicationResult = {
        publicationVersion: 2,
        publicationId: request.publicationId,
        accountId: actorAccountId,
        tripId,
        sourceId: request.sourceId,
        sourceRevision: request.sourceRevision,
        runId: request.runId,
        inputCatalogSha256: request.inputCatalogSha256,
        requestSha256,
        candidates: await Promise.all(
          extracted.sealed.map(async (body) => ({
            candidateId: body.candidate.candidateId,
            candidateSha256: await candidatePublicationHash(body, hash),
            status: body.status,
            errorCode: body.errorCode,
          })),
        ),
      };
      await lease.query(
        "INSERT INTO public.trip_source_core_v2_publications(publication_id,account_id,trip_id,source_id,source_revision,run_id,input_catalog_sha256,request_sha256,request_json,response_json,verification_json,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,clock_timestamp())",
        [
          request.publicationId,
          actorAccountId,
          tripId,
          request.sourceId,
          request.sourceRevision,
          request.runId,
          request.inputCatalogSha256,
          requestSha256,
          json(request),
          json(result),
          json(extracted.verification),
        ],
      );
      for (const body of extracted.sealed) {
        const item = result.candidates.find(
            (c) => c.candidateId === body.candidate.candidateId,
          )!,
          old = (
            await lease.query(
              "SELECT candidate_sha256 FROM public.trip_source_core_v2_candidates WHERE candidate_id=$1::uuid",
              [item.candidateId],
            )
          ).rows[0];
        if (old) throw new Error("OPERATION_REUSE_MISMATCH");
        await lease.query(
          "INSERT INTO public.trip_source_core_v2_candidates(candidate_id,account_id,trip_id,source_id,source_revision,run_id,input_catalog_sha256,candidate_sha256,candidate_json,sealed_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8,$9::jsonb,clock_timestamp())",
          [
            item.candidateId,
            actorAccountId,
            tripId,
            request.sourceId,
            request.sourceRevision,
            request.runId,
            request.inputCatalogSha256,
            item.candidateSha256,
            json(body),
          ],
        );
      }
      return coreCandidatePublicationResultSchema.parse(result);
    });
  }
  async function slotAuthority(
    lease: CorePgLease,
    actor: CoreActor,
    command: CoreCommand,
    intentSha256: string,
  ) {
    if (
      !supported.has(command.command) ||
      command.admission.mode !== "REVIEWED_SOURCE" ||
      !command.admission.sourceIntentId ||
      command.baseVector.some((v) => v.kind !== "ITEM")
    )
      throw new Error("OWNING_CAPABILITY_REQUIRED");
    const row = (
      await lease.query(
        "SELECT s.plan_id,s.source_id,i.prepared_json FROM public.trip_source_core_v2_slots s JOIN public.trip_source_core_v2_intents i ON i.plan_id=s.plan_id WHERE s.output_slot_id=$1::uuid AND s.account_id=$2::uuid AND s.trip_id=$3::uuid",
        [command.admission.sourceIntentId, actor.accountId, actor.tripId],
      )
    ).rows[0];
    if (!row) throw new Error("INVALID_PROVENANCE");
    const scope = {
      actorAccountId: actor.accountId,
      tripId: actor.tripId,
      sourceId: row.source_id as string,
      planId: row.plan_id as string,
    };
    await lockSource(lease, scope);
    const plan = row.prepared_json as CoreSourceStoredPlanV2,
      slot = plan.slots.find(
        (s) => s.proposed.slotId === command.admission.sourceIntentId,
      );
    if (
      plan.scope.actorAccountId !== actor.accountId ||
      plan.scope.tripId !== actor.tripId ||
      plan.scope.planId !== scope.planId ||
      plan.request.sourceId !== scope.sourceId ||
      (await coreHashValue(
        "otr-trip-core-source-plan-v2",
        plan.request as Json,
        hash,
      )) !== plan.proposalSha256 ||
      !slot?.command ||
      !slot.binding ||
      !slot.certified ||
      slot.intentSha256 !== intentSha256 ||
      json(slot.command) !== json(command) ||
      !["READY", "DOMAIN_SUCCEEDED", "EVIDENCE_PENDING", "COMPLETE"].includes(slot.state)
    )
      throw new Error("INVALID_PROVENANCE");
    let catalog: CoreSourceCatalogV2;
    try {
      catalog = await catalogForCandidates(lease, scope, plan.request.candidateIds, hash);
    } catch (error) {
      if (
        error instanceof Error &&
        ["INPUT_STALE", "SOURCE_INTEGRITY_FAILURE", "CONTRACT_UNSUPPORTED"].includes(
          error.message,
        )
      )
        throw new Error("INVALID_PROVENANCE");
      throw error;
    }
    const candidate = catalog.candidates.find(
      (c) => c.candidateId === slot.proposed.candidateId,
    );
    if (
      !candidate ||
      candidate.candidateSha256 !== slot.binding.candidateSha256 ||
      catalog.inputCatalogSha256 !== slot.binding.inputCatalogSha256 ||
      json(slot.certified.purpose.identityFacts) !== json(candidate.identityFacts) ||
      json(slot.certified.purpose.identityEvidenceRefs) !==
        json(candidate.identityEvidenceRefs) ||
      (await coreHashValue("otr-trip-core-intent-v2", command as Json, hash)) !==
        intentSha256
    )
      throw new Error("INVALID_PROVENANCE");
    verifyPayload(
      sealedCoreFlightCandidateSchema.parse(candidate.snapshot),
      slot.proposed,
      command,
    );
    return {
      scope,
      plan,
      slot,
      catalog,
      body: sealedCoreFlightCandidateSchema.parse(candidate.snapshot),
    };
  }
  const verifySourceIntent: CorePgAdmission["verify"] = async (
    lease,
    actor,
    command,
    intentSha256,
    graph,
  ) =>
    sourceReader(lease, async () => {
      const context = await slotAuthority(lease, actor, command, intentSha256);
      checkUpdateTarget(graph, command, context.body);
      {
        const legacy = (
          await lease.query(
            "SELECT s.slot_id FROM public.trip_source_output_slots s JOIN public.trip_source_confirmations c ON c.id=s.confirmation_id LEFT JOIN public.trip_source_runs r ON r.id=s.reviewed_run_id WHERE c.actor_account_id=$1::uuid AND c.trip_id=$2::uuid AND ($3::uuid=ANY(r.scope_source_ids) OR EXISTS(SELECT 1 FROM public.trip_source_inputs i WHERE i.confirmation_id=c.id AND i.source_id=$3::uuid)) AND s.disposition='CREATE' AND s.no_commit_basis IS NULL LIMIT 65",
            scopeParams(context.scope),
          )
        ).rows.map((r) => ({
          kind: "LEGACY" as const,
          accountId: actor.accountId,
          tripId: actor.tripId,
          slotId: r.slot_id as string,
          outcome: "UNKNOWN" as const,
        }));
        if (command.command !== "CREATE_SPARSE_FLIGHT") {
          checkKnownTarget(
            await claims(lease, context.scope, legacy, hash),
            command.target.id,
            context.body,
          );
          return;
        }
        await assertFlightOutputClaimsV2(
          context.slot.binding!,
          context.slot.certified!,
          await claims(lease, context.scope, legacy, hash),
          hash,
        );
      }
    });
  const canReadSourceReceipt: CorePgAdmission["canReadSourceReceipt"] = async (
    lease,
    actor,
    operationId,
  ) =>
    sourceReader(lease, async () => {
      const row = (
        await lease.query(
          "SELECT s.output_slot_id FROM public.trip_source_core_v2_slots s JOIN public.trip_sources src ON src.id=s.source_id WHERE s.account_id=$1::uuid AND s.trip_id=$2::uuid AND s.operation_id=$3::uuid AND src.acquired_by=$1::uuid AND src.lifecycle='ACTIVE' AND src.retention_state='RETAINED'",
          [actor.accountId, actor.tripId, operationId],
        )
      ).rows[0];
      return !!row;
    });
  const audit: NonNullable<CorePgAdmission["audit"]> = async (
    lease,
    actor,
    command,
    intentSha256,
  ) =>
    sourceReader(lease, async () => {
      const c = await slotAuthority(lease, actor, command, intentSha256);
      return {
        evidenceRefs: [
          ...new Set([...Object.values(c.slot.proposed.evidenceRefs).flat()]),
        ].sort(),
        authorizationRefs: [
          `otr-core/source-publication/${c.body.publicationId}/${(await publication(lease, c.scope, c.body.publicationId, hash)).response.requestSha256}`,
          ...[
            ...new Set(
              c.body.airportBindings.map(
                (a) =>
                  `otr-core/airport-registry/${encodeURIComponent(a.registryVersion)}/${a.registrySha256}`,
              ),
            ),
          ],
        ].sort(),
      };
    });
  const canReadAudit: NonNullable<CorePgAdmission["canReadAudit"]> = async (
    lease,
    actor,
    receipt,
  ) =>
    sourceReader(lease, async () => {
      const pointers = [
        ...receipt.audit.evidenceRefs,
        ...receipt.audit.authorizationRefs,
      ];
      let unsupported = false;
      const strings = (v: unknown) => {
        if (typeof v === "string") pointers.push(v);
        else if (v && typeof v === "object") Object.values(v).forEach(strings);
      };
      const walk = (v: unknown) => {
        if (!v || typeof v !== "object") return;
        for (const [key, value] of Object.entries(v)) {
          if (key === "source_representation_id" && value !== null) unsupported = true;
          else if (key === "evidence_ref" && value !== null) strings(value);
          else if (
            !key.includes(".") &&
            key.endsWith("provenance_refs") &&
            value !== null
          )
            strings(value);
          else walk(value);
        }
      };
      receipt.audit.before.forEach(walk);
      receipt.audit.after.forEach(walk);
      if (unsupported) return false;
      for (const pointer of new Set(pointers)) {
        const field =
            /^track-c\/field-evidence\/([0-9a-f-]{36})\/([A-Za-z0-9._:-]+)$/.exec(
              pointer,
            ),
          pub = /^otr-core\/source-publication\/([0-9a-f-]{36})\/([0-9a-f]{64})$/.exec(
            pointer,
          ),
          reg = /^otr-core\/airport-registry\/([^/]+)\/([0-9a-f]{64})$/.exec(pointer);
        if (field) {
          const row = (
            await lease.query(
              "SELECT c.candidate_json FROM public.trip_source_core_v2_candidates c JOIN public.trip_sources src ON src.id=c.source_id WHERE c.candidate_id=$1::uuid AND c.account_id=$2::uuid AND c.trip_id=$3::uuid AND src.acquired_by=$2::uuid AND src.lifecycle='ACTIVE' AND src.retention_state='RETAINED'",
              [field[1], actor.accountId, actor.tripId],
            )
          ).rows[0];
          if (!row) return false;
          const body = sealedCoreFlightCandidateSchema.parse(row.candidate_json),
            e = body.fieldEvidence[field[2]];
          if (!e || e.ref !== pointer) return false;
          const rep = (
            await lease.query(
              "SELECT rep.id FROM public.trip_source_representations rep JOIN public.trip_source_revisions rev ON rev.source_id=rep.source_id AND rev.material_revision=$4 WHERE rep.id=$1::uuid AND rep.source_id=$2::uuid AND rep.payload_sha256=$3 AND rep.retention_state='RETAINED' AND rev.retention_state='RETAINED'",
              [e.representationId, e.sourceId, e.payloadSha256, e.sourceRevision],
            )
          ).rows[0];
          if (!rep) return false;
        } else if (pub) {
          const row = (
            await lease.query(
              "SELECT p.publication_id FROM public.trip_source_core_v2_publications p JOIN public.trip_sources src ON src.id=p.source_id WHERE p.publication_id=$1::uuid AND p.request_sha256=$2 AND p.account_id=$3::uuid AND p.trip_id=$4::uuid AND src.acquired_by=$3::uuid AND src.lifecycle='ACTIVE' AND src.retention_state='RETAINED'",
              [pub[1], pub[2], actor.accountId, actor.tripId],
            )
          ).rows[0];
          if (!row) return false;
        } else if (reg) {
          const rows = (
            await lease.query(
              "SELECT c.candidate_json FROM public.trip_source_core_v2_candidates c JOIN public.trip_sources src ON src.id=c.source_id WHERE c.account_id=$1::uuid AND c.trip_id=$2::uuid AND src.acquired_by=$1::uuid AND src.lifecycle='ACTIVE' AND src.retention_state='RETAINED' LIMIT 4097",
              [actor.accountId, actor.tripId],
            )
          ).rows;
          if (
            rows.length > 4096 ||
            !rows.some((r) =>
              sealedCoreFlightCandidateSchema
                .parse(r.candidate_json)
                .airportBindings.some(
                  (a) =>
                    encodeURIComponent(a.registryVersion) === reg[1] &&
                    a.registrySha256 === reg[2],
                ),
            )
          )
            return false;
        } else return false;
      }
      return true;
    });
  return {
    source,
    publish,
    verifySourceIntent,
    canReadSourceReceipt,
    canReadAudit,
    audit,
  };
}
