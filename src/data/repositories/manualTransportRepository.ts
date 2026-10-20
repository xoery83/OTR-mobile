import { z } from "zod";
import { createUuid } from "@/domain/localId";
import {
  coreDefaults,
  coreParticipationSchema,
  corePlaceSchema,
  coreUuid,
  itinerary_transport_servicesSchema,
} from "@/domain/trip/tripCoreV2";
import {
  coreDateBoundary,
  coreStoredBoundary,
  type CoreBoundary,
} from "@/domain/trip/tripCoreV2Temporal";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  applyCoreCommand,
  coreCanManage,
  type CoreRow,
} from "@/domain/trip/tripCoreV2Mutation";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { readLocalManualSnapshotWithinTransaction } from "./tripLocalManualReadRepository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
const json = (value: unknown) => canonicalCoreJson(value as Json);
export const manualTransportTypeSchema = z.enum([
  "TRAIN",
  "BUS",
  "FERRY",
  "WATER_TAXI",
  "SHUTTLE",
  "TRANSFER",
]);
const clockField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const manualTransportFieldsSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    transportType: manualTransportTypeSchema,
    departureDate: z.string(),
    departureTime: clockField,
    departureLocation: z.string().trim().min(1).max(500),
    arrivalDate: z.string().nullable(),
    arrivalTime: clockField,
    arrivalLocation: z.string().trim().max(500).nullable(),
    description: z.string().max(5000).nullable(),
    participation: coreParticipationSchema,
  })
  .superRefine((fields, ctx) => {
    try {
      validateCalendarDate(fields.departureDate);
      if (fields.arrivalDate !== null) validateCalendarDate(fields.arrivalDate);
    } catch {
      ctx.addIssue({ code: "custom", message: "TRANSPORT_DATE_INVALID" });
    }
  });
export type ManualTransportFields = z.infer<typeof manualTransportFieldsSchema>;
export type ManualTransportDraft = Readonly<{
  mode: "CREATE" | "EDIT";
  itemId: string;
  fields: ManualTransportFields;
  participantOptions: readonly { personId: string; displayName: string }[];
}>;
export type ManualTransportSaveResult = Readonly<{
  localStatus: "PENDING";
  itemId: string;
  operationIds: readonly string[];
}>;
type Core = ReturnType<typeof createTripCoreV2Repository>;
type Snapshot = NonNullable<
  Awaited<ReturnType<typeof readLocalManualSnapshotWithinTransaction>>
>;
type Command = ReturnType<typeof validateCoreCommand>;
type State = {
  context: AccountRequestContext;
  fingerprint: string;
  actor: string;
  revision: number | null;
  original: ManualTransportFields;
  ids: string[];
  serviceKey: string;
  attempt?: { fields: string; commands: Command[] };
};
const serviceSchema = itinerary_transport_servicesSchema.omit({
  event_id: true,
  trip_id: true,
});
const emptyPlace = () =>
  corePlaceSchema.parse(
    Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, null])),
  );
function endpoint(snapshot: Snapshot, itemId: string, role: "ORIGIN" | "DESTINATION") {
  const row = snapshot.graph.itinerary_transport_endpoints.find(
    (r) => r.event_id === itemId && r.role === role,
  );
  if (!row) throw new Error("MANUAL_TRANSPORT_UNAVAILABLE");
  return row;
}
function serviceFor(snapshot: Snapshot, itemId: string) {
  const rows = snapshot.graph.itinerary_transport_services.filter(
    (r) => r.event_id === itemId,
  );
  if (rows.length !== 1) throw new Error("MANUAL_TRANSPORT_UNAVAILABLE");
  return serviceSchema.parse(
    Object.fromEntries(
      Object.keys(serviceSchema.shape).map((key) => [key, rows[0][key]]),
    ),
  );
}
const label = (row: CoreRow) =>
  row.authored_label ??
  row.authored_text ??
  row.authored_address ??
  row.accepted_address ??
  null;
