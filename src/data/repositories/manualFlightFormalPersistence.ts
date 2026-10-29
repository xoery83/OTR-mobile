import { createUuid } from "@/domain/localId";
import { coreUuid, coreDefaults } from "@/domain/trip/tripCoreV2";
import {
  coreDateBoundary,
  coreStoredBoundary,
  normalizeCoreClock,
} from "@/domain/trip/tripCoreV2Temporal";
import { authoredFlightDetailsSchema } from "@/domain/trip/authoredFlightDetails";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "@/domain/trip/tripCoreV2Receipt";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { applyCoreCommand, coreCanManage } from "@/domain/trip/tripCoreV2Mutation";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { structuredTripCreateRequestSchema } from "@/domain/trip/tripStructuredDestinationContract";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { CoreDatabase, createTripCoreV2Repository } from "./tripCoreV2Repository";
import { readLocalManualSnapshotWithinTransaction } from "./tripLocalManualReadRepository";
import { hasAcceptedManualCreate } from "./acceptedManualCreate";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import type {
  ManualFlightDraft,
  ManualFlightFields,
} from "./localManualFlightRepository";

type Core = ReturnType<typeof createTripCoreV2Repository>;
type Snapshot = NonNullable<
  Awaited<ReturnType<typeof readLocalManualSnapshotWithinTransaction>>
