import { z } from "zod";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { coreDefaults, corePlaceSchema } from "../../domain/trip/tripCoreV2";
import {
  coreBoundarySchema,
  coreDateBoundary,
} from "../../domain/trip/tripCoreV2Temporal";
import { coreCanManage } from "../../domain/trip/tripCoreV2Mutation";
import {
  validateCoreCommand,
  type CoreCapabilities,
  coreCapabilitiesSchema,
  isNormalManualCoreCommand,
  isNormalImportCoreCommand,
} from "../../domain/trip/tripCoreV2Commands";
import {
  localImportDocumentId,
  universalP1Identity,
} from "../../domain/trip/universalImportIdentity";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { universalV3Candidate } from "../api/universalV3Contracts";
import { type CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";

type Candidate = z.infer<typeof universalV3Candidate>;
export const universalV3NewDecision = { action: "NEW" } as const;
export type UniversalV3Decision =
  | { action: "NEW" }
  | { action: "LINK"; itemId: string; revision: number }
  | { action: "UPDATE"; itemId: string; revision: number };

export function universalV3LinkDecision(
  itemId: string,
  revision: number,
): UniversalV3Decision {
  return { action: "LINK", itemId, revision };
}

const text = (candidate: Candidate, ...keys: string[]) =>
  keys
    .map((key) => candidate.fields[key])
    .find((value): value is string => typeof value === "string" && !!value.trim())
    ?.trim();
const date = (value?: string) => {
  const parsed = z.iso.date().safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
export function universalV3ReviewFields(candidate: Candidate) {
  const title = text(
    candidate,
    "title",
    "activity.name",
    "property.name",
    "rental.company",
    "agency.name",
    "flight_number",
    "marketing_flight",
    "service.number",
    "service",
  );
  const start = date(
    text(
      candidate,
      "schedule.start.local_date",
      "activity.date",
      "check_in.date",
      "checkin.local_date",
      "pickup.date",
      "origin.local_date",
    ),
  );
  const end = date(
    text(
      candidate,
      "schedule.end.local_date",
      "check_out.date",
      "checkout.local_date",
      "return.date",
      "destination.local_date",
    ),
  );
  const startTime =
    candidate.kind === "P3"
      ? text(candidate, "check_in.time")
      : candidate.kind === "P4"
        ? text(candidate, "pickup.time")
        : candidate.kind === "P2" || candidate.kind === "P5"
          ? text(candidate, "origin.local_time")
          : text(candidate, "schedule.start.local_time", "activity.time");
  const endTime =
    candidate.kind === "P3"
      ? text(candidate, "check_out.time")
      : candidate.kind === "P4"
        ? text(candidate, "return.time")
        : text(candidate, "schedule.end.local_time", "destination.local_time");
  const place =
    candidate.kind === "P3"
      ? text(candidate, "property.address")
      : candidate.kind === "P4"
        ? text(candidate, "pickup.place_label", "pickup.place")
        : candidate.kind === "P2" || candidate.kind === "P5"
          ? text(candidate, "origin.place_label", "origin.airport_code")
          : text(
              candidate,
              "place.authored_label",
              "activity.location",
              "activity.venue",
            );
  const endPlace = text(
    candidate,
    "return.place",
    "destination.place_label",
    "destination.airport_code",
  );
  return { title, start, end, startTime, endTime, place, endPlace };
}

// Only genuinely missing CREATE facts are editable here; existing facts are not overwritten.
export function universalV3MissingFields(candidate: Candidate) {
  const facts = universalV3ReviewFields(candidate);
  const fields: {
    key: string;
    label:
      | "capture.admission.title"
      | "capture.admission.date"
      | "capture.review.endDate"
      | "capture.review.origin"
      | "capture.review.destination"
      | "capture.review.operator"
      | "capture.review.serviceNumber"
      | "capture.review.service";
    kind: "date" | "text";
  }[] = [];
  if (!facts.title)
    fields.push({ key: "title", label: "capture.admission.title", kind: "text" });
  if (
    candidate.kind === "P5" ? !date(text(candidate, "origin.local_date")) : !facts.start
  )
    fields.push({
      key:
        candidate.kind === "P2" || candidate.kind === "P5"
          ? "origin.local_date"
          : "schedule.start.local_date",
      label: "capture.admission.date",
      kind: "date",
    });
  if (candidate.kind === "P3" && !facts.end)
    fields.push({
      key: "schedule.end.local_date",
      label: "capture.review.endDate",
      kind: "date",
    });
  if (candidate.kind === "P5") {
    if (!date(text(candidate, "destination.local_date")))
      fields.push({
        key: "destination.local_date",
        label: "capture.review.endDate",
        kind: "date",
      });
    for (const [key, label] of [
      ["origin.place_label", "capture.review.origin"],
      ["destination.place_label", "capture.review.destination"],
      ["operator.name", "capture.review.operator"],
      ["service.number", "capture.review.serviceNumber"],
      ["service", "capture.review.service"],
    ] as const)
      if (!text(candidate, key, ...(key === "operator.name" ? ["operator"] : [])))
        fields.push({ key, label, kind: "text" });
  }
  return fields;
}
export function completeUniversalV3RequiredFields(
  candidate: Candidate,
  values: Record<string, string>,
) {
  const fields = { ...candidate.fields };
  for (const field of universalV3MissingFields(candidate)) {
    const value = values[field.key]?.trim();
    if (value)
      fields[field.key] = field.kind === "date" ? z.iso.date().parse(value) : value;
  }
  return { ...candidate, fields };
}
// UI projection, not a persisted Review lifecycle. Only the owning read resolves a row.
export function universalV3ReviewStatus(
  observed: import("./universalV3Activity").V3SaveObservation | undefined,
  decisionSaved: boolean,
  confirmed: boolean,
) {
  if (observed === "VERIFIED") return "resolved" as const;
  if (observed === "REVIEW_REQUIRED" || observed === "ITEM_VERIFIED_RELATION_REVIEW")
    return "recheck" as const;
  if (observed === "OUTCOME_UNKNOWN") return "unknown" as const;
  if (observed === "PENDING" || observed === "ITEM_VERIFIED_RELATION_PENDING")
    return "applying" as const;
  if (decisionSaved) return confirmed ? ("waiting" as const) : ("confirmation" as const);
  return "unanswered" as const;
}

// Preserve authored civil facts. No timezone or midnight is inferred.
function boundary(day: string, clock?: string) {
  const value = coreDateBoundary(day);
  if (!clock) return value;
  const precision = /^\d{2}:\d{2}$/.test(clock)
    ? -1
    : (clock.match(/\.(\d{1,6})$/)?.[1].length ?? 0);
  return coreBoundarySchema.parse({
    ...value,
    local_time: clock,
    clock_precision: precision,
    quality: "ESTIMATED",
  });
}
function place(label: string) {
  return corePlaceSchema.parse({
    ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, null])),
    authored_label: label,
  });
}