function fieldsFor(snapshot: Snapshot, itemId: string): ManualTransportFields {
  const row = snapshot.graph.itinerary_events.find((r) => r.id === itemId)!;
  const origin = endpoint(snapshot, itemId, "ORIGIN"),
    destination = endpoint(snapshot, itemId, "DESTINATION");
  const minute = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  return manualTransportFieldsSchema.parse({
    title: row.title,
    transportType: serviceFor(snapshot, itemId).transport_subtype,
    departureDate: origin.local_date,
    departureTime: minute(origin.local_time),
    departureLocation: label(origin),
    arrivalDate: destination.local_date,
    arrivalTime: minute(destination.local_time),
    arrivalLocation: label(destination),
    description: row.description,
    participation: {
      mode: row.participation_mode,
      people: snapshot.graph.trip_item_participants
        .filter((p) => p.item_id === itemId && p.active)
        .map((p) => p.person_id)
        .sort(),
      selfPersonId: row.self_person_id,
    },
  });
}
function editable(snapshot: Snapshot, itemId: string, accountId: string) {
  const row = snapshot.graph.itinerary_events.find((r) => r.id === itemId);
  if (
    !row ||
    !snapshot.predictedIds.has(itemId) ||
    row.experience_family !== "P5" ||
    row.owner_account_id !== accountId ||
    row.hidden_at !== null ||
    row.status === "cancelled" ||
    !coreCanManage(snapshot.graph, snapshot.actor, "ITEM", row)
  )
    throw new Error("MANUAL_TRANSPORT_UNAVAILABLE");
  return row;
}
const authoredTime = (
  date: string | null,
  time: string | null,
  zone: string | null = null,
): CoreBoundary => ({
  ...coreDateBoundary(date ?? "2000-01-01"),
  local_date: date,
  local_time: time,
  clock_precision: time ? -1 : null,
  quality: time ? "ESTIMATED" : "UNKNOWN",
  zone_id: zone,
});
export function createManualTransportRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock = () => new Date().toISOString(),
  newId = createUuid,
) {
  const drafts = new WeakMap<ManualTransportDraft, State>();
  async function current(context: AccountRequestContext) {
    const snapshot = await readLocalManualSnapshotWithinTransaction(
      database,
      account,
      core,
      context,
      await core.readAcceptedSnapshotWithinTransaction(context),
    );
    if (!snapshot) throw new Error("MANUAL_TRANSPORT_UNAVAILABLE");
    return snapshot;
  }
  async function open(tripId: string, itemId?: string): Promise<ManualTransportDraft> {
    coreUuid.parse(tripId);
    if (itemId) coreUuid.parse(itemId);
    const context = await core.captureContext(tripId);
    return withAccountApplyGate(async () => {
      let draft!: ManualTransportDraft;
      await database.withTransactionAsync(async () => {
        const snapshot = await current(context),
          row = itemId ? editable(snapshot, itemId, context.accountId) : null;
        if (
          row &&
          !(await core.pending(context)).some(
            (p) =>
              snapshot.operations.some((o) => o.operationId === p.command.operationId) &&
              p.command.target.id === itemId &&
              p.command.command === "CREATE_ITEM" &&
              p.command.admission.mode === "MANUAL",
          )
        )
          throw new Error("MANUAL_TRANSPORT_UNAVAILABLE");
        const fields: ManualTransportFields = itemId
          ? fieldsFor(snapshot, itemId)
          : {
              title: "",
              transportType: "TRAIN",
              departureDate: "",
              departureTime: null,
              departureLocation: "",
              arrivalDate: null,
              arrivalTime: null,
              arrivalLocation: null,
              description: null,
              participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
            };
        const members = await database.getAllAsync<{ id: string; display_name: string }>(
          "SELECT id,display_name FROM ledger_members WHERE journey_id=? AND status IN ('local','linked') ORDER BY id",
          tripId,
        );
        draft = Object.freeze({
          mode: itemId ? "EDIT" : "CREATE",
          itemId: itemId ?? newId(),
          fields: structuredClone(fields),
          participantOptions: members
            .filter((m) => snapshot.actor.personIds.includes(m.id))
            .map((m) => ({ personId: m.id, displayName: m.display_name })),
        });
        drafts.set(draft, {
          context,
          fingerprint: snapshot.fingerprint,
          actor: json(snapshot.actor),
          revision: row ? (row.semantic_revision as number) : null,
          original: structuredClone(fields),
          ids: Array.from({ length: 3 }, () => newId()),
          serviceKey: itemId
            ? serviceFor(snapshot, itemId).service_key
            : newId().replace(/-/g, ""),
        });
        await assertAccountRequestContext(context, account);
      });
      await assertAccountRequestContext(context, account);
      return draft;
    });
  }
  return {
    createDraft: (tripId: string) => open(tripId),
    read: (tripId: string, itemId: string) => open(tripId, itemId),
    async save(
      draft: ManualTransportDraft,
      input: ManualTransportFields,
    ): Promise<ManualTransportSaveResult> {
      const retained = drafts.get(draft);
      if (!retained) throw new Error("MANUAL_TRANSPORT_DRAFT_UNAVAILABLE");
      const state = retained;
      const fields = manualTransportFieldsSchema.parse(input);
      fields.arrivalLocation = fields.arrivalLocation || null;
      fields.participation.people.sort();
      const fieldsText = json(fields);
      if (state.attempt && state.attempt.fields !== fieldsText)
        throw new Error("MANUAL_TRANSPORT_DRAFT_FROZEN");
      return core.commitManualBatch(state.context, async () => {
        if (state.attempt && state.attempt.fields !== fieldsText)
          throw new Error("MANUAL_TRANSPORT_DRAFT_FROZEN");
        const snapshot = await current(state.context);
        if (json(snapshot.actor) !== state.actor)
          throw new Error("MANUAL_TRANSPORT_SCOPE_CHANGED");
        const row =
          draft.mode === "EDIT"
            ? editable(snapshot, draft.itemId, state.context.accountId)
            : null;
        const prior = state.attempt?.commands;
        if (prior?.length) {
          const rows = await database.getAllAsync<{
            operation_id: string;
            canonical_intent_text: string;
          }>(
            "SELECT operation_id,canonical_intent_text FROM trip_core_pending_intents WHERE account_id=? AND trip_id=?",
            state.context.accountId,
            state.context.tripId,
          );
          const found = prior.map((c) =>
            rows.find((r) => r.operation_id === c.operationId),
          );
          if (found.some(Boolean)) {
            if (
              !found.every(
                (r, i) =>
                  r?.canonical_intent_text === json(prior[i]) &&
                  snapshot.operations.some((o) => o.operationId === r.operation_id),
              )
            )
              throw new Error("MANUAL_TRANSPORT_RETRY_MISMATCH");
            editable(snapshot, draft.itemId, state.context.accountId);
            return {
              commands: [],
              result: async () => ({
                localStatus: "PENDING" as const,
                itemId: draft.itemId,
                operationIds: prior.map((c) => c.operationId),
              }),
            };
          }
        }
        if (
          snapshot.fingerprint !== state.fingerprint ||
          (row && row.semantic_revision !== state.revision)
        )
          throw new Error("MANUAL_TRANSPORT_CONFLICT");
        const payloads: { command: string; payload: unknown }[] = [];
        function makeEndpoint(role: "ORIGIN" | "DESTINATION") {
          const departure = role === "ORIGIN",
            date = departure ? fields.departureDate : fields.arrivalDate,
            time = departure ? fields.departureTime : fields.arrivalTime,
            location = departure ? fields.departureLocation : fields.arrivalLocation;
          const oldDate = departure
              ? state.original.departureDate
              : state.original.arrivalDate,
            oldTime = departure
              ? state.original.departureTime
              : state.original.arrivalTime,
            oldLocation = departure
              ? state.original.departureLocation
              : state.original.arrivalLocation;
          const old = row ? endpoint(snapshot, draft.itemId, role) : null;
          let boundary = authoredTime(
            date,
            time,
            (old?.zone_id as string | null) ?? null,
          );
          if (old && date === oldDate && time === oldTime)
            boundary = coreStoredBoundary(old);
          else if (old && time === oldTime) {
            boundary.local_time = old.local_time as string | null;
            boundary.clock_precision = old.clock_precision as number | null;
          }
          const place =
            old && location === oldLocation
              ? corePlaceSchema.parse(
                  Object.fromEntries(
                    Object.keys(corePlaceSchema.shape).map((key) => [
                      key,
                      old[key] ?? null,
                    ]),
                  ),
                )
              : { ...emptyPlace(), authored_label: location };
          return { time: boundary, place };
        }
        const storedService = row
          ? serviceFor(snapshot, draft.itemId)
          : {
              service_key: state.serviceKey,
              transport_subtype: fields.transportType,
              attribution: "UNSPECIFIED" as const,
              operator_namespace: "NAME" as const,
              operator_issuer: "",
              operator_value: "",
              operator_literal: "",
              service_number: "",
              service_literal: "",
              codeshare_operating_key: null,
            };
        const service = { ...storedService, transport_subtype: fields.transportType };
        if (draft.mode === "CREATE")
          payloads.push({
            command: "CREATE_ITEM",
            payload: {
              family: "P5",
              core: { title: fields.title, description: fields.description },
              endpoints: {
                origin: makeEndpoint("ORIGIN"),
                destination: makeEndpoint("DESTINATION"),
              },
              service,
              participation: fields.participation,
              acl: coreDefaults("organizer").acl,
            },
          });
        else {
          if (
            fields.title !== state.original.title ||
            fields.description !== state.original.description
          )
            payloads.push({
              command: "SET_ITEM_TEXT",
              payload: { title: fields.title, description: fields.description },
            });
          const endpointsChanged = (
            [
              "departureDate",
              "departureTime",
              "departureLocation",
              "arrivalDate",
              "arrivalTime",
              "arrivalLocation",
            ] as const
          ).some((key) => fields[key] !== state.original[key]);
          if (endpointsChanged || fields.transportType !== state.original.transportType)
            payloads.push({
              command: "SET_TRANSPORT_DETAILS",
              payload: {
                ...(endpointsChanged
                  ? {
                      endpoints: {
                        origin: makeEndpoint("ORIGIN"),
                        destination: makeEndpoint("DESTINATION"),
                      },
                    }
                  : {}),
                ...(fields.transportType !== state.original.transportType
                  ? { service }
                  : {}),
              },
            });
          if (json(fields.participation) !== json(state.original.participation))
            payloads.push({
              command: "SET_ITEM_PARTICIPATION",
              payload: { participation: fields.participation },
            });
        }
        let graph = snapshot.graph;
        const commands = payloads.map((p, i) => {
          const revision =
            graph.itinerary_events.find((r) => r.id === draft.itemId)
              ?.semantic_revision ?? null;
          const command = validateCoreCommand({
            contractVersion: 2,
            intentVersion: 2,
            operationId: state.ids[i],
            tripId: state.context.tripId,
            command: p.command,
            target: { kind: "ITEM", id: draft.itemId },
            baseVector: [{ kind: "ITEM", id: draft.itemId, revision }],
            admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
            payload: p.payload,
          });
          graph = applyCoreCommand(
            graph,
            command,
            snapshot.actor,
            clock(),
            false,
            undefined,
            true,
          ).graph;
          return command;
        });
        if (state.attempt && json(state.attempt.commands) !== json(commands))
          throw new Error("MANUAL_TRANSPORT_RETRY_MISMATCH");
        state.attempt = { fields: fieldsText, commands };
        return {
          commands,
          result: async () => {
            const projected = await current(state.context);
            editable(projected, draft.itemId, state.context.accountId);
            if (json(fieldsFor(projected, draft.itemId)) !== fieldsText)
              throw new Error("MANUAL_TRANSPORT_PROJECTION_MISMATCH");
            await assertAccountRequestContext(state.context, account);
            return {
              localStatus: "PENDING" as const,
              itemId: draft.itemId,
              operationIds: commands.map((c) => c.operationId),
            };
          },
        };
      });
    },
  };
}
export async function createDefaultManualTransportRepository() {
  const database = await readInitializedDatabase();
  return createManualTransportRepository(
    database,
    requireActiveUserId,
    createTripCoreV2Repository(database, requireActiveUserId, tripCoreSha256Hex),
  );
}
export type ManualTransportRepository = ReturnType<
  typeof createManualTransportRepository
>;
