import { z } from "zod";
import { instantMicroseconds } from "@/domain/trip/dayReadModel";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  flightCommandLeaves,
  flightServicesSchema,
  type FlightValues,
  type FlightEndpoint,
} from "@/domain/trip/flightAdmission";
import {
  flightReviewSchema,
  flightInputSchema,
  flightConfirmationIntentSchema,
  resolveReviewedFlightSelection,
  validateReviewedFlightCommand,
  importDigest,
  type ImportHash,
  type FlightConfirmationIntent,
} from "@/domain/trip/flightImportReview";
import {
  assessFlightCandidateSet,
  flightClosureInputSetSchema,
  flightDeferredReview,
  occurrenceFields,
  type FlightClosureInputSet,
  type ClosureContext,
  type FlightBaseline,
  type FlightClosurePlan,
} from "@/domain/trip/flightImportClosure";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import type { createTripImportAdmissionRepository } from "./tripImportAdmissionRepository";
import type { createTripCanonicalEventRepository } from "./tripCanonicalEventRepository";

type Admission = ReturnType<typeof createTripImportAdmissionRepository>;
type Events = ReturnType<typeof createTripCanonicalEventRepository>;
const json = (v: unknown) => canonicalEventJson(v as Json);
// Explicit and unwired: no transport, worker, scheduler or capability activation.
export function createFlightImportClosureOrchestrator(
  admission: Admission,
  events: Events,
  getAccountId: () => Promise<string>,
  sha256: ImportHash,
) {
  async function baseline(
    context: AccountRequestContext,
    eventId: string,
  ): Promise<FlightBaseline | null> {
    const read = await events.getEvent(context.tripId, eventId);
    await assertAccountRequestContext(context, getAccountId);
    if (
      !read ||
      read.context.accountId !== context.accountId ||
      read.context.generation !== context.generation ||
      read.data.disposition !== "READ_ONLY"
    )
      return null;
    const event = read.data.event;
    if (
      event.temporal_shape !== "TRANSPORT" ||
      event.event_type !== "transport" ||
      event.participant_scope !== "UNASSIGNED"
    )
      return null;
    const rows = await admission.readServices(context, eventId);
    const serviceParse = flightServicesSchema.safeParse(
      rows.map((r) =>
        Object.fromEntries(
          Object.keys(flightServicesSchema.element.shape).map((k) => [k, r[k]]),
        ),
      ),
    );
    if (!serviceParse.success) return null;
    const services = serviceParse.data;
    const retainedProofs: Record<string, string> = {};
    const endpoints = Object.fromEntries(
      event.itinerary_transport_endpoints.map((e) => {
        const refs = { ...e.provenance_refs, ...e.spatial_provenance_refs };
        for (const [k, v] of Object.entries(refs)) retainedProofs[`${e.role}.${k}`] = v;
        // Read precision -1 is stored as HH:mm:00; command input is HH:mm.
        const endpoint: FlightEndpoint = {
          time: {
            local_date: e.local_date,
            local_time:
              e.clock_precision === -1
                ? (e.local_time?.slice(0, 5) ?? null)
                : e.local_time,
            clock_precision: e.clock_precision,
            quality: e.quality!,
            basis: e.basis!,
            zone_id: e.zone_id,
            supplied_offset_seconds: e.supplied_offset_seconds,
            source_instant: e.source_instant,
            source_instant_precision: e.source_instant_precision,
            fold_choice: null,
          },
          location: {
            authored_label: e.authored_label,
            authored_text: e.authored_text,
            accepted_place_id: e.accepted_place_id,
          },
        };
        return [e.role === "ORIGIN" ? "origin" : "destination", endpoint];
      }),
    );
    for (const row of rows) {
      if (row.semantic_revision !== event.semantic_revision)
        throw new Error("STALE_BASE_REVISION");
      for (const [k, v] of Object.entries(
        parseEventJson(row.provenance_refs as string) as Record<string, string>,
      ))
        retainedProofs[`SERVICE.${row.service_key}.${k}`] = v;
    }
    return {
      eventId,
      semanticRevision: event.semantic_revision,
      values: { title: event.title, ...endpoints, services },
      retainedProofs,
    };
  }
  async function assess(
    context: AccountRequestContext,
    set: FlightClosureInputSet,
    supplied: Record<
      string,
      Omit<ClosureContext, "baselines" | "claims" | "lineageComplete">
    >,
    ownSlot?: string,
  ) {
    await assertAccountRequestContext(context, getAccountId);
    if (set.account_id !== context.accountId || set.trip_id !== context.tripId)
      throw new Error("IMPORT_SCOPE_MISMATCH");
    set = flightClosureInputSetSchema.parse(set);
    if (new TextEncoder().encode(json(set)).length > 4194304)
      throw new Error("IMPORT_RESOURCE_LIMIT");
    const contexts: Record<string, ClosureContext> = {};
    const failures = new Map<string, string>();
    // Per-candidate failures remain an explicit unresolved plan; siblings continue.
    for (const candidate of set.candidates) {
      const settings = supplied[candidate.id];
      if (!settings) throw new Error("MISSING_CANDIDATE_CONTEXT");
      try {
        const evidence = await admission.readClosureEvidence(context, candidate.id);
        if (
          evidence.candidate.run_id !== candidate.run_id ||
          evidence.candidate.proposal_sha256 !== candidate.proposal_sha256 ||
          evidence.candidate.input_sha256 !== candidate.input_sha256
        )
          throw new Error("INPUT_STALE");
        const proposal = parseEventJson(evidence.candidate.proposal as string) as {
          fields: Record<string, { proposed_value: Json; input_ids: string[] }>;
        };
        if (
          (await importDigest(
            "otr-source-candidate-v1",
            proposal as unknown as Json,
            sha256,
          )) !== candidate.proposal_sha256 ||
          Object.keys(proposal.fields)
            .filter((k) =>
              ["transport_subtype", ...occurrenceFields].includes(k as never),
            )
            .some((k) => !Object.hasOwn(candidate.fields, k)) ||
          Object.entries(candidate.fields).some(
            ([k, v]) =>
              json((proposal.fields[k] as { locators?: Json[] })?.locators ?? []) !==
                json(v.locators) ||
              json(proposal.fields[k]?.proposed_value ?? null) !==
                json(v.proposed_value) ||
              json([...(proposal.fields[k]?.input_ids ?? [])].sort()) !==
                json([...v.input_ids].sort()),
          )
        )
          throw new Error("INPUT_STALE");
        const pins = evidence.inputs.map((row) =>
          flightInputSchema.parse(
            Object.fromEntries(
              Object.keys(flightInputSchema.shape).map((k) => [
                k,
                k === "historical_selection" ? row[k] === 1 : row[k],
              ]),
            ),
          ),
        );
        if (json(pins) !== json([...set.inputs].sort((a, b) => a.id.localeCompare(b.id))))
          throw new Error("INPUT_STALE");
        const claims = evidence.claims
          .filter((p) => p.slot_id !== ownSlot)
          .map((p) => ({
            candidateId: p.candidate_id as string,
            related: p.lineage_related as boolean,
            slotKey: p.slot_key as string,
            slotId: p.slot_id as string,
            outcome:
              p.receipt_sha256 === null ? ("UNKNOWN" as const) : ("SUCCESS" as const),
            targetId: p.result_target_id as string | null,
            resultRevision: p.result_revision as number | null,
          }));
        const ids = new Set([
          ...settings.scope.occurrences.map((o) => o.eventId),
          ...claims.flatMap((p) => (p.targetId ? [p.targetId] : [])),
        ]);
        const baselines: FlightBaseline[] = [];
        for (const id of ids) {
          const b = await baseline(context, id);
          if (b) baselines.push(b);
        }
        contexts[candidate.id] = {
          ...settings,
          baselines,
          claims,
          lineageComplete: settings.scope.lineageComplete,
        };
      } catch (error) {
        await assertAccountRequestContext(context, getAccountId);
        const reason =
          error instanceof Error ? error.message : "INVALID_TYPED_OBSERVATION";
        if (
          ![
            "INPUT_STALE",
            "STALE_BASE_REVISION",
            "CANONICAL_EVENT_MIRROR_INTEGRITY",
          ].includes(reason)
        )
          throw error;
        failures.set(candidate.id, reason);
        contexts[candidate.id] = {
          ...settings,
          baselines: [],
          claims: [],
          lineageComplete: false,
        };
      }
    }
    await assertAccountRequestContext(context, getAccountId);
    const result = assessFlightCandidateSet(set, contexts);
    for (const plan of result.plans) {
      const reason = failures.get(plan.candidate.id);
      if (reason) {
        if (plan.closure === "READY") {
          result.progress.ready_count--;
          result.progress.review_count++;
        }
        plan.closure = "NEEDS_REVIEW";
        plan.occurrence = "NONE";
        plan.reasons.push(reason);
      }
    }
    // Count the final states, including individually stale Candidates.
    result.progress.review_count = result.plans.filter(
      (p) => p.closure === "NEEDS_REVIEW",
    ).length;
    result.progress.incomplete_count = result.plans.filter(
      (p) => p.closure === "INCOMPLETE",
    ).length;
    result.progress.waiting_network_count = result.plans.filter(
      (p) => p.closure === "WAITING_FOR_NETWORK",
    ).length;
    result.progress.waiting_enrichment_count = result.plans.filter(
      (p) => p.closure === "WAITING_FOR_ENRICHMENT",
    ).length;
    result.progress.conflict_count = result.plans.filter(
      (p) => p.closure === "CONFLICT",
    ).length;
    return result;
  }
  async function prepare(
    context: AccountRequestContext,
    set: FlightClosureInputSet,
    supplied: Parameters<typeof assess>[2],
    selection: {
      candidateId: string;
      disposition: "ACCEPT" | "REJECT" | "DEFER";
      confirmationId: string;
      confirmationKey: string;
      slotId: string;
      inputIds: Record<string, string>;
      operationKey: string | null;
      intendedEventId: string | null;
      review: z.infer<typeof flightReviewSchema>;
      reviewedCandidateHash: string;
      reviewedBaseRevision: number | null;
    },
  ) {
    // Snapshot caller-owned inputs before asynchronous validation.
    const pinnedSet = structuredClone(set),
      pinnedSelection = structuredClone(selection),
      pinnedScope = structuredClone(supplied);
    const assessed = await assess(
      context,
      pinnedSet,
      pinnedScope,
      pinnedSelection.slotId,
    );
    const plan = assessed.plans.find(
      (p) => p.candidate.id === pinnedSelection.candidateId,
    );
    if (
      !plan ||
      plan.reasons.includes("INPUT_STALE") ||
      plan.candidate.proposal_sha256 !== pinnedSelection.reviewedCandidateHash
    )
      throw new Error("INPUT_STALE");
    if ((plan.target?.semanticRevision ?? null) !== pinnedSelection.reviewedBaseRevision)
      throw new Error("STALE_BASE_REVISION");
    const prepared = await buildFlightReviewIntent(
      context,
      pinnedSet,
      plan,
      pinnedSelection,
      sha256,
    );
    await admission.prepare(context, json(prepared.intent));
    // Only durable C preparation is queued. Domain execution is a later explicit CP13A action.
    return prepared;
  }
  return {
    assess,
    prepare,
    saveDraft: admission.saveDraft,
    readDraft: admission.readDraft,
  };
}