>;
type Command = ReturnType<typeof validateCoreCommand>;
export type FormalManualFlightScope = {
  accountId: string;
  newTripsFrom: string;
};
export type FormalManualFlightOptions = {
  database: CoreDatabase;
  scope(accountId: string): FormalManualFlightScope | null;
};
export type FormalManualFlightSaved = {
  // Durable local queue commit only. This is never a LocalCoreReceipt or Server Accepted proof.
  status: "LOCAL_COMMITTED";
  authority: "MANUAL_QUEUE";
  localStatus: "PENDING";
  itemId: string;
  operationIds: readonly string[];
};
const json = (v: unknown) => canonicalCoreJson(v as Json);
// Private adapter for the existing Flight repository; all writes use its existing Core transaction/queue.
export function createFormalManualFlightPersistence(
  core: Pick<
    Core,
    | "captureContext"
    | "readAcceptedSnapshotWithinTransaction"
    | "manualReadSnapshot"
    | "commitManualBatch"
    | "combinedSnapshot"
  >,
  account: () => Promise<string>,
  options: FormalManualFlightOptions,
  newId = createUuid,
) {
  const { database } = options;
  const states = new WeakMap<
    ManualFlightDraft,
    {
      actor: string;
      fingerprint: string;
      attempt?: { fields: string; commands: Command[] };
    }
  >();
  async function scope(ctx: AccountRequestContext) {
    await assertAccountRequestContext(ctx, account);
    const enabled = options.scope(ctx.accountId);
    if (
      !enabled ||
      enabled.accountId !== ctx.accountId ||
      !Number.isFinite(Date.parse(enabled.newTripsFrom))
    )
      throw Error("MANUAL_FLIGHT_FORMAL_CLOSED");
    const row = await database.getFirstAsync<{
      id: string;
      created_at: string;
      create_operation_id: string;
      payload_json: string;
      entity_id: string;
      idempotency_key: string;
    }>(
      `SELECT t.id,t.created_at,t.create_operation_id,op.payload_json,op.entity_id,op.idempotency_key
       FROM local_trip_containers t JOIN sync_operations op ON op.id=t.create_operation_id
       AND op.owner_user_id=t.account_id AND op.trip_id=t.id
       AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
       WHERE t.account_id=? AND t.id=?`,
      ctx.accountId,
      ctx.tripId,
    );
    const request =
      row &&
      structuredTripCreateRequestSchema.safeParse({
        ...JSON.parse(row.payload_json),
        operationId: row.create_operation_id,
      });
    if (
      !row ||
      !request ||
      !request.success ||
      request.data.tripId !== ctx.tripId ||
      row.entity_id !== ctx.tripId ||
      row.idempotency_key !== row.create_operation_id ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      Date.parse(row.created_at) < Date.parse(enabled.newTripsFrom)
    )
      throw Error("MANUAL_FLIGHT_FORMAL_CLOSED");
    await assertAccountRequestContext(ctx, account);
  }
  async function current(ctx: AccountRequestContext) {
    await scope(ctx);
    const value = await readLocalManualSnapshotWithinTransaction(
      database,
      account,
      core,
      ctx,
      await core.readAcceptedSnapshotWithinTransaction(ctx),
    );
    if (!value) throw Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
    return value;
  }
  async function editable(
    snapshot: Snapshot,
    ctx: AccountRequestContext,
    itemId: string,
  ) {
    const row = snapshot.graph.itinerary_events.find((r) => r.id === itemId);
    if (
      !row ||
      row.experience_family !== "P2" ||
      row.owner_account_id !== ctx.accountId ||
      row.hidden_at !== null ||
      snapshot.graph.itinerary_transport_services.some(
        (service) => service.event_id === itemId,
      ) ||
      snapshot.graph.trip_booking_item_links.some(
        (link) => link.item_id === itemId && link.active,
      ) ||
      ["cancelled", "skipped"].includes(String(row.status)) ||
      snapshot.graph.trip_flight_intents.find((r) => r.event_id === itemId)
        ?.qualification !== "SPARSE" ||
      !coreCanManage(snapshot.graph, snapshot.actor, "ITEM", row)
    )
      throw Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
    const pendingCreate =
      snapshot.predictedIds.has(itemId) &&
      (await database.getFirstAsync(
        `SELECT 1 FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id
       AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id AND op.entity_id=?
       WHERE i.account_id=? AND i.trip_id=? AND json_extract(i.canonical_intent_text,'$.command')='CREATE_SPARSE_FLIGHT'
       AND json_extract(i.canonical_intent_text,'$.admission.mode')='MANUAL'`,
        itemId,
        ctx.accountId,
        ctx.tripId,
      ));
    if (
      !pendingCreate &&
      !(snapshot.cert && (await hasAcceptedManualCreate(database, ctx, itemId, "P2")))
    )
      throw Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
    return row;
  }
  function detailsFor(snapshot: Snapshot, itemId: string) {
    const endpoint = (role: "ORIGIN" | "DESTINATION") => {
      const row = snapshot.graph.itinerary_transport_endpoints.find(
        (r) => r.event_id === itemId && r.role === role,
      );
      const annotation = snapshot.graph.trip_endpoint_details.find(
        (r) => r.event_id === itemId && r.role === role,
      );
      if (!row) throw Error("MANUAL_FLIGHT_FORMAL_PROJECTION_MISMATCH");
      return {
        airportCode: annotation?.airport_code ?? null,
        name: row.authored_label ?? null,
        terminal: annotation?.terminal ?? null,
        time: coreStoredBoundary(row),
      };
    };
    return authoredFlightDetailsSchema.parse({
      flightNumberLiteral: snapshot.graph.trip_flight_intents.find(
        (r) => r.event_id === itemId,
      )?.flight_number_literal,
      origin: endpoint("ORIGIN"),
      destination: endpoint("DESTINATION"),
    });
  }
  function ids(draft: ManualFlightDraft) {
    const values = draft.formalOperationIds;
    if (
      draft.persistence !== "FORMAL_MANUAL" ||
      !values ||
      values.length !== 2 ||
      values[0] !== draft.operationId ||
      new Set(values).size !== 2
    )
      throw Error("MANUAL_FLIGHT_FORMAL_DRAFT_INVALID");
    values.forEach((id) => coreUuid.parse(id));
    return values;
  }
  async function retained(ctx: AccountRequestContext, draft: ManualFlightDraft) {
    const wanted = ids(draft);
    const rows = await database.getAllAsync<{
      operation_id: string;
      canonical_intent_text: string;
      intent_sha256: string;
      state: string;
      payload_json: string;
      queue_id: string;
      entity_id: string;
      idempotency_key: string;
      queue_status: string;
      body_json: string | null;
      receipt_sha256: string | null;
    }>(
      `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,i.state,op.payload_json,op.id AS queue_id,op.entity_id,op.idempotency_key,op.status AS queue_status,r.body_json,r.receipt_sha256
       FROM trip_core_pending_intents i LEFT JOIN sync_operations op ON op.id=i.queue_operation_id AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
       WHERE i.account_id=? AND i.trip_id=? AND i.operation_id IN (?,?)`,
      ctx.accountId,
      ctx.tripId,
      ...wanted,
    );
    if (!rows.length) return null;
    if (rows.length !== 2) throw Error("MANUAL_FLIGHT_FORMAL_RETRY_MISMATCH");
    const commands: Command[] = [];
    for (let index = 0; index < 2; index++) {
      const row = rows.find((r) => r.operation_id === wanted[index])!;
      const c = validateCoreCommand(JSON.parse(row.canonical_intent_text));
      const expected =
        draft.expectedRevision === undefined
          ? ["CREATE_SPARSE_FLIGHT", "SET_AUTHORED_FLIGHT_DETAILS"]
          : ["SET_AUTHORED_FLIGHT_DETAILS", "SET_ITEM_PARTICIPATION"];
      if (
        c.command !== expected[index] ||
        c.admission.mode !== "MANUAL" ||
        c.operationId !== wanted[index] ||
        c.tripId !== ctx.tripId ||
        c.target.kind !== "ITEM" ||
        c.target.id !== draft.itemId ||
        row.queue_id !== c.operationId ||
        row.idempotency_key !== c.operationId ||
        row.entity_id !== draft.itemId ||
        row.payload_json !== row.canonical_intent_text ||
        (await coreHashValue("otr-trip-core-intent-v2", c, tripCoreSha256Hex)) !==
          row.intent_sha256 ||
        !["BLOCKED", "PENDING", "IN_FLIGHT", "APPLIED"].includes(row.state)
      )
        throw Error("MANUAL_FLIGHT_FORMAL_RETRY_MISMATCH");
      if (row.state === "APPLIED") {
        const receipt = await validateCoreReceipt(
          JSON.parse(row.body_json ?? "null"),
          tripCoreSha256Hex,
        );
        if (
          row.queue_status !== "COMPLETED" ||
          receipt.actorAccountId !== ctx.accountId ||
          receipt.tripId !== ctx.tripId ||
          receipt.operationId !== c.operationId ||
          receipt.command !== c.command ||
          receipt.intentSha256 !== row.intent_sha256 ||
          receipt.receiptSha256 !== row.receipt_sha256 ||
          !["APPLIED", "NO_CHANGE"].includes(receipt.outcome)
        )
          throw Error("MANUAL_FLIGHT_FORMAL_RECEIPT_MISMATCH");
      } else if (
        !["PENDING", "DEPENDENCY_BLOCKED", "PROCESSING", "RETRYABLE"].includes(
          row.queue_status,
        )
      )
        throw Error("MANUAL_FLIGHT_FORMAL_RETRY_MISMATCH");
      commands.push(c);
    }
    return commands;
  }
  const result = (draft: ManualFlightDraft): FormalManualFlightSaved => ({
    status: "LOCAL_COMMITTED",
    authority: "MANUAL_QUEUE",
    localStatus: "PENDING",
    itemId: draft.itemId,
    operationIds: ids(draft),
  });
  return {
    async createDraft(
      tripId: string,
      itemId?: string,
      expectedRevision?: number,
    ): Promise<ManualFlightDraft | null> {
      const ctx = await core.captureContext(coreUuid.parse(tripId));
      if (!options.scope(ctx.accountId)) return null;
      // Existing local journals always retain their existing local authority, even after opt-in.
      if (
        itemId &&
        (await core.combinedSnapshot(ctx))?.perTargetAuthority[`ITEM:${itemId}`]
          ?.authority === "LOCAL_MANUAL"
      )
        return null;
      return withAccountApplyGate(async () => {
        let draft!: ManualFlightDraft;
        await database.withTransactionAsync(async () => {
          const snapshot = await current(ctx);
          const row = itemId ? await editable(snapshot, ctx, itemId) : null;
          if (
            row &&
            expectedRevision !== undefined &&
            row.semantic_revision !== expectedRevision
          )
            throw Error("MANUAL_FLIGHT_READ_CHANGED");
          const operationId = newId();
          draft = Object.freeze({
            accountId: ctx.accountId,
            tripId,
            commitId: newId(),
            slotId: newId(),
            operationId,
            itemId: itemId ?? newId(),
            persistence: "FORMAL_MANUAL" as const,
            formalOperationIds: [operationId, newId()],
            ...(row ? { expectedRevision: Number(row.semantic_revision) } : {}),
          });
          states.set(draft, {
            actor: json(snapshot.actor),
            fingerprint: snapshot.fingerprint,
          });
        });
        return draft;
      });
    },
    async recover(draft: ManualFlightDraft) {
      const ctx = await core.captureContext(draft.tripId);
      if (ctx.accountId !== draft.accountId) throw Error("LOCAL_MANUAL_ACCOUNT_CHANGED");
      return withAccountApplyGate(async () => {
        let saved: FormalManualFlightSaved | null = null;
        await database.withTransactionAsync(async () => {
          const snapshot = await current(ctx);
          if (await retained(ctx, draft)) {
            await editable(snapshot, ctx, draft.itemId);
            saved = result(draft);
          }
        });
        return saved;
      });
    },
    async save(
      draft: ManualFlightDraft,
      fields: ManualFlightFields,
      isCurrent: () => boolean,
    ) {
      const ctx = await core.captureContext(draft.tripId);
      if (ctx.accountId !== draft.accountId) throw Error("LOCAL_MANUAL_ACCOUNT_CHANGED");
      const normalized = json(fields);
      return core.commitManualBatch(ctx, async () => {
        if (!isCurrent()) throw Error("LOCAL_MANUAL_INTENT_CLOSED");
        const snapshot = await current(ctx);
        const prior = await retained(ctx, draft);
        if (prior) {
          const details = prior.find((c) => c.command === "SET_AUTHORED_FLIGHT_DETAILS")!;
          const supplied = authoredFlightDetailsSchema.parse({
            flightNumberLiteral: fields.flightNumberLiteral,
            origin: fields.origin ?? {
              airportCode: null,
              name: null,
              terminal: null,
              time: coreDateBoundary(fields.departureDate),
            },
            destination: fields.destination ?? {
              airportCode: null,
              name: null,
              terminal: null,
              time: {
                ...coreDateBoundary(fields.departureDate),
                local_date: null,
              },
            },
          });
          if (json(details.payload) !== json(supplied))
            throw Error("LOCAL_MANUAL_DRAFT_FROZEN");
          const participation = prior.find(
            (c) =>
              c.command === "CREATE_SPARSE_FLIGHT" ||
              c.command === "SET_ITEM_PARTICIPATION",
          )?.payload as { participation?: unknown };
          if (
            fields.participation &&
            json(participation?.participation) !== json(fields.participation)
          )
            throw Error("LOCAL_MANUAL_DRAFT_FROZEN");
          await editable(snapshot, ctx, draft.itemId);
          if (!isCurrent()) throw Error("LOCAL_MANUAL_INTENT_CLOSED");
          return { commands: [], result: async () => result(draft) };
        }
        const state = states.get(draft);
        if (!state) throw Error("MANUAL_FLIGHT_FORMAL_DRAFT_UNAVAILABLE");
        if (state.attempt && state.attempt.fields !== normalized)
          throw Error("LOCAL_MANUAL_DRAFT_FROZEN");
        if (
          state.actor !== json(snapshot.actor) ||
          state.fingerprint !== snapshot.fingerprint
        )
          throw Error("MANUAL_FLIGHT_READ_CHANGED");
        const row =
          draft.expectedRevision === undefined
            ? null
            : await editable(snapshot, ctx, draft.itemId);
        if (row && row.semantic_revision !== draft.expectedRevision)
          throw Error("MANUAL_FLIGHT_READ_CHANGED");
        const details = authoredFlightDetailsSchema.parse({
          flightNumberLiteral: fields.flightNumberLiteral,
          origin: fields.origin ?? {
            airportCode: null,
            name: null,
            terminal: null,
            time: coreDateBoundary(fields.departureDate),
          },
          destination: fields.destination ?? {
            airportCode: null,
            name: null,
            terminal: null,
            time: {
              ...coreDateBoundary(fields.departureDate),
              local_date: null,
            },
          },
        });
        if (details.origin.time.local_date !== fields.departureDate)
          throw Error("MANUAL_FLIGHT_DATE_MISMATCH");
        const participation =
          fields.participation ??
          (row
            ? {
                mode: row.participation_mode,
                people: snapshot.graph.trip_item_participants
                  .filter((r) => r.item_id === draft.itemId && r.active)
                  .map((r) => r.person_id)
                  .sort(),
                selfPersonId: row.self_person_id,
              }
            : coreDefaults("member").participation);
        const payloads =
          draft.expectedRevision === undefined
            ? [
                {
                  command: "CREATE_SPARSE_FLIGHT",
                  payload: {
                    flightNumberLiteral: details.flightNumberLiteral,
                    departureDate: fields.departureDate,
                    ...coreDefaults("member"),
                    participation,
                  },
                },
                { command: "SET_AUTHORED_FLIGHT_DETAILS", payload: details },
              ]
            : [
                { command: "SET_AUTHORED_FLIGHT_DETAILS", payload: details },
                {
                  command: "SET_ITEM_PARTICIPATION",
                  payload: { participation },
                },
              ];
        let graph = snapshot.graph;
        const commands = payloads.map((p, i) => {
          const revision =
            graph.itinerary_events.find((r) => r.id === draft.itemId)
              ?.semantic_revision ?? null;
          const c = validateCoreCommand({
            contractVersion: 2,
            intentVersion: 2,
            operationId: ids(draft)[i],
            tripId: ctx.tripId,
            command: p.command,
            target: { kind: "ITEM", id: draft.itemId },
            baseVector: [{ kind: "ITEM", id: draft.itemId, revision }],
            admission: {
              mode: "MANUAL",
              sourceIntentId: null,
              policyVersion: null,
            },
            payload: p.payload,
          });
          graph = applyCoreCommand(
            graph,
            c,
            snapshot.actor,
            new Date().toISOString(),
            false,
            undefined,
            true,
          ).graph;
          return c;
        });
        if (state.attempt && json(state.attempt.commands) !== json(commands))
          throw Error("MANUAL_FLIGHT_FORMAL_RETRY_MISMATCH");
        state.attempt = { fields: normalized, commands };
        return {
          commands,
          result: async () => {
            const after = await current(ctx);
            await editable(after, ctx, draft.itemId);
            const storedDetails = structuredClone(details);
            for (const side of ["origin", "destination"] as const) {
              const time = storedDetails[side].time;
              if (time.local_time !== null)
                time.local_time = normalizeCoreClock(
                  time.local_time,
                  time.clock_precision!,
                );
            }
            if (json(detailsFor(after, draft.itemId)) !== json(storedDetails))
              throw Error("MANUAL_FLIGHT_FORMAL_PROJECTION_MISMATCH");
            if (!isCurrent()) throw Error("LOCAL_MANUAL_INTENT_CLOSED");
            return result(draft);
          },
        };
      });
    },
    async readPending(tripId: string, itemId: string) {
      const ctx = await core.captureContext(tripId);
      if (!options.scope(ctx.accountId)) return null;
      return withAccountApplyGate(async () => {
        let item: ReturnType<typeof projectCoreItem> | null = null;
        await database.withTransactionAsync(async () => {
          const snapshot = await current(ctx);
          await editable(snapshot, ctx, itemId);
          item = projectCoreItem(
            snapshot.graph,
            snapshot.actor,
            itemId,
            {},
            snapshot.predictedIds.has(itemId) ? "PENDING" : undefined,
          );
        });
        return item;
      });
    },
  };
}
