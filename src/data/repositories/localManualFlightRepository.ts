import {
  createFormalManualFlightPersistence,
  type FormalManualFlightOptions,
  type FormalManualFlightSaved,
} from "./manualFlightFormalPersistence";
import { z } from "zod";
import { validateCalendarDate } from "../../domain/trip/dayReadModel";
import { coreDefaults, coreUuid } from "../../domain/trip/tripCoreV2";
import { corePayloadSchemas } from "../../domain/trip/tripCoreV2Commands";
import { localAuthoredFlightPayloadSchema } from "../../domain/trip/localCoreAuthority";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { createUuid } from "../../domain/localId";
import { createCoreP6DayFeedReader } from "./tripCoreV2P6DayFeedRepository";
import type { CoreFlightDayProjection } from "../../domain/trip/tripCoreV2DayFeed";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import type {
  LocalCommitEnvelope,
  LocalCoreReceipt,
} from "../../domain/trip/localCoreAuthority";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { tripCoreSha256Hex } from "./tripCoreSha256";
export type ManualFlightDraft = Readonly<{
  accountId: string;
  tripId: string;
  commitId: string;
  slotId: string;
  operationId: string;
  itemId: string;
  expectedRevision?: number;
  persistence?: "FORMAL_MANUAL";
  formalOperationIds?: readonly string[];
}>;
export const manualFlightFieldsSchema = corePayloadSchemas.CREATE_SPARSE_FLIGHT.pick({
  flightNumberLiteral: true,
  departureDate: true,
  participation: true,
})
  .partial({ participation: true })
  .extend({
    origin: localAuthoredFlightPayloadSchema.shape.origin.optional(),
    destination: localAuthoredFlightPayloadSchema.shape.destination.optional(),
  });
export type ManualFlightFields = z.infer<typeof manualFlightFieldsSchema>;

type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  | "captureContext"
  | "prepareLocalManualSparse"
  | "commitLocal"
  | "combinedSnapshot"
  | "acceptedSnapshot"
  | "readAcceptedSnapshotWithinTransaction"
  | "manualReadSnapshot"
  | "commitManualBatch"
>;
export type ManualFlightRead = CoreFlightDayProjection["items"][number];
export type ManualFlightSaved = {
  status: "LOCAL_COMMITTED";
  itemId: string;
  receipt: LocalCoreReceipt;
};
const payload = (input: ManualFlightFields) => {
  const fields = manualFlightFieldsSchema.parse(input);
  const sparse = corePayloadSchemas.CREATE_SPARSE_FLIGHT.parse({
    flightNumberLiteral: fields.flightNumberLiteral.trim(),
    departureDate: validateCalendarDate(fields.departureDate),
    ...coreDefaults("member"),
    ...(fields.participation ? { participation: fields.participation } : {}),
  });
  if (!fields.origin && !fields.destination) return sparse;
  return localAuthoredFlightPayloadSchema.parse({
    flightNumberLiteral: sparse.flightNumberLiteral,
    origin: fields.origin ?? {
      airportCode: null,
      name: null,
      terminal: null,
      time: coreDateBoundary(sparse.departureDate),
    },
    destination: fields.destination ?? {
      airportCode: null,
      name: null,
      terminal: null,
      time: coreDateBoundary(sparse.departureDate),
    },
    participation: sparse.participation,
    acl: sparse.acl,
  });
};
const same = (a: ManualFlightFields, b: ManualFlightFields) =>
  JSON.stringify(a) === JSON.stringify(b);
