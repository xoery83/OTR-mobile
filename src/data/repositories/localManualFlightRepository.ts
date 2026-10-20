import { validateCalendarDate } from "../../domain/trip/dayReadModel";
import { coreDefaults, coreUuid } from "../../domain/trip/tripCoreV2";
import { corePayloadSchemas } from "../../domain/trip/tripCoreV2Commands";
import { createUuid } from "../../domain/localId";
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
}>;
export type ManualFlightFields = { flightNumberLiteral: string; departureDate: string };
type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "prepareLocalManualSparse" | "commitLocal" | "combinedSnapshot"
>;
export type ManualFlightSaved = {
  status: "LOCAL_COMMITTED";
  itemId: string;
  receipt: LocalCoreReceipt;
};
const payload = (fields: ManualFlightFields) =>
  corePayloadSchemas.CREATE_SPARSE_FLIGHT.parse({
    flightNumberLiteral: fields.flightNumberLiteral.trim(),
    departureDate: validateCalendarDate(fields.departureDate),
    ...coreDefaults("member"),
  });
const same = (a: ManualFlightFields, b: ManualFlightFields) =>
  a.flightNumberLiteral === b.flightNumberLiteral && a.departureDate === b.departureDate;
export function createLocalManualFlightRepository(
  core: Core,
  account: () => Promise<string>,
  newId = createUuid,
) {
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
  async function recover(draft: ManualFlightDraft): Promise<ManualFlightSaved | null> {
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
    async createDraft(tripId: string): Promise<ManualFlightDraft> {
      const ctx = await core.captureContext(coreUuid.parse(tripId));
      await assertAccountRequestContext(ctx, account);
      return Object.freeze({
        accountId: ctx.accountId,
        tripId,
        commitId: newId(),
        slotId: newId(),
        operationId: newId(),
        itemId: newId(),
      });
    },
    recover,
    async save(
      draft: ManualFlightDraft,
      fields: ManualFlightFields,
      current: () => boolean,
    ): Promise<ManualFlightSaved> {
      const parsed = payload(fields),
        normalized = {
          flightNumberLiteral: parsed.flightNumberLiteral,
          departureDate: parsed.departureDate,
        };
      const ctx = await context(draft);
      if (!current()) throw new Error("LOCAL_MANUAL_INTENT_CLOSED");
      const saved = await recover(draft);
      if (saved) {
        const snapshot = await core.combinedSnapshot(ctx);
        await assertAccountRequestContext(ctx, account);
        const intent = snapshot?.graph.trip_flight_intents.find(
            (r) => r.event_id === draft.itemId,
          ),
          item = snapshot?.graph.itinerary_events.find((r) => r.id === draft.itemId);
        if (
          intent?.flight_number_literal !== normalized.flightNumberLiteral ||
          item?.start_local_date !== normalized.departureDate
        )
          throw new Error("LOCAL_MANUAL_OUTCOME_MISMATCH");
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
  );
}