function transportPayload(candidate: Candidate) {
  const endpoints = Object.fromEntries(
    ["origin", "destination"].map((role) => {
      const day = date(text(candidate, `${role}.local_date`));
      const label = text(candidate, `${role}.place_label`);
      if (!day || !label) throw Error("UNIVERSAL_V3_UNRESOLVED_FIELDS");
      return [
        role,
        {
          time: boundary(day, text(candidate, `${role}.local_time`)),
          place: {
            ...Object.fromEntries(
              Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
            ),
            authored_label: label,
          },
        },
      ];
    }),
  );
  const operator = text(candidate, "operator.name", "operator");
  const number = text(candidate, "service.number");
  const service = text(candidate, "service");
  if (!operator || !number || !service) throw Error("UNIVERSAL_V3_UNRESOLVED_FIELDS");
  return {
    endpoints,
    service: {
      service_key: "primary",
      transport_subtype: candidate.subtype,
      attribution: "UNSPECIFIED",
      operator_namespace: "NAME",
      operator_issuer: "",
      operator_value: operator,
      operator_literal: operator,
      service_number: number,
      service_literal: service,
      codeshare_operating_key: null,
    },
  };
}

const relationId = (candidateId: string) =>
  universalP1Identity(candidateId, "local-first", "link");
const itemIntentId = (candidateId: string) =>
  universalP1Identity(candidateId, "local-first", "item");
