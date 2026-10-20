import { z } from "zod";
import { createUuid } from "@/domain/localId";
import {
  coreDefaults,
  coreParticipationSchema,
  corePlaceSchema,
  coreUuid,
} from "@/domain/trip/tripCoreV2";
import {
  coreDateBoundary,
  coreStoredBoundary,
  type CoreBoundary,
} from "@/domain/trip/tripCoreV2Temporal";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { applyCoreCommand, coreCanManage } from "@/domain/trip/tripCoreV2Mutation";
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
const minute = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const manualPlanFieldsSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    startDate: z.string(),
    startTime: minute,
    endDate: z.string().nullable(),
    endTime: minute,
    location: z.string().trim().max(500).nullable(),
    description: z.string().max(5000).nullable(),
    participation: coreParticipationSchema,
  })
  .superRefine((v, c) => {
    try {
      validateCalendarDate(v.startDate);
      if (v.endDate) validateCalendarDate(v.endDate);
      if (
        (v.endTime && !v.endDate) ||
        (v.endDate && v.endDate < v.startDate) ||
        (v.endDate === v.startDate && v.startTime && v.endTime && v.endTime < v.startTime)
      )
        throw new Error("PLAN_RANGE_INVALID");
    } catch {
      c.addIssue({ code: "custom", message: "PLAN_DATE_INVALID" });
    }
  });
export type ManualPlanFields = z.infer<typeof manualPlanFieldsSchema>;
export const manualStayDetailsSchema = z.strictObject({
  propertyName: z.string().max(500).nullable(),
  permittedCheckinFrom: minute,
  permittedCheckinUntil: minute,
  permittedCheckoutBy: minute,
});
export const manualStayFieldsSchema = manualPlanFieldsSchema.safeExtend({
  endDate: z.string().min(1),
  stayDetails: manualStayDetailsSchema,
});
export type ManualStayFields = z.infer<typeof manualStayFieldsSchema>;
type ManualItemFields = ManualPlanFields & {
  stayDetails?: ManualStayFields["stayDetails"];
};

export type ManualPlanDraft = Readonly<{
  mode: "CREATE" | "EDIT";
  itemId: string;
  fields: ManualPlanFields;
  participantOptions: readonly { personId: string; displayName: string }[];
}>;
export type ManualPlanSaveResult = Readonly<{
  localStatus: "PENDING";
  itemId: string;
  operationIds: readonly string[];
}>;
type Core = ReturnType<typeof createTripCoreV2Repository>;
type Snapshot = NonNullable<
  Awaited<ReturnType<typeof readLocalManualSnapshotWithinTransaction>>
>;
type Command = ReturnType<typeof validateCoreCommand>;
type ManualItemDraft<F extends ManualPlanFields = ManualItemFields> = Omit<
  ManualPlanDraft,
  "fields"
> &
  Readonly<{ fields: F }>;
type ManualItemRepository<F extends ManualPlanFields> = {
  createDraft(tripId: string): Promise<ManualItemDraft<F>>;
  read(tripId: string, itemId: string): Promise<ManualItemDraft<F>>;
  save(draft: ManualItemDraft<F>, fields: F): Promise<ManualPlanSaveResult>;
};
type DraftState = {
  context: AccountRequestContext;
  fingerprint: string;
  actor: string;
  revision: number | null;
  original: ManualItemFields;
  ids: string[];
  attempt?: { fields: string; commands: Command[] };
};
function fieldsFor(
  row: Record<string, unknown>,
  snapshot: Snapshot,
  family: "P1" | "P3",
): ManualItemFields {
  const stay = snapshot.graph.trip_stay_details.find((r) => r.event_id === row.id);
  const clockLabel = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  return (family === "P3" ? manualStayFieldsSchema : manualPlanFieldsSchema).parse({
    title: row.title,
    ...(family === "P3"
      ? {
          stayDetails: {
            propertyName: stay?.property_name ?? null,
            permittedCheckinFrom: clockLabel(stay?.permitted_checkin_from),
            permittedCheckinUntil: clockLabel(stay?.permitted_checkin_until),
            permittedCheckoutBy: clockLabel(stay?.permitted_checkout_by),
          },
        }
      : {}),
    startDate: row.start_local_date,
    startTime:
      typeof row.start_local_time === "string" ? row.start_local_time.slice(0, 5) : null,
    endDate: row.end_local_date,
    endTime:
      typeof row.end_local_time === "string" ? row.end_local_time.slice(0, 5) : null,
    location: row.authored_label ?? row.authored_text ?? row.authored_address ?? null,
    description: row.description,
    participation: {
      mode: row.participation_mode,
      people: snapshot.graph.trip_item_participants
        .filter((p) => p.item_id === row.id && p.active)
        .map((p) => p.person_id)
        .sort(),
      selfPersonId: row.self_person_id,
    },
  });
}
function editable(
  snapshot: Snapshot,
  itemId: string,
  accountId: string,
  family: "P1" | "P3",
) {
  const row = snapshot.graph.itinerary_events.find((r) => r.id === itemId);
  if (
    !row ||
    !snapshot.predictedIds.has(itemId) ||
    row.experience_family !== family ||
    row.owner_account_id !== accountId ||
    row.hidden_at !== null ||
    row.status === "cancelled" ||
    !coreCanManage(snapshot.graph, snapshot.actor, "ITEM", row)
  )
    throw new Error("MANUAL_PLAN_UNAVAILABLE");
  return row;
}
const authoredBoundary = (
  date: string | null,
  time: string | null,
  zone: string | null = null,
): CoreBoundary => ({
  ...coreDateBoundary(date ?? "2000-01-01"),
  local_date: date,
  local_time: time,
  clock_precision: time ? -1 : null,
  quality: time ? ("ESTIMATED" as const) : ("UNKNOWN" as const),
  zone_id: zone,
});

