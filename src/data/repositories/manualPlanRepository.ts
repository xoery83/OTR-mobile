import { z } from "zod";
import { createUuid } from "@/domain/localId";
import {
  appleSelectedPlaceDraftSchema,
  type AppleSelectedPlaceDraft,
} from "../places/appleSelectedPlaceDraft";
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
import { validateCoreReceipt } from "@/domain/trip/tripCoreV2Receipt";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
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
import { readLocalTripPersonRosterWithinTransaction } from "./localTripPersonRepository";
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
export const manualRentalDetailsSchema = z.strictObject({
  supplier: z.string().max(500).nullable(),
  reservedCategory: z.string().max(500).nullable(),
  orSimilar: z.boolean().nullable(),
  actualVehicleModel: z.string().max(500).nullable(),
  verifiedPlate: z.string().max(64).nullable(),
});
export const manualRentalFieldsSchema = manualPlanFieldsSchema.safeExtend({
  startTime: minute.unwrap(),
  endDate: z.string().min(1),
  endTime: minute.unwrap(),
  location: z.null(),
  pickupLocation: z.string().trim().min(1).max(500),
  returnLocation: z.string().trim().min(1).max(500),
  rentalDetails: manualRentalDetailsSchema,
});
export type ManualRentalFields = z.infer<typeof manualRentalFieldsSchema>;
// Existing date-only rentals may open an incomplete draft; Save still requires both clocks/places.
const rentalReadFieldsSchema = manualRentalFieldsSchema.safeExtend({
  startTime: z.union([minute.unwrap(), z.literal("")]),
  endTime: z.union([minute.unwrap(), z.literal("")]),
  pickupLocation: z.string().trim().max(500),
  returnLocation: z.string().trim().max(500),
});
export const manualActivityDetailsSchema = z.strictObject({
  sessionLabel: z.string().max(500).nullable(),
  admissionNote: z.string().max(2000).nullable(),
  entryLocation: z.string().trim().max(500).nullable(),
});
export const manualActivityFieldsSchema = manualPlanFieldsSchema.safeExtend({
  activityDetails: manualActivityDetailsSchema,
});
export type ManualActivityFields = z.infer<typeof manualActivityFieldsSchema>;
type ManualItemFields = ManualPlanFields & {
  activityDetails?: ManualActivityFields["activityDetails"];
  stayDetails?: ManualStayFields["stayDetails"];
  pickupLocation?: string;
  returnLocation?: string;
  rentalDetails?: ManualRentalFields["rentalDetails"];
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
export type ManualPlaceAcceptance = Readonly<{
  intent: "ACCEPT_SELECTED_APPLE_PLACE_V1";
  draft: AppleSelectedPlaceDraft;
}>;
const manualPlaceAcceptanceSchema = z.strictObject({
  intent: z.literal("ACCEPT_SELECTED_APPLE_PLACE_V1"),
  draft: appleSelectedPlaceDraftSchema,
});
type ManualItemRepository<F extends ManualPlanFields> = {
  createDraft(tripId: string): Promise<ManualItemDraft<F>>;
  read(
    tripId: string,
    itemId: string,
    expectedRevision?: number,
  ): Promise<ManualItemDraft<F>>;
  save(
    draft: ManualItemDraft<F>,
    fields: F,
    placeDraft?: AppleSelectedPlaceDraft | ManualPlaceAcceptance,
  ): Promise<ManualPlanSaveResult>;
};
type DraftState = {
  context: AccountRequestContext;
  fingerprint: string;
  actor: string;
  revision: number | null;
  original: ManualItemFields;
  ids: string[];
  attempt?: {
    fields: string;
    placeDraft: string;
    place: z.infer<typeof corePlaceSchema>;
    commands: Command[];
  };
};
function fieldsFor(
  row: Record<string, unknown>,
  snapshot: Snapshot,
  family: "P1" | "P3" | "P4" | "P6",
): ManualItemFields {
  const stay = snapshot.graph.trip_stay_details.find((r) => r.event_id === row.id);
  const clockLabel = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  const activity =
    family === "P6"
      ? snapshot.graph.trip_activity_details.find((r) => r.event_id === row.id)
      : undefined;
  const entry =
    family === "P6"
      ? snapshot.graph.trip_activity_entry_places.find((r) => r.event_id === row.id)
      : undefined;
  const rental = snapshot.graph.trip_rental_details.find((r) => r.event_id === row.id);
  const rentalLabel = (role: "PICKUP" | "RETURN") => {
    const place = snapshot.graph.trip_rental_places.find(
      (r) => r.event_id === row.id && r.role === role,
    );
    return (
      place?.authored_label ??
      place?.authored_text ??
      place?.authored_address ??
      place?.accepted_address ??
      ""
    );
  };
  return (
    family === "P4"
      ? rentalReadFieldsSchema
      : family === "P3"
        ? manualStayFieldsSchema
        : family === "P6"
          ? manualActivityFieldsSchema
          : manualPlanFieldsSchema
  ).parse({
    title: row.title,
    ...(family === "P6"
      ? {
          activityDetails: {
            sessionLabel: activity?.session_label ?? null,
            admissionNote: activity?.admission_note ?? null,
            entryLocation:
              entry?.authored_label ??
              entry?.authored_text ??
              entry?.authored_address ??
              entry?.accepted_address ??
              null,
          },
        }
      : {}),
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
    ...(family === "P4"
      ? {
          pickupLocation: rentalLabel("PICKUP"),
          returnLocation: rentalLabel("RETURN"),
          rentalDetails: {
            supplier: rental?.supplier ?? null,
            reservedCategory: rental?.reserved_category ?? null,
            orSimilar: rental?.or_similar ?? null,
            actualVehicleModel: rental?.actual_vehicle_model ?? null,
            verifiedPlate: rental?.verified_plate ?? null,
          },
        }
      : {}),
    startDate: row.start_local_date,
    startTime: clockLabel(row.start_local_time) ?? (family === "P4" ? "" : null),
    endDate: row.end_local_date,
    endTime: clockLabel(row.end_local_time) ?? (family === "P4" ? "" : null),
    location:
      family === "P4"
        ? null
        : (row.authored_label ?? row.authored_text ?? row.authored_address ?? null),
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
  family: "P1" | "P3" | "P4" | "P6",
) {
  const row = snapshot.graph.itinerary_events.find((r) => r.id === itemId);
  if (
    !row ||
    (!snapshot.predictedIds.has(itemId) && !(family === "P1" && snapshot.cert)) ||
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

// Finite Forms share the already-qualified transaction and opaque retry boundary.
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
  family: "P4",
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock?: () => string,
  newId?: () => string,
): ManualItemRepository<ManualRentalFields>;
export function createManualItemRepository(
  family: "P6",
  database: CoreDatabase,
  account: () => Promise<string>,
  core: Core,
  clock?: () => string,
  newId?: () => string,
): ManualItemRepository<ManualActivityFields>;
export function createManualItemRepository(
  family: "P1" | "P3" | "P4" | "P6",
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
  async function acceptedManualCreate(context: AccountRequestContext, itemId: string) {
    const rows = await database.getAllAsync<{
      operation_id: string;
      canonical_intent_text: string;
      intent_sha256: string;
      payload_json: string;
      body_json: string;
      receipt_sha256: string;
    }>(
      `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,op.payload_json,r.body_json,r.receipt_sha256
       FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id
       AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id AND op.entity_id=?
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       AND op.idempotency_key=i.operation_id AND op.id=i.operation_id AND op.status='COMPLETED'
       JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id
       AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
       WHERE i.account_id=? AND i.trip_id=? AND i.state='APPLIED' AND i.reconciled_revision IS NOT NULL`,
      itemId,
      context.accountId,
      context.tripId,
    );
    for (const row of rows) {
      const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
      if (
        command.command !== "CREATE_ITEM" ||
        command.admission.mode !== "MANUAL" ||
        command.target.id !== itemId ||
        command.tripId !== context.tripId ||
        (command.payload as { family?: string }).family !== "P1"
      )
        continue;
      const receipt = await validateCoreReceipt(
        JSON.parse(row.body_json),
        tripCoreSha256Hex,
      );
      if (
        command.operationId === row.operation_id &&
        row.payload_json === row.canonical_intent_text &&
        (await coreHashValue("otr-trip-core-intent-v2", command, tripCoreSha256Hex)) ===
          row.intent_sha256 &&
        receipt.actorAccountId === context.accountId &&
        receipt.tripId === context.tripId &&
        receipt.operationId === command.operationId &&
        receipt.command === "CREATE_ITEM" &&
        receipt.intentSha256 === row.intent_sha256 &&
        receipt.receiptSha256 === row.receipt_sha256 &&
        receipt.outcome === "APPLIED"
      )
        return true;
    }
    return false;
  }
  async function open(
    tripId: string,
    itemId?: string,
    expectedRevision?: number,
  ): Promise<ManualItemDraft> {
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
          expectedRevision !== undefined &&
          row.semantic_revision !== expectedRevision
        )
          throw new Error("MANUAL_PLAN_CONFLICT");
        if (
          row &&
          !(await core.pending(context)).some(
            (p) =>
              snapshot.operations.some((o) => o.operationId === p.command.operationId) &&
              p.command.target.id === itemId &&
              p.command.command === "CREATE_ITEM" &&
              p.command.admission.mode === "MANUAL",
          ) &&
          !(
            family === "P1" &&
            snapshot.cert &&
            (await acceptedManualCreate(context, itemId!))
          )
        )
          throw new Error("MANUAL_PLAN_UNAVAILABLE");
        const fields: ManualItemFields = row
          ? fieldsFor(row, snapshot, family)
          : {
              title: "",
              startDate: "",
              startTime: family === "P4" ? "" : null,
              endDate: family === "P3" || family === "P4" ? "" : null,
              ...(family === "P6"
                ? {
                    activityDetails: {
                      sessionLabel: null,
                      admissionNote: null,
                      entryLocation: null,
                    },
                  }
                : {}),
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
              ...(family === "P4"
                ? {
                    pickupLocation: "",
                    returnLocation: "",
                    rentalDetails: {
                      supplier: null,
                      reservedCategory: null,
                      orSimilar: null,
                      actualVehicleModel: null,
                      verifiedPlate: null,
                    },
                  }
                : {}),
              endTime: family === "P4" ? "" : null,
              location: null,
              description: null,
              participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
            };
        const creator =
          family === "P1"
            ? await database.getFirstAsync<{ create_operation_id: string }>(
                "SELECT create_operation_id FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=? AND authority='LOCAL_CREATOR'",
                context.accountId,
                tripId,
              )
            : null;
        const authoredPersons = creator
          ? await readLocalTripPersonRosterWithinTransaction(
              database,
              context,
              account,
              creator.create_operation_id,
            )
          : [];
        const authoredPersonIds = new Set(
          authoredPersons.map((person) => person.personId),
        );
        const members = await database.getAllAsync<{
          id: string;
          display_name: string;
          status: string;
          participation_active: number | null;
        }>(
          "SELECT id,display_name,status,participation_active FROM ledger_members WHERE journey_id=? AND status IN ('local','linked','unlinked') ORDER BY id",
          tripId,
        );
        draft = Object.freeze({
          mode: itemId ? "EDIT" : "CREATE",
          itemId: itemId ?? newId(),
          fields: structuredClone(fields),
          participantOptions: (family === "P4" ? [] : members)
            .filter(
              (m) =>
                snapshot.actor.personIds.includes(m.id) &&
                (m.status !== "unlinked" ||
                  (family === "P1" &&
                    m.participation_active === 1 &&
                    authoredPersonIds.has(m.id))),
            )
            .map((m) => ({ personId: m.id, displayName: m.display_name })),
        });
        drafts.set(draft, {
          context,
          fingerprint: snapshot.fingerprint,
          actor: json(snapshot.actor),
          revision: row ? (row.semantic_revision as number) : null,
          original: structuredClone(fields),
          ids: Array.from({ length: family === "P3" || family === "P6" ? 5 : 4 }, () =>
            newId(),
          ),
        });
        await assertAccountRequestContext(context, account);
      });
      await assertAccountRequestContext(context, account);
      return draft;
    });
  }
  return {
    createDraft: (tripId: string) => open(tripId),
    read: (tripId: string, itemId: string, expectedRevision?: number) =>
      open(tripId, itemId, expectedRevision),
    async save(
      draft: ManualItemDraft,
      input: ManualItemFields,
      selectedPlaceDraft?: AppleSelectedPlaceDraft | ManualPlaceAcceptance,
    ): Promise<ManualPlanSaveResult> {
      const state = drafts.get(draft);
      if (!state) throw new Error("MANUAL_PLAN_DRAFT_UNAVAILABLE");
      const fields: ManualItemFields = (
        family === "P4"
          ? manualRentalFieldsSchema
          : family === "P3"
            ? manualStayFieldsSchema
            : family === "P6"
              ? manualActivityFieldsSchema
              : manualPlanFieldsSchema
      ).parse(input);
      if (
        family === "P4" &&
        json(fields.participation) !== json(state.original.participation)
      )
        throw new Error("MANUAL_RENTAL_PARTICIPATION_UNAVAILABLE");
      fields.participation.people.sort();
      fields.location = fields.location || null;
      const review =
        selectedPlaceDraft && "intent" in selectedPlaceDraft
          ? manualPlaceAcceptanceSchema.parse(selectedPlaceDraft)
          : null;
      const placeDraft =
        selectedPlaceDraft === undefined
          ? null
          : appleSelectedPlaceDraftSchema.parse(
              review ? review.draft : selectedPlaceDraft,
            );
      if (
        placeDraft &&
        (family !== "P3" ||
          placeDraft.binding.tripId !== state.context.tripId ||
          placeDraft.binding.itemId !== draft.itemId ||
          placeDraft.binding.accountGeneration !== state.context.generation ||
          placeDraft.binding.location !== fields.location)
      )
        throw new Error("MANUAL_PLACE_DRAFT_BINDING");
      const placeDraftText = json({ draft: placeDraft, reviewed: review !== null });
      if (state.attempt && state.attempt.placeDraft !== placeDraftText)
        throw new Error("MANUAL_PLAN_DRAFT_FROZEN");
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
          state.attempt?.place ??
            Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
        );
        place.authored_label = fields.location || null;
        if (placeDraft && !state.attempt?.place) {
          const parts = placeDraft.addressComponents;
          place.authored_address = placeDraft.binding.location;
          place.authored_address_locality = parts?.locality ?? null;
          place.authored_address_region = parts?.administrativeArea ?? null;
          place.authored_address_country = parts?.country ?? null;
          const priorInput = row?.location_input_revision;
          place.location_input_revision =
            typeof priorInput === "number" ? priorInput + 1 : 1;
          place.spatial_provenance_refs = {
            source: "APPLE_USER_SELECTED_DRAFT",
            acceptance: "UNACCEPTED_PROVIDER_DRAFT",
            provider: "apple",
            input_revision: String(place.location_input_revision),
            ...(placeDraft.providerPlaceId
              ? { provider_place_id: placeDraft.providerPlaceId }
              : {}),
            ...(parts?.countryCode ? { provider_country_code: parts.countryCode } : {}),
          };
          if (review) {
            // Explicit reviewed Save at the owning mutation boundary; not provider auto-copy.
            place.accepted_address = placeDraft.binding.location;
            place.accepted_address_locality = parts?.locality ?? null;
            place.accepted_address_region = parts?.administrativeArea ?? null;
            place.accepted_address_country = parts?.country ?? null;
            place.accepted_latitude = placeDraft.point?.latitude ?? null;
            place.accepted_longitude = placeDraft.point?.longitude ?? null;
            place.spatial_provenance_refs = {
              ...place.spatial_provenance_refs,
              source: "MANUAL_USER_REVIEWED_APPLE_SELECTION_V1",
              acceptance: "USER_CONFIRMED_SAVE",
              reviewed_at: clock(),
            };
          }
          // accepted_place_id stays null: Apple references are not internal places.id UUIDs.
          // No timezone, schedule, participation or visibility is inferred from a Place.
        }
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
        const rentalDetails = fields.rentalDetails
          ? {
              supplier: fields.rentalDetails.supplier,
              reserved_category: fields.rentalDetails.reservedCategory,
              or_similar: fields.rentalDetails.orSimilar,
              actual_vehicle_model: fields.rentalDetails.actualVehicleModel,
              verified_plate: fields.rentalDetails.verifiedPlate,
            }
          : undefined;
        const activityDetails = fields.activityDetails
          ? {
              session_label: fields.activityDetails.sessionLabel,
              admission_note: fields.activityDetails.admissionNote,
            }
          : undefined;
        const storedEntry = snapshot.graph.trip_activity_entry_places.find(
          (r) => r.event_id === draft.itemId,
        );
        const entryPlace =
          draft.mode === "EDIT" &&
          fields.activityDetails?.entryLocation ===
            state.original.activityDetails?.entryLocation &&
          storedEntry
            ? corePlaceSchema.parse(
                Object.fromEntries(
                  Object.keys(corePlaceSchema.shape).map((key) => [
                    key,
                    storedEntry[key] ?? null,
                  ]),
                ),
              )
            : fields.activityDetails?.entryLocation
              ? corePlaceSchema.parse({
                  ...Object.fromEntries(
                    Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
                  ),
                  authored_label: fields.activityDetails.entryLocation,
                })
              : null;
        const rentalPlaces: {
          pickup?: z.infer<typeof corePlaceSchema>;
          return?: z.infer<typeof corePlaceSchema>;
        } = {};
        for (const key of ["pickup", "return"] as const) {
          const field = key === "pickup" ? "pickupLocation" : "returnLocation";
          if (
            family === "P4" &&
            (draft.mode === "CREATE" || fields[field] !== state.original[field])
          )
            rentalPlaces[key] = { ...place, authored_label: fields[field] ?? null };
        }
        if (draft.mode === "CREATE")
          payloads.push({
            command: "CREATE_ITEM",
            payload: {
              family,
              ...(family === "P4"
                ? { details: rentalDetails, places: rentalPlaces }
                : {
                    ...(stayDetails ? { details: stayDetails, rooms: [] } : {}),
                    ...(activityDetails ? { details: activityDetails, entryPlace } : {}),
                    place,
                  }),
              core: { title: fields.title, description: fields.description },
              schedule,
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
          if (fields.location !== state.original.location || placeDraft)
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
        if (
          draft.mode === "EDIT" &&
          family === "P4" &&
          (json(fields.rentalDetails) !== json(state.original.rentalDetails) ||
            Object.keys(rentalPlaces).length)
        )
          payloads.push({
            command: "SET_RENTAL_DETAILS",
            payload: { details: rentalDetails, places: rentalPlaces },
          });
        if (
          draft.mode === "EDIT" &&
          family === "P6" &&
          json(fields.activityDetails) !== json(state.original.activityDetails)
        )
          payloads.push({
            command: "SET_ACTIVITY_DETAILS",
            payload: { details: activityDetails, entryPlace },
          });
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
        state.attempt = {
          fields: fieldsText,
          placeDraft: placeDraftText,
          // Exact Place/provenance is intent data; rollback retries must not regenerate its clock.
          place: structuredClone(place),
          commands,
        };
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