export function planUniversalV3Review(input: {
  model: CaptureJobReadModel;
  candidate: Candidate;
  decision: UniversalV3Decision;
  snapshot: CoreAcceptedSnapshot;
  capabilities: CoreCapabilities;
  admissionMode?: "MANUAL" | "IMPORT";
}) {
  const { model, candidate, decision, snapshot, capabilities } = input;
  const mode = input.admissionMode ?? "MANUAL";
  if (mode === "IMPORT" && decision.action === "UPDATE")
    throw Error("UNIVERSAL_V3_REVIEW_CHANGED");
  const { actor, graph } = snapshot;
  if (
    actor.accountId !== model.batch.accountId ||
    !actor.active ||
    actor.tripId !== (model.batch.context.tripPrior?.id ?? model.assignedTripId) ||
    capabilities.activationState !== "ENABLED" ||
    !capabilities.enabledAdmissionModes.includes(mode)
  )
    throw Error("UNIVERSAL_V3_CORE_UNAVAILABLE");
  const ids = [...new Set(candidate.documentIds)].sort();
  const originals = new Map(
    model.inputs.flatMap((file) => {
      if (!file.contentSha256 || !file.contentByteCount || file.state !== "ACCEPTED")
        return [];
      const id = localImportDocumentId(actor.accountId, actor.tripId, file.contentSha256);
      return [[id, file] as const];
    }),
  );
  const base = {
    contractVersion: 2,
    intentVersion: 2,
    tripId: actor.tripId,
    admission: { mode, sourceIntentId: null, policyVersion: null },
  };
  const selected =
    decision.action === "NEW"
      ? null
      : graph.itinerary_events.find(({ id }) => id === decision.itemId);
  if (
    decision.action !== "NEW" &&
    (!selected ||
      selected.owner_account_id !== actor.accountId ||
      !coreCanManage(graph, actor, "ITEM", selected) ||
      selected.experience_family !== candidate.kind ||
      selected.semantic_revision !== decision.revision)
  )
    throw Error("UNIVERSAL_V3_REVIEW_CHANGED");
  const targetId =
    decision.action === "NEW"
      ? universalP1Identity(candidate.candidateId, "local-first", "created-item")
      : decision.itemId;
  const commands: ReturnType<typeof validateCoreCommand>[] = [];
  let revision = selected ? Number(selected.semantic_revision) : 1;
  const enabled = (name: "CREATE_ITEM" | "CREATE_SPARSE_FLIGHT" | "SET_ITEM_TEXT") =>
    capabilities.enabledCommands.includes(name) &&
    capabilities.enabledFamilies.includes(candidate.kind);
  const {
    title,
    start,
    end,
    startTime,
    endTime,
    place: location,
    endPlace,
  } = universalV3ReviewFields(candidate);
  if (decision.action === "NEW") {
    const flight = candidate.kind === "P2";
    if (!actor.personId) throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
    const defaults = coreDefaults("member");
    const owned = {
      ...defaults,
      participation: { ...defaults.participation, selfPersonId: actor.personId },
    };
    if (
      !title ||
      !start ||
      !enabled(flight ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM") ||
      (candidate.kind === "P3" && (!end || end < start))
    )
      throw Error("UNIVERSAL_V3_UNRESOLVED_FIELDS");
    commands.push(
      validateCoreCommand({
        ...base,
        operationId: itemIntentId(candidate.candidateId),
        command: flight ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
        target: { kind: "ITEM", id: targetId },
        baseVector: [{ kind: "ITEM", id: targetId, revision: null }],
        payload: flight
          ? {
              flightNumberLiteral: title,
              departureDate: start,
              ...owned,
            }
          : candidate.kind === "P5"
            ? { ...owned, family: "P5", core: { title }, ...transportPayload(candidate) }
            : {
                family: candidate.kind,
                core: { title },
                schedule: {
                  start: boundary(start, startTime),
                  ...(end ? { end: boundary(end, endTime) } : {}),
                },
                ...owned,
                ...(candidate.kind === "P4"
                  ? {
                      ...(location || endPlace
                        ? {
                            places: {
                              ...(location ? { pickup: place(location) } : {}),
                              ...(endPlace ? { return: place(endPlace) } : {}),
                            },
                          }
                        : {}),
                      ...(text(candidate, "rental.company", "agency.name")
                        ? {
                            details: {
                              supplier: text(candidate, "rental.company", "agency.name"),
                              ...(text(candidate, "rental.category")
                                ? {
                                    reserved_category: text(candidate, "rental.category"),
                                  }
                                : {}),
                            },
                          }
                        : {}),
                    }
                  : {
                      ...(location ? { place: place(location) } : {}),
                      ...(candidate.kind === "P3" && text(candidate, "property.name")
                        ? { details: { property_name: text(candidate, "property.name") } }
                        : {}),
                      ...(text(candidate, "activity.description")
                        ? {
                            core: {
                              title,
                              description: text(candidate, "activity.description"),
                            },
                          }
                        : {}),
                    }),
              },
      }),
    );
    if (flight && capabilities.enabledCommands.includes("SET_AUTHORED_FLIGHT_DETAILS")) {
      const departure = date(text(candidate, "origin.local_date")) ?? start;
      const arrival = date(text(candidate, "destination.local_date"));
      commands.push(
        validateCoreCommand({
          ...base,
          operationId: universalP1Identity(
            candidate.candidateId,
            "local-first",
            "flight-details",
          ),
          command: "SET_AUTHORED_FLIGHT_DETAILS",
          target: { kind: "ITEM", id: targetId },
          baseVector: [{ kind: "ITEM", id: targetId, revision }],
          payload: {
            flightNumberLiteral:
              text(candidate, "flight_number", "marketing_flight") ?? title,
            origin: {
              airportCode: text(candidate, "origin.airport_code") ?? null,
              name: text(candidate, "origin.place_label") ?? null,
              terminal: null,
              time: boundary(departure, text(candidate, "origin.local_time")),
            },
            destination: {
              airportCode: text(candidate, "destination.airport_code") ?? null,
              name: text(candidate, "destination.place_label") ?? null,
              terminal: null,
              time: arrival
                ? boundary(arrival, text(candidate, "destination.local_time"))
                : { ...coreDateBoundary(departure), local_date: null },
            },
          },
        }),
      );
      revision++;
    }
  }
  if (decision.action === "UPDATE") {
    if (!title || candidate.kind === "P2" || !enabled("SET_ITEM_TEXT"))
      throw Error("UNIVERSAL_V3_UNRESOLVED_FIELDS");
    if (selected?.title !== title) {
      commands.push(
        validateCoreCommand({
          ...base,
          operationId: itemIntentId(candidate.candidateId),
          command: "SET_ITEM_TEXT",
          target: { kind: "ITEM", id: targetId },
          baseVector: [{ kind: "ITEM", id: targetId, revision }],
          payload: { title },
        }),
      );
      revision++;
    }
  }
  const vector = [{ kind: "ITEM", id: targetId, revision }];
  const add: string[] = [];
  for (const id of ids) {
    const file = originals.get(id);
    if (!file?.contentSha256 || !file.contentByteCount)
      throw Error("UNIVERSAL_V3_DOCUMENT_SCOPE");
    if (
      graph.trip_item_document_links.some(
        (edge) =>
          edge.item_id === targetId && edge.document_id === id && edge.active === true,
      )
    )
      continue;
    const mediaType = file.kind === "TEXT" ? "text/plain" : file.declaredContentType;
    if (!mediaType) throw Error("UNIVERSAL_V3_DOCUMENT_SCOPE");
    const document = graph.trip_operational_documents.find((row) => row.id === id);
    if (document) {
      if (
        document.owner_account_id !== actor.accountId ||
        document.custody !== "LOCAL_ONLY" ||
        document.sha256 !== file.contentSha256 ||
        document.byte_size !== file.contentByteCount ||
        document.media_type !== mediaType
      )
        throw Error("UNIVERSAL_V3_DOCUMENT_SCOPE");
    } else {
      commands.push(
        validateCoreCommand({
          ...base,
          operationId: universalP1Identity(id, "local-first", "document-metadata"),
          command: "CREATE_DOCUMENT_METADATA",
          target: { kind: "DOCUMENT", id },
          baseVector: [{ kind: "DOCUMENT", id, revision: null }],
          payload: {
            title: (file.originalFilename?.trim() || mediaType).slice(0, 256),
            media_type: mediaType,
            byte_size: file.contentByteCount,
            sha256: file.contentSha256,
          },
        }),
      );
    }
    vector.push({
      kind: "DOCUMENT",
      id,
      revision: document ? Number(document.revision) : 1,
    });
    add.push(id);
  }
  if (add.length)
    commands.push(
      validateCoreCommand({
        ...base,
        operationId: relationId(candidate.candidateId),
        command: "RECONCILE_ITEM_DOCUMENTS",
        target: { kind: "ITEM", id: targetId },
        baseVector: vector.sort(
          (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
        ),
        payload: { add, remove: [] },
      }),
    );
  if (
    commands.some(
      (command) =>
        !isNormalManualCoreCommand(command) && !isNormalImportCoreCommand(command),
    )
  )
    throw Error("UNIVERSAL_V3_CORE_UNAVAILABLE");
  return { targetId, commands };
}

export type V3AdmissionRow = {
  candidate: Candidate;
  members: string[];
  disposition: "NEW" | "LINK" | "REVIEW" | "ABSTAIN";
  decision?: UniversalV3Decision;
  reason?: "missing" | "ambiguous" | "conflict" | "unsupported";
};
const normalizeIdentity = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "");
function importIdentity(candidate: Candidate) {
  const reference = text(
    candidate,
    "confirmation_code",
    "booking.reference",
    "booking.confirmation_code",
  );
  const provider = text(
    candidate,
    "provider",
    "booking.provider",
    "property.name",
    "rental.company",
    "operator.name",
  );
  if (reference && provider)
    return `booking:${candidate.kind}:${normalizeIdentity(provider)}:${normalizeIdentity(reference)}`;
  const number = text(candidate, "flight_number", "marketing_flight");
  const origin = text(candidate, "origin.airport_code");
  const destination = text(candidate, "destination.airport_code");
  const day = date(text(candidate, "origin.local_date"));
  return candidate.kind === "P2" && number && origin && destination && day
    ? `flight:${normalizeIdentity(number)}:${normalizeIdentity(origin)}:${normalizeIdentity(destination)}:${day}`
    : undefined;
}

// Business identity is a supplier reference or complete flight tuple, never proximity.
export function planUniversalV3Batch(input: {
  model: CaptureJobReadModel;
  candidates: Candidate[];
  snapshot: CoreAcceptedSnapshot;
  capabilities: CoreCapabilities;
}): V3AdmissionRow[] {
  const {
    snapshot: { graph, actor },
  } = input;
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of [...input.candidates].sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  )) {
    const key = importIdentity(candidate) ?? candidate.candidateId;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  return [...grouped.values()].map((group) => {
    const fields: Candidate["fields"] = {};
    let conflicting = false;
    for (const candidate of group)
      for (const [key, value] of Object.entries(candidate.fields)) {
        if (
          fields[key] !== undefined &&
          JSON.stringify(fields[key]) !== JSON.stringify(value)
        )
          conflicting = true;
        else fields[key] = value;
      }
    const candidate = {
      ...group[0],
      fields,
      documentIds: [...new Set(group.flatMap((c) => c.documentIds))].sort(),
    };
    const row = { candidate, members: group.map((c) => c.candidateId) };
    if (!Object.values(fields).some((value) => value !== null && value !== ""))
      return { ...row, disposition: "ABSTAIN" };
    if (conflicting) return { ...row, disposition: "REVIEW", reason: "conflict" };
    const identity = importIdentity(candidate);
    const accessible = graph.itinerary_events.filter(
      (item) =>
        item.experience_family === candidate.kind &&
        item.owner_account_id === actor.accountId &&
        coreCanManage(graph, actor, "ITEM", item),
    );
    const matches = accessible.filter((item) => {
      if (!identity) return false;
      if (identity.startsWith("booking:"))
        return graph.trip_booking_item_links.some(
          (link) =>
            link.active &&
            link.item_id === item.id &&
            graph.itinerary_reservations.some(
              (booking) =>
                booking.id === link.booking_id &&
                !booking.hidden_at &&
                booking.commercial_status === "ACTIVE" &&
                booking.provider &&
                booking.confirmation_code &&
                identity ===
                  `booking:${candidate.kind}:${normalizeIdentity(String(booking.provider))}:${normalizeIdentity(String(booking.confirmation_code))}`,
            ),
        );
      const flight = graph.trip_flight_intents.find((f) => f.event_id === item.id);
      const endpoints = graph.itinerary_transport_endpoints.filter(
        (e) => e.event_id === item.id,
      );
      const origin = endpoints.find((e) => e.role === "ORIGIN");
      const destination = endpoints.find((e) => e.role === "DESTINATION");
      return (
        !!flight &&
        !!origin &&
        !!destination &&
        identity ===
          `flight:${normalizeIdentity(String(flight.flight_number_literal))}:${normalizeIdentity(String(graph.trip_endpoint_details.find((e) => e.event_id === item.id && e.role === "ORIGIN")?.airport_code ?? ""))}:${normalizeIdentity(String(graph.trip_endpoint_details.find((e) => e.event_id === item.id && e.role === "DESTINATION")?.airport_code ?? ""))}:${origin.local_date}`
      );
    });
    const { title, start } = universalV3ReviewFields(candidate);
    const near =
      !identity &&
      title &&
      accessible.some(
        (item) =>
          String(item.title).trim().toLocaleLowerCase() === title.toLocaleLowerCase() &&
          (!start || !item.start_local_date || item.start_local_date === start),
      );
    const duplicate =
      !identity &&
      input.candidates.some(
        (other) =>
          other.candidateId !== candidate.candidateId &&
          other.kind === candidate.kind &&
          universalV3ReviewFields(other).title?.toLocaleLowerCase() ===
            title?.toLocaleLowerCase() &&
          (!start ||
            !universalV3ReviewFields(other).start ||
            universalV3ReviewFields(other).start === start),
      );
    if (matches.length > 1 || near || duplicate)
      return { ...row, disposition: "REVIEW", reason: "ambiguous" };
    if (matches.length === 1) {
      const facts = universalV3ReviewFields(candidate),
        item = matches[0];
      if (
        (facts.start && item.start_local_date && facts.start !== item.start_local_date) ||
        (facts.end && item.end_local_date && facts.end !== item.end_local_date) ||
        (facts.startTime &&
          item.start_local_time &&
          facts.startTime !== item.start_local_time) ||
        (facts.endTime && item.end_local_time && facts.endTime !== item.end_local_time)
      )
        return { ...row, disposition: "REVIEW", reason: "conflict" };
    }
    const decision: UniversalV3Decision = matches.length
      ? {
          action: "LINK",
          itemId: String(matches[0].id),
          revision: Number(matches[0].semantic_revision),
        }
      : universalV3NewDecision;
    try {
      planUniversalV3Review({ ...input, candidate, decision, admissionMode: "IMPORT" });
      return { ...row, disposition: decision.action as "NEW" | "LINK", decision };
    } catch (error) {
      return {
        ...row,
        disposition: "REVIEW",
        reason: String(error).includes("UNRESOLVED") ? "missing" : "unsupported",
      };
    }
  });
}