export async function buildFlightReviewIntent(
  context: AccountRequestContext,
  set: FlightClosureInputSet,
  plan: FlightClosurePlan,
  selection: {
    disposition: "ACCEPT" | "REJECT" | "DEFER";
    confirmationId: string;
    confirmationKey: string;
    slotId: string;
    inputIds: Record<string, string>;
    operationKey: string | null;
    intendedEventId: string | null;
    review: z.infer<typeof flightReviewSchema>;
  },
  sha256: ImportHash,
) {
  const review = flightReviewSchema.parse(selection.review);
  const deferred = flightDeferredReview(plan.candidate);
  if (deferred.some((d) => !review.deferred_dimensions.some((r) => json(r) === json(d))))
    throw new Error("MISSING_DEFERRED_DIMENSION");
  const safeOccurrenceAfterDefer =
    plan.closure === "NEEDS_REVIEW" &&
    plan.candidate.entity_resolution === "RESOLVED" &&
    !plan.candidate.ambiguity.length &&
    plan.reasons.every((r) => r === "UNRESOLVED_IDENTITY_OR_AMBIGUITY") &&
    (plan.outcome === "NEW_ITEM" || plan.changes.length > 0);
  const executable =
    selection.disposition === "ACCEPT" &&
    (plan.occurrence !== "NONE" || safeOccurrenceAfterDefer);
  if (
    selection.disposition === "ACCEPT" &&
    plan.closure !== "READY" &&
    plan.closure !== "UNSUPPORTED" &&
    !safeOccurrenceAfterDefer
  )
    throw new Error("CLOSURE_REVIEW_REQUIRED");
  const expected = plan.selected_components.filter(
    (field) =>
      !(
        plan.target &&
        review.deferred_dimensions.some(
          (d) => d.dimension === field && d.candidate_field_key === field,
        )
      ),
  );

  if (
    executable &&
    (review.selected_fields.length !== expected.length ||
      expected.some((k) => !review.selected_fields.includes(k)))
  )
    throw new Error("INCOMPLETE_SELECTED_SUPPORT");
  if (!executable && review.selected_fields.length)
    throw new Error("NON_EXECUTABLE_SELECTION");
  const disposition =
    selection.disposition === "REJECT"
      ? "REJECT"
      : !executable
        ? "DEFER"
        : plan.outcome === "NEW_ITEM"
          ? "CREATE"
          : "UPDATE";
  const slot: FlightConfirmationIntent["slots"][number] = {
    slot_id: selection.slotId,
    slot_key: plan.candidate.output_purpose,
    disposition,
    reviewed_run_id: plan.candidate.run_id,
    candidate_id: plan.candidate.id,
    intended_target_kind: executable ? "ITINERARY_EVENT" : null,
    intended_target_id: executable
      ? (plan.target?.eventId ?? selection.intendedEventId)
      : null,
    base_revision: executable ? (plan.target?.semanticRevision ?? null) : null,
    adapter_key: executable ? "itinerary-event-v1" : null,
    adapter_version: executable ? 1 : null,
    domain_operation_key: executable ? selection.operationKey : null,
    domain_intent_sha256: null,
    reviewed_payload: review,
    support_version: 1,
    support_payload: {},
  };
  let command: Json | null = null;
  if (executable) {
    if (!selection.operationKey || !slot.intended_target_id)
      throw new Error("MISSING_OPERATION_IDENTITY");
    for (const field of review.selected_fields) {
      const extracted =
        plan.candidate.fields[field as keyof typeof plan.candidate.fields];
      const edited = Object.hasOwn(review.edits, field);
      slot.support_payload[field] = {
        origin: extracted
          ? edited
            ? "EDITED_EXTRACTED"
            : "ACCEPTED_EXTRACTED"
          : "USER_ENTERED",
        candidate_id: extracted ? plan.candidate.id : null,
        candidate_field_key: extracted
          ? (field as (typeof occurrenceFields)[number])
          : null,
        input_ids: extracted ? [...extracted.input_ids].sort() : [],
        accepted_value_ref: `otr-event/receipt/${context.tripId}/${context.accountId}/${selection.operationKey}/slot/${selection.slotId}/${field}`,
        edited_value: extracted && edited ? review.edits[field] : null,
        ...(extracted ? { locators: extracted.locators } : {}),
      };
    }
    const resolved = resolveReviewedFlightSelection(slot, plan.candidate.fields);
    const values = resolved.components as FlightValues;
    // Review edits cannot silently alter the occurrence anchor used for matching.
    for (const field of ["origin", "destination"] as const) {
      const before = plan.candidate.fields[field]
        ?.proposed_value as unknown as FlightValues[typeof field];
      const after = values[field];
      if (
        before &&
        after &&
        (json(before.location) !== json(after.location) ||
          (field === "origin" && before.time.local_date !== after.time.local_date))
      )
        throw new Error("MATCH_REASSESSMENT_REQUIRED");
    }
    if (
      values.services &&
      json(values.services) !== json(plan.candidate.fields.services?.proposed_value)
    )
      throw new Error("MATCH_REASSESSMENT_REQUIRED");
    const effective = { ...plan.target?.values, ...values };
    const departure = effective.origin?.time.source_instant,
      arrival = effective.destination?.time.source_instant;
    if (
      departure &&
      arrival &&
      instantMicroseconds(arrival) < instantMicroseconds(departure)
    )
      throw new Error("ARRIVAL_BEFORE_DEPARTURE");
    if (plan.target) {
      const previous = flightCommandLeaves(plan.target.values, true);
      const changed = Object.entries(flightCommandLeaves(values, true)).some(
        ([k, v]) =>
          previous[k] !== undefined &&
          previous[k] !== null &&
          !(
            typeof previous[k] === "object" &&
            !Array.isArray(previous[k]) &&
            previous[k]?.value === null
          ) &&
          json(previous[k]) !== json(v),
      );
      if (
        changed &&
        (plan.candidate.continuity?.targetId !== plan.target.eventId ||
          plan.candidate.continuity.semanticRevision !== plan.target.semanticRevision)
      )
        throw new Error("SUPERSESSION_REVIEW_REQUIRED");
    }
    const leaves = flightCommandLeaves(values),
      previous = plan.target ? flightCommandLeaves(plan.target.values) : {};
    const proofs = Object.fromEntries(
      Object.entries(leaves).map(([k, v]) => {
        if (plan.target && Object.hasOwn(previous, k) && json(previous[k]) === json(v)) {
          const ref = plan.target.retainedProofs[k];
          if (!ref) throw new Error("RETAINED_PROOF_UNAVAILABLE");
          return [k, { kind: "RETAINED", ref }];
        }
        return [
          k,
          { kind: "TRACK_C", ref: `track-c/field-evidence/${selection.slotId}/${k}` },
        ];
      }),
    );
    const payload =
      disposition === "CREATE"
        ? {
            shape: "TRANSPORT",
            eventType: "TRANSPORT",
            subtype: "FLIGHT",
            participantScope: "UNASSIGNED",
            core: { title: values.title },
            origin: values.origin,
            destination: values.destination,
            services: values.services,
            proofs,
          }
        : { changes: values, proofs };
    const commandName =
      disposition === "CREATE" ? "CREATE_TRANSPORT" : "UPDATE_TRANSPORT";
    validateReviewedFlightCommand(slot, plan.candidate.fields, commandName, payload);
    command = {
      contractVersion: 1,
      intentVersion: 1,
      commandVersion: 1,
      command: commandName,
      operationKey: selection.operationKey,
      actorAccountId: context.accountId,
      tripId: context.tripId,
      eventId: slot.intended_target_id,
      baseSemanticRevision: slot.base_revision,
      payload,
    } as unknown as Json;
    slot.domain_intent_sha256 = await sha256(
      new TextEncoder().encode(
        json({ ...(command as object), encoding: "otr-event-intent-v1" }),
      ),
    );
  }
  // Confirmation pins have their own IDs; preserve exact Run pin identity and
  // rewrite only the reviewed support/locator references, never Candidate identity.
  const mapInput = (id: string) => {
    const mapped = selection.inputIds[id];
    if (!mapped || mapped === id) throw new Error("MISSING_CONFIRMATION_INPUT_ID");
    return z.uuid().parse(mapped);
  };
  const inputs = set.inputs.map((p) => ({ ...p, id: mapInput(p.id) }));
  for (const support of Object.values(slot.support_payload)) {
    support.input_ids = support.input_ids.map(mapInput).sort();
    support.locators = support.locators?.map((l) => ({
      ...l,
      input_id: mapInput(l.input_id),
    }));
  }
  review.association_intents = review.association_intents.map((a) => ({
    ...a,
    input_id: mapInput(a.input_id),
  }));
  review.deferred_dimensions = review.deferred_dimensions.map((d) =>
    d.input_id === null
      ? d
      : {
          ...d,
          input_id: mapInput(d.input_id),
          locator: d.locator
            ? { ...d.locator, input_id: mapInput(d.locator.input_id) }
            : null,
        },
  );
  const intent = flightConfirmationIntentSchema.parse({
    id: selection.confirmationId,
    confirmation_key: selection.confirmationKey,
    intent_version: 1,
    inputs,
    slots: [slot],
    lineage_dispositions: plan.candidate.lineage.map((l) => ({
      ...l,
      slot_id: slot.slot_id,
    })),
    dependencies: [],
  });
  return { intent, command };
}