export function createLocalManualFlightRepository(
  core: Core,
  account: () => Promise<string>,
  newId = createUuid,
  formalOptions?: FormalManualFlightOptions,
) {
  const formal = formalOptions
    ? createFormalManualFlightPersistence(core, account, formalOptions, newId)
    : null;
  // Attempt identity lives with the existing form draft; only a committed journal is durable.
  const attempts = new WeakMap<
    ManualFlightDraft,
    { fields: ManualFlightFields; envelope: LocalCommitEnvelope }
  >();
  async function context(draft: ManualFlightDraft) {
    for (const id of [
      draft.accountId,
      draft.tripId,
      draft.commitId,
      draft.slotId,
      draft.operationId,
      draft.itemId,
    ])
      coreUuid.parse(id);
    const ctx = await captureAccountRequestContext(draft.tripId, account);
    if (ctx.accountId !== draft.accountId)
      throw new Error("LOCAL_MANUAL_ACCOUNT_CHANGED");
    return ctx;
  }
  async function recover(
    draft: ManualFlightDraft,
  ): Promise<ManualFlightSaved | FormalManualFlightSaved | null> {
    if (draft.persistence === "FORMAL_MANUAL") {
      if (!formal) throw new Error("MANUAL_FLIGHT_FORMAL_CLOSED");
      return formal.recover(draft);
    }
    const ctx = await context(draft);
    const snapshot = await core.combinedSnapshot(ctx);
    await assertAccountRequestContext(ctx, account);
    if (!snapshot) return null;
    const receipt = snapshot.receipts.find((r) => r.commitId === draft.commitId);
    if (!receipt) return null;
    if (
      receipt.authority !== "LOCAL_MANUAL" ||
      receipt.slotId !== draft.slotId ||
      receipt.operationId !== draft.operationId ||
      receipt.target.kind !== "ITEM" ||
      receipt.target.id !== draft.itemId
    )
      throw new Error("LOCAL_MANUAL_DRAFT_CONFLICT");
    return { status: "LOCAL_COMMITTED", itemId: draft.itemId, receipt };
  }
  return {
    async createDraft(
      tripId: string,
      itemId?: string,
      expectedRevision?: number,
    ): Promise<ManualFlightDraft> {
      if (formal) {
        try {
          const draft = await formal.createDraft(tripId, itemId, expectedRevision);
          if (draft) return draft;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "MANUAL_FLIGHT_FORMAL_CLOSED"
          )
            throw error;
          // Ineligible old Trips retain the legacy local journal; never upgrade them.
        }
      }
      const ctx = await core.captureContext(coreUuid.parse(tripId));
      await assertAccountRequestContext(ctx, account);
      if (itemId) {
        const snapshot = await core.combinedSnapshot(ctx);
        await assertAccountRequestContext(ctx, account);
        const item = snapshot?.graph.itinerary_events.find((r) => r.id === itemId);
        if (
          !item ||
          snapshot?.perTargetAuthority[`ITEM:${itemId}`]?.authority !== "LOCAL_MANUAL" ||
          item.experience_family !== "P2" ||
          snapshot.graph.trip_flight_intents.find((r) => r.event_id === itemId)
            ?.qualification !== "SPARSE"
        )
          throw new Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
        if (expectedRevision !== undefined && item.semantic_revision !== expectedRevision)
          throw new Error("MANUAL_FLIGHT_READ_CHANGED");
        expectedRevision = Number(item.semantic_revision);
      }
      return Object.freeze({
        accountId: ctx.accountId,
        tripId,
        commitId: newId(),
        slotId: newId(),
        operationId: newId(),
        itemId: itemId ? coreUuid.parse(itemId) : newId(),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });
    },
    recover,
    async readForForm(
      tripId: string,
      itemId: string,
      expectedRevision?: number,
    ): Promise<ManualFlightRead> {
      const ctx = await core.captureContext(coreUuid.parse(tripId));
      const observed = await createCoreP6DayFeedReader(core)(tripId);
      await assertAccountRequestContext(ctx, account);
      let item = observed?.projection.items.find(
        (entry) => entry.itemId === coreUuid.parse(itemId),
      );
      if (formal) {
        try {
          item = (await formal.readPending(tripId, itemId)) ?? item;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !["MANUAL_FLIGHT_FORMAL_CLOSED", "MANUAL_FLIGHT_EDIT_UNAVAILABLE"].includes(
              error.message,
            )
          )
            throw error;
          // Source/legacy read authority remains readable without gaining Manual Edit.
        }
      }
      if (!item || item.family !== "P2" || item.hidden || item.tripId !== tripId)
        throw new Error("MANUAL_FLIGHT_READ_UNAVAILABLE");
      if (expectedRevision !== undefined && item.itemRevision !== expectedRevision)
        throw new Error("MANUAL_FLIGHT_READ_CHANGED");
      return item;
    },
    async save(
      draft: ManualFlightDraft,
      fields: ManualFlightFields,
      current: () => boolean,
    ): Promise<ManualFlightSaved | FormalManualFlightSaved> {
      if (draft.persistence === "FORMAL_MANUAL") {
        if (!formal) throw new Error("MANUAL_FLIGHT_FORMAL_CLOSED");
        const parsedFields = manualFlightFieldsSchema.parse(fields);
        return formal.save(
          draft,
          {
            ...parsedFields,
            flightNumberLiteral: parsedFields.flightNumberLiteral.trim(),
            departureDate: validateCalendarDate(parsedFields.departureDate),
          },
          current,
        );
      }
      const parsed = payload(fields);
      const normalized = manualFlightFieldsSchema.parse({
        flightNumberLiteral: parsed.flightNumberLiteral,
        departureDate:
          "origin" in parsed ? parsed.origin.time.local_date : parsed.departureDate,
        ...(fields.participation ? { participation: parsed.participation } : {}),
        ...("origin" in parsed
          ? { origin: parsed.origin, destination: parsed.destination }
          : {}),
      });
      const ctx = await context(draft);
      if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
      const saved = await recover(draft);
      if (saved && "receipt" in saved) {
        const snapshot = await core.combinedSnapshot(ctx);
        await assertAccountRequestContext(ctx, account);
        const intent = snapshot?.graph.trip_flight_intents.find(
            (r) => r.event_id === draft.itemId,
          ),
          item = snapshot?.graph.itinerary_events.find((r) => r.id === draft.itemId);
        if (
          intent?.flight_number_literal !== normalized.flightNumberLiteral ||
          ("origin" in parsed
            ? snapshot?.graph.itinerary_transport_endpoints.find(
                (r) => r.event_id === draft.itemId && r.role === "ORIGIN",
              )?.local_date
            : item?.start_local_date) !== normalized.departureDate
        )
          throw new Error("LOCAL_MANUAL_OUTCOME_MISMATCH");
        if ("origin" in parsed) {
          for (const [side, role] of [
            ["origin", "ORIGIN"],
            ["destination", "DESTINATION"],
          ] as const) {
            const endpoint = snapshot?.graph.itinerary_transport_endpoints.find(
              (r) => r.event_id === draft.itemId && r.role === role,
            );
            const detail = snapshot?.graph.trip_endpoint_details.find(
              (r) => r.event_id === draft.itemId && r.role === role,
            );
            const wanted = parsed[side];
            if (
              endpoint?.authored_label !== wanted.name ||
              detail?.airport_code !== wanted.airportCode ||
              detail?.terminal !== wanted.terminal ||
              endpoint?.local_date !== wanted.time.local_date ||
              String(endpoint?.local_time ?? "").slice(0, 5) !==
                (wanted.time.local_time ?? "").slice(0, 5) ||
              endpoint?.zone_id !== wanted.time.zone_id
            )
              throw new Error("LOCAL_MANUAL_OUTCOME_MISMATCH");
          }
        }
        if (fields.participation) {
          const participation = parsed.participation;
          const selected =
            snapshot?.graph.trip_item_participants
              .filter((row) => row.item_id === draft.itemId && row.active)
              .map((row) => String(row.person_id))
              .sort() ?? [];
          const expected =
            participation.mode === "SELECTED_MEMBERS"
              ? [...participation.people].sort()
              : [];
          const self =
            participation.mode === "SELF"
              ? (participation.selfPersonId ?? snapshot?.actor.personId)
              : null;
          if (
            item?.participation_mode !== participation.mode ||
            item?.self_person_id !== self ||
            JSON.stringify(selected) !== JSON.stringify(expected)
          )
            throw new Error("LOCAL_MANUAL_OUTCOME_MISMATCH");
        }
        if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
        return saved;
      }
      if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
      let attempt = attempts.get(draft);
      if (attempt && !same(attempt.fields, normalized))
        throw new Error("LOCAL_MANUAL_DRAFT_FROZEN");
      if (!attempt) {
        const envelope = await core.prepareLocalManualSparse(ctx, {
          ...draft,
          payload: parsed,
          ...("origin" in parsed
            ? {
                command: "SAVE_AUTHORED_FLIGHT_LOCAL" as const,
                expectedRevision: draft.expectedRevision,
              }
            : {}),
        });
        attempt = { fields: normalized, envelope };
        attempts.set(draft, attempt);
      }
      await assertAccountRequestContext(ctx, account);
      if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
      const result = await core.commitLocal(ctx, attempt.envelope);
      await assertAccountRequestContext(ctx, account);
      if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
      const receipt = result.receipts.find(
        (r) =>
          r.slotId === draft.slotId &&
          r.operationId === draft.operationId &&
          r.target.kind === "ITEM" &&
          r.target.id === draft.itemId,
      );
      if (!receipt || receipt.authority !== "LOCAL_MANUAL")
        throw new Error("LOCAL_MANUAL_RECEIPT_MISSING");
      return { status: "LOCAL_COMMITTED", itemId: draft.itemId, receipt };
    },
  };
}
export type LocalManualFlightRepository = ReturnType<
  typeof createLocalManualFlightRepository
>;
export async function readLocalManualFlightRepository() {
  const database = await readInitializedDatabase();
  return createLocalManualFlightRepository(
    createTripCoreV2Repository(database, requireActiveUserId, tripCoreSha256Hex),
    requireActiveUserId,
    createUuid,
    {
      database,
      scope: (await import("../sync/nativeTripQaScope"))
        .nativeTripQaFormalManualFlightScope,
    },
  );
}