type Outcome = "APPLIED" | "NO_CHANGE" | "CONFLICT" | "REJECTED";
export function projectUniversalV3SaveState(input: {
  itemOutcome: Outcome | null | undefined;
  relationOutcome: Outcome | null | undefined;
  itemReadback: boolean;
  relationReadback: boolean;
}) {
  const terminalFailure = (value?: Outcome | null) =>
    value === "CONFLICT" || value === "REJECTED";
  if (terminalFailure(input.itemOutcome)) return "REVIEW_REQUIRED" as const;
  if (input.itemOutcome === null || !input.itemReadback) return "PENDING" as const;
  if (terminalFailure(input.relationOutcome))
    return input.itemOutcome
      ? ("ITEM_VERIFIED_RELATION_REVIEW" as const)
      : ("REVIEW_REQUIRED" as const);
  if (input.relationOutcome !== null && input.relationReadback)
    return "VERIFIED" as const;
  return input.itemOutcome
    ? ("ITEM_VERIFIED_RELATION_PENDING" as const)
    : ("PENDING" as const);
}

const applyingBatches = new Map<
  string,
  Promise<Record<string, import("./universalV3Activity").V3SaveObservation>>
>();
// Receiving a ready result hands the whole confirmed plan to the existing queue.
// Dismissing Activity must not abort halfway through independently eligible rows.
export function applyUniversalV3Batch(
  model: CaptureJobReadModel,
  owner: Awaited<ReturnType<typeof openUniversalV3Review>>,
  rows: V3AdmissionRow[],
  intent: import("../repositories/importSubmissionRepository").ImportSubmission | null,
  unknown: ReadonlySet<string>,
) {
  const key = `${model.batch.accountId}:${model.batch.batchId}:${intent?.confirmed}:${JSON.stringify(intent?.resolutions ?? {})}`;
  const existing = applyingBatches.get(key);
  if (existing) return existing;
  const work = (async () => {
    const { getAccountGeneration } = await import("../auth/accountGeneration");
    const generation = getAccountGeneration();
    if (
      intent &&
      (intent.accountId !== model.batch.accountId ||
        intent.batchId !== model.batch.batchId ||
        intent.tripId !== (model.batch.context.tripPrior?.id ?? model.assignedTripId))
    )
      throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
    const observations: Record<
      string,
      import("./universalV3Activity").V3SaveObservation
    > = {};
    for (const row of rows) {
      if (generation !== getAccountGeneration())
        throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
      const resolution = intent?.resolutions[row.candidate.candidateId];
      const candidate = resolution?.candidate ?? row.candidate;
      let observed = await owner.check(candidate);
      const decision = resolution?.decision ?? row.decision;
      if (
        intent?.confirmed &&
        decision &&
        observed === "UNCONFIRMED" &&
        !unknown.has(candidate.candidateId)
      ) {
        try {
          observed = resolution?.manual
            ? await owner.confirm(candidate, decision, true)
            : await owner.confirm(candidate, decision);
        } catch {
          observed = "REVIEW_REQUIRED";
        }
      }
      observations[candidate.candidateId] =
        observed !== "VERIFIED" && unknown.has(candidate.candidateId)
          ? "OUTCOME_UNKNOWN"
          : observed;
    }
    return observations;
  })();
  applyingBatches.set(key, work);
  void work
    .finally(() => {
      if (applyingBatches.get(key) === work) applyingBatches.delete(key);
    })
    .catch(() => undefined);
  return work;
}