// Two finite Forms share the already-qualified transaction and opaque retry boundary.
export function createManualItemRepository(
  family: "P1",
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock?: () => string,
  newId?: () => string,
): ManualItemRepository<ManualPlanFields>;
export function createManualItemRepository(
  family: "P3",
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock?: () => string,
  newId?: () => string,
): ManualItemRepository<ManualStayFields>;
export function createManualItemRepository(
  family: "P1" | "P3",
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock = () => new Date().toISOString(),
  newId = createUuid,
) {
  const drafts = new WeakMap<ManualItemDraft, DraftState>();
  async function current(context: AccountRequestContext) {
    const accepted = await core.readAcceptedSnapshotWithinTransaction(context);
    const snapshot = await readLocalManualSnapshotWithinTransaction(
      database,
      account,
      core,
      context,
      accepted,
    );
    if (!snapshot) throw new Error("MANUAL_PLAN_UNAVAILABLE");
    return snapshot;
  }
  async function open(tripId: string, itemId?: string): Promise<ManualItemDraft> {
    coreUuid.parse(tripId);
    if (itemId) coreUuid.parse(itemId);
    const context = await core.captureContext(tripId);
    return withAccountApplyGate(async () => {
      let draft!: ManualItemDraft;
      await database.withTransactionAsync(async () => {
        const snapshot = await current(context);
        const row = itemId ? editable(snapshot, itemId, context.accountId, family) : null;
        // Exact MANUAL CREATE provenance is retained independently from accepted facts.
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
          throw new Error("MANUAL_PLAN_UNAVAILABLE");
        const fields: ManualItemFields = row
          ? fieldsFor(row, snapshot, family)
          : {
              title: "",
              startDate: "",
              startTime: null,
              endDate: family === "P3" ? "" : null,
              ...(family === "P3"
                ? {
                    stayDetails: {
                      propertyName: null,
                      permittedCheckinFrom: null,
                      permittedCheckinUntil: null,
                      permittedCheckoutBy: null,
                    },
                  }
                : {}),
              endTime: null,
              location: null,
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
          ids: Array.from({ length: family === "P3" ? 5 : 4 }, () => newId()),
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
      draft: ManualItemDraft,
      input: ManualItemFields,
    ): Promise<ManualPlanSaveResult> {
      const state = drafts.get(draft);
      if (!state) throw new Error("MANUAL_PLAN_DRAFT_UNAVAILABLE");
      const fields: ManualItemFields = (
        family === "P3" ? manualStayFieldsSchema : manualPlanFieldsSchema
      ).parse(input);
      fields.participation.people.sort();
      fields.location = fields.location || null;
      const fieldsText = json(fields);
      if (state.attempt && state.attempt.fields !== fieldsText)
        throw new Error("MANUAL_PLAN_DRAFT_FROZEN");
      return core.commitManualBatch(state.context, async () => {
        const snapshot = await current(state.context);
        if (json(snapshot.actor) !== state.actor)
          throw new Error("MANUAL_PLAN_SCOPE_CHANGED");
        if (draft.mode === "EDIT")
          editable(snapshot, draft.itemId, state.context.accountId, family);
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
              throw new Error("MANUAL_PLAN_RETRY_MISMATCH");
            editable(snapshot, draft.itemId, state.context.accountId, family);
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
        if (snapshot.fingerprint !== state.fingerprint)
          throw new Error("MANUAL_PLAN_CONFLICT");
        const row =
          draft.mode === "EDIT"
            ? editable(snapshot, draft.itemId, state.context.accountId, family)
            : null;
        if (row && row.semantic_revision !== state.revision)
          throw new Error("MANUAL_PLAN_CONFLICT");
        const payloads: { command: string; payload: unknown }[] = [];
        const schedule = {
          start: authoredBoundary(
            fields.startDate,
            fields.startTime,
            row?.start_zone_id as string | null,
          ),
          end: authoredBoundary(
            fields.endDate,
            fields.endTime,
            row?.end_zone_id as string | null,
          ),
        };
        const place = corePlaceSchema.parse(
          Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
        );
        place.authored_label = fields.location || null;
        const storedStay = snapshot.graph.trip_stay_details.find(
          (r) => r.event_id === draft.itemId,
        );
        const originalStay = state.original.stayDetails
          ? state.original.stayDetails
          : null;
        const selectedStay = fields.stayDetails;
        const stayDetails = selectedStay
          ? {
              property_name: selectedStay.propertyName,
              ...Object.fromEntries(
                [
                  ["permittedCheckinFrom", "permitted_checkin_from"],
                  ["permittedCheckinUntil", "permitted_checkin_until"],
                  ["permittedCheckoutBy", "permitted_checkout_by"],
                ].map(([key, column]) => [
                  column,
                  originalStay &&
                  selectedStay[key as keyof typeof selectedStay] ===
                    originalStay[key as keyof typeof originalStay]
                    ? (storedStay?.[column] ?? null)
                    : selectedStay[key as keyof typeof selectedStay],
                ]),
              ),
            }
          : undefined;
        if (draft.mode === "CREATE")
          payloads.push({
            command: "CREATE_ITEM",
            payload: {
              family,
              ...(stayDetails ? { details: stayDetails, rooms: [] } : {}),
              core: { title: fields.title, description: fields.description },
              schedule,
              place,
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
          if (
            ["startDate", "startTime", "endDate", "endTime"].some(
              (k) =>
                fields[k as keyof ManualPlanFields] !==
                state.original[k as keyof ManualPlanFields],
            )
          ) {
            // Date changes invalidate resolution, not an unchanged authored clock's precision.
            if (fields.startTime === state.original.startTime) {
              schedule.start.local_time = row!.start_local_time as string | null;
              schedule.start.clock_precision = row!.start_clock_precision as
                number | null;
            }
            if (fields.endTime === state.original.endTime) {
              schedule.end.local_time = row!.end_local_time as string | null;
              schedule.end.clock_precision = row!.end_clock_precision as number | null;
            }
            // Unchanged boundaries retain their original precision/qualification and provenance.
            if (
              fields.startDate === state.original.startDate &&
              fields.startTime === state.original.startTime
            )
              schedule.start = coreStoredBoundary(row!, "start");
            if (
              fields.endDate !== null &&
              fields.endDate === state.original.endDate &&
              fields.endTime === state.original.endTime
            )
              schedule.end = coreStoredBoundary(row!, "end");
            payloads.push({ command: "SET_ITEM_SCHEDULE", payload: { schedule } });
          }
          if (fields.location !== state.original.location)
            payloads.push({ command: "SET_ITEM_PLACE", payload: { place } });
          if (json(fields.participation) !== json(state.original.participation))
            payloads.push({
              command: "SET_ITEM_PARTICIPATION",
              payload: { participation: fields.participation },
            });
        }
        if (
          draft.mode === "EDIT" &&
          fields.stayDetails &&
          json(fields.stayDetails) !== json(originalStay)
        ) {
          payloads.push({
            command: "SET_STAY_DETAILS",
            payload: {
              details: stayDetails,
              rooms: snapshot.graph.trip_stay_rooms
                .filter((r) => r.event_id === draft.itemId)
                .map((r) => ({
                  room_id: r.room_id,
                  category: r.category,
                  quantity: r.quantity,
                  capacity: r.capacity,
                })),
            },
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
          throw new Error("MANUAL_PLAN_RETRY_MISMATCH");
        state.attempt = { fields: fieldsText, commands };
        return {
          commands,
          result: async () => {
            const projected = await current(state.context);
            const saved = editable(
              projected,
              draft.itemId,
              state.context.accountId,
              family,
            );
            if (json(fieldsFor(saved, projected, family)) !== fieldsText)
              throw new Error("MANUAL_PLAN_PROJECTION_MISMATCH");
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
export function createManualPlanRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock?: () => string,
  newId?: () => string,
) {
  return createManualItemRepository("P1", database, account, core, clock, newId);
}
export async function createDefaultManualPlanRepository() {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  return createManualPlanRepository(database, requireActiveUserId, core);
}
export type ManualPlanRepository = ReturnType<typeof createManualPlanRepository>;
