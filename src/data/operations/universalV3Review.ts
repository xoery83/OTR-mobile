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
  { action: "NEW" } | { action: "LINK" | "UPDATE"; itemId: string; revision: number };

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
          ? text(candidate, "origin.place_label")
          : text(
              candidate,
              "place.authored_label",
              "activity.location",
              "activity.venue",
            );
  const endPlace = text(candidate, "return.place", "destination.place_label");
  return { title, start, end, startTime, endTime, place, endPlace };
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
}) {
  const { model, candidate, decision, snapshot, capabilities } = input;
  const { actor, graph } = snapshot;
  if (
    actor.accountId !== model.batch.accountId ||
    !actor.active ||
    actor.tripId !== (model.batch.context.tripPrior?.id ?? model.assignedTripId) ||
    capabilities.activationState !== "ENABLED" ||
    !capabilities.enabledAdmissionModes.includes("MANUAL")
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
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
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
            title: (file.originalFilename?.trim() || input.candidate.subtype).slice(
              0,
              256,
            ),
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
  if (commands.some((command) => !isNormalManualCoreCommand(command)))
    throw Error("UNIVERSAL_V3_CORE_UNAVAILABLE");
  return { targetId, commands };
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

export async function openUniversalV3Review(model: CaptureJobReadModel) {
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
  const transport = createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex);
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
    const [itemOutcome, relationOutcome] = await Promise.all([
      outcome(itemOperation),
      outcome(linkOperation),
    ]);
    const verified = await refresh();
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
    actions(candidate: Candidate) {
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
            });
            return true;
          } catch {
            return false;
          }
        })(),
        UPDATE:
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
    async confirm(candidate: Candidate, decision: UniversalV3Decision) {
      const current = await check(candidate);
      if (current !== "UNCONFIRMED") return current;
      const plan = planUniversalV3Review({
        model,
        candidate,
        decision,
        snapshot: await refresh(),
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