export async function openUniversalV3Review(
  model: CaptureJobReadModel,
  admissionMode: "MANUAL" | "IMPORT" = "MANUAL",
) {
  const [
    { requireAdoptedUserId },
    { createCoreV2Transport },
    { readInitializedDatabase },
    { createTripCoreV2Repository },
    { tripCoreSha256Hex },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("../api/tripCoreV2Transport"),
    import("../db/database"),
    import("../repositories/tripCoreV2Repository"),
    import("../repositories/tripCoreSha256"),
  ]);
  const trip = model.batch.context.tripPrior?.id ?? model.assignedTripId;
  if (!trip) throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
  const context = await captureAccountRequestContext(trip, requireAdoptedUserId);
  if (context.accountId !== model.batch.accountId)
    throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
  const core = createTripCoreV2Repository(
    await readInitializedDatabase(),
    requireAdoptedUserId,
    tripCoreSha256Hex,
  );
  // Match the normal Core coordinator read budget; the generic 15 s budget is too short.
  const transport = createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex, {
    timeoutMs: 60_000,
  });
  const refresh = async () => {
    await core.refresh(context, transport);
    const snapshot = await core.acceptedSnapshot(context);
    if (!snapshot) throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
    return snapshot;
  };
  const capabilities = coreCapabilitiesSchema.parse(
    await transport.capabilities(context),
  );
  const accepted = await refresh();
  async function check(candidate: Candidate) {
    const [item, link, flight] = await Promise.all([
      core.pending(context, itemIntentId(candidate.candidateId)),
      core.pending(context, relationId(candidate.candidateId)),
      core.pending(
        context,
        universalP1Identity(candidate.candidateId, "local-first", "flight-details"),
      ),
    ]);
    const itemOperation = item.find(
      ({ command }) => command.operationId === itemIntentId(candidate.candidateId),
    );
    const linkOperation = link.find(
      ({ command }) => command.operationId === relationId(candidate.candidateId),
    );
    const original = linkOperation ?? itemOperation;
    if (!original) return "UNCONFIRMED" as const;
    const outcome = async (operation: typeof original | undefined) => {
      if (!operation) return undefined;
      const retained =
        admissionMode === "IMPORT"
          ? await core.retainedReceipt(context, operation.command)
          : null;
      if (retained) return retained.outcome;
      const receipt = await transport.receipt(context, operation.command.operationId);
      return receipt
        ? receipt.projection === "FULL"
          ? receipt.receipt.outcome
          : receipt.outcome
        : null;
    };
    const flightOperation = flight.find(
      ({ command }) =>
        command.command === "SET_AUTHORED_FLIGHT_DETAILS" &&
        command.target.id === original.command.target.id,
    );
    if (flightOperation) {
      const state = await outcome(flightOperation);
      if (state === null) return "PENDING" as const;
      if (state === "CONFLICT" || state === "REJECTED") return "REVIEW_REQUIRED" as const;
    }
    // The owning Core PG role has a single connection; parallel GETs self-collide.
    const itemOutcome = await outcome(itemOperation);
    const relationOutcome = await outcome(linkOperation);
    const verified =
      admissionMode === "IMPORT"
        ? ((await core.acceptedSnapshot(context)) ?? accepted)
        : await refresh();
    const target = original.command.target.id;
    return projectUniversalV3SaveState({
      itemOutcome,
      relationOutcome,
      itemReadback: verified.graph.itinerary_events.some(({ id }) => id === target),
      relationReadback: candidate.documentIds.every((id) =>
        verified.graph.trip_item_document_links.some(
          (edge) =>
            edge.item_id === target && edge.document_id === id && edge.active === true,
        ),
      ),
    });
  }
  return {
    batch(candidates: Candidate[]) {
      return planUniversalV3Batch({
        model,
        candidates,
        snapshot: accepted,
        capabilities,
      });
    },
    actions(candidate: Candidate, manual = false) {
      const { title } = universalV3ReviewFields(candidate);
      const supported = capabilities.enabledFamilies.includes(candidate.kind);
      const flight = candidate.kind === "P2";
      return {
        flightDetails:
          flight && capabilities.enabledCommands.includes("SET_AUTHORED_FLIGHT_DETAILS"),
        NEW: (() => {
          try {
            planUniversalV3Review({
              model,
              candidate,
              snapshot: accepted,
              capabilities,
              decision: universalV3NewDecision,
              admissionMode: manual ? "MANUAL" : admissionMode,
            });
            return true;
          } catch {
            return false;
          }
        })(),
        UPDATE:
          admissionMode === "MANUAL" &&
          !!title &&
          !flight &&
          supported &&
          capabilities.enabledCommands.includes("SET_ITEM_TEXT"),
      };
    },
    targets(candidate: Candidate) {
      return accepted.graph.itinerary_events
        .filter(
          (row) =>
            row.owner_account_id === accepted.actor.accountId &&
            row.experience_family === candidate.kind &&
            coreCanManage(accepted.graph, accepted.actor, "ITEM", row),
        )
        .map((row) => ({
          id: String(row.id),
          title: String(row.title),
          revision: Number(row.semantic_revision),
        }));
    },
    check,
    async resultOperations(candidates: Candidate[]) {
      const operations: import("./universalV3Activity").V3ResultOperation[] = [];
      const identities = new Map(
        candidates.flatMap((candidate) =>
          [
            itemIntentId(candidate.candidateId),
            relationId(candidate.candidateId),
            universalP1Identity(candidate.candidateId, "local-first", "flight-details"),
          ].map((id) => [id, candidate] as const),
        ),
      );
      for (const [id, candidate] of identities) {
        const operation = (await core.pending(context, id)).find(
          (row) => row.command.operationId === id,
        );
        if (!operation || operation.command.target.kind !== "ITEM") continue;
        operations.push({
          candidateId: candidate.candidateId,
          documentIds: candidate.documentIds,
          command: operation.command,
          receipt: await core.retainedReceipt(context, operation.command),
        });
      }
      return { snapshot: (await core.acceptedSnapshot(context)) ?? accepted, operations };
    },
    async confirm(candidate: Candidate, decision: UniversalV3Decision, manual = false) {
      if (manual && decision.action !== "NEW") throw Error("UNIVERSAL_V3_REVIEW_CHANGED");
      const current = await check(candidate);
      if (current !== "UNCONFIRMED") return current;
      const plan = planUniversalV3Review({
        model,
        candidate,
        decision,
        admissionMode: manual ? "MANUAL" : admissionMode,
        snapshot:
          admissionMode === "IMPORT"
            ? ((await core.acceptedSnapshot(context)) ?? accepted)
            : await refresh(),
        capabilities,
      });
      if (!plan.commands.length) return "VERIFIED" as const;
      if (plan.commands.at(-1)?.command === "RECONCILE_ITEM_DOCUMENTS")
        await core.enqueueConfirmedItemDocuments(context, plan.commands);
      else await core.enqueue(context, plan.commands[0]);
      return "PENDING" as const;
    },
  };
}
