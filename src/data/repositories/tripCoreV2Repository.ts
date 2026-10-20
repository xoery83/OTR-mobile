import { qualifyCoreTtr, type CoreTtrResult } from "../../domain/trip/tripCoreTtr";
import type { TtrInput } from "../../domain/trip/ttr";
import type * as SQLite from "expo-sqlite";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  captureAccountRequestContext,
  captureAccountScope,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { canonicalCoreJson, type Json } from "../../domain/trip/tripCoreV2Json";
import { coreTableSchemas, type CoreTable } from "../../domain/trip/tripCoreV2";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import {
  coreHashValue,
  validateCoreReadCollection,
} from "../../domain/trip/tripCoreV2Read";
import { validateCoreReceipt } from "../../domain/trip/tripCoreV2Receipt";
import {
  emptyCoreGraph,
  applyCoreCommand,
  type CoreActor,
  type CoreGraph,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreMirrorKey, validateCoreGraph } from "../../domain/trip/tripCoreV2Graph";
import { projectCoreItem } from "../../domain/trip/tripCoreV2Views";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";
import { projectCoreDay } from "../../domain/trip/tripCoreV2Day";
import type { ImportHash } from "../../domain/trip/flightImportReview";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { readLocalManualSnapshotWithinTransaction } from "./tripLocalManualReadRepository";
export type CoreDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
export type CoreRefresh = AccountRequestContext & {
  refreshGeneration: number;
  accessRevision: number;
};
export type CoreAcceptedCertificate = {
  epoch: string;
  revision: string;
  access_revision: number;
  applied_generation: number;
  actor_person_binding_hash: string;
  roster_hash: string;
  manifest_sha256: string;
  ordinary_order_version: number;
};
export type CoreAcceptedSnapshot = {
  graph: CoreGraph;
  actor: CoreActor;
  certificate: CoreAcceptedCertificate;
  participatingPersonIds: string[];
};
export type CoreTtrAuthority = Readonly<{
  scope: AccountRequestContext;
  personId: string;
  branchId: string;
  order: { id: string; revision: number };
  collection: CoreAcceptedCertificate;
  refreshGeneration: number;
  from: {
    eventId: string;
    occurrenceToken: string;
    role: NonNullable<NonNullable<TtrInput["from"]>["role"]>;
    itemRevision: number;
    locationInputRevision: number;
  };
  to: {
    eventId: string;
    occurrenceToken: string;
    role: NonNullable<NonNullable<TtrInput["from"]>["role"]>;
    itemRevision: number;
    locationInputRevision: number;
  };
  coverage: "NONE_PROVEN";
  expiry: { eventDate: string; zone: string };
}>;
export type CoreQualifiedTtrRead = Extract<CoreTtrResult, { status: "QUALIFIED" }> & {
  authority: CoreTtrAuthority;
};
export type CoreTtrReadResult =
  Extract<CoreTtrResult, { status: "UNAVAILABLE" }> | CoreQualifiedTtrRead;
export type CoreTtrPublicationLease = Readonly<{
  envelope: CoreQualifiedTtrRead;
  isCurrent(): boolean;
  ifCurrent(emit: () => undefined): boolean;
}>;
export type CoreTtrPublicationResult =
  | { status: "CURRENT" }
  | { status: "STALE"; reason: "AUTHORITY_CHANGED" | "REFRESH_PENDING" }
  | {
      status: "UNAVAILABLE";
      reason: Extract<CoreTtrResult, { status: "UNAVAILABLE" }>["reason"];
    };
// Ephemeral fences shared by repositories on the identical serialized connection; never revisions.
const ttrPublicationFences = new WeakMap<CoreDatabase, Map<string, object>>();
function ttrFence(
  database: CoreDatabase,
  ctx: AccountRequestContext,
  invalidate = false,
) {
  let scopes = ttrPublicationFences.get(database);
  if (!scopes) ttrPublicationFences.set(database, (scopes = new Map()));
  const key = JSON.stringify([ctx.accountId, ctx.tripId]);
  if (invalidate || !scopes.has(key)) scopes.set(key, {});
  return scopes.get(key)!;
}
function fieldType(schema: any): string {
  while (["nullable", "optional"].includes(schema.def.type))
    schema = schema.def.innerType;
  return schema.def.type;
}
const encode = (schema: any, value: unknown): SQLite.SQLiteBindValue =>
  value === null
    ? null
    : fieldType(schema) === "boolean"
      ? value
        ? 1
        : 0
      : ["object", "record", "array"].includes(fieldType(schema))
        ? canonicalCoreJson(value as Json)
        : (value as SQLite.SQLiteBindValue);
const decode = (schema: any, value: unknown) =>
  value === null
    ? null
    : fieldType(schema) === "boolean"
      ? value === 1
      : ["object", "record", "array"].includes(fieldType(schema))
        ? JSON.parse(value as string)
        : value;
export function createTripCoreV2Repository(
  database: CoreDatabase,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  clock = () => new Date().toISOString(),
) {
  const captureContext = (tripId: string) =>
    captureAccountRequestContext(tripId, getAccountId);
  const assertContext = (ctx: AccountRequestContext) =>
    assertAccountRequestContext(ctx, getAccountId);
  async function scope(ctx: AccountRequestContext) {
    const row = await database.getFirstAsync<{
      refresh_generation: number;
      access_revision: number;
      revoked: number;
    }>(
      "SELECT refresh_generation,access_revision,revoked FROM trip_core_scopes WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    if (row?.revoked) throw new Error("CORE_ACCESS_REVOKED");
    return row;
  }
  async function readGraph(ctx: AccountRequestContext): Promise<CoreGraph> {
    await assertContext(ctx);
    const currentScope = await scope(ctx);
    const accepted = await database.getFirstAsync<{
      access_revision: number;
      ordinary_order_version: number;
    }>(
      "SELECT access_revision,ordinary_order_version FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    const graph = emptyCoreGraph();
    if (accepted && accepted.access_revision !== currentScope?.access_revision)
      return graph;
    for (const [table, schema] of Object.entries(coreTableSchemas)) {
      if (
        table === "trip_person_ordinary_orders" &&
        accepted?.ordinary_order_version !== 1
      )
        continue;
      const rows = await database.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM trip_core_${table} WHERE cache_account_id=? AND ${table === "expense_links" ? "journey_id" : "trip_id"}=?`,
        ctx.accountId,
        ctx.tripId,
      );
      graph[table as CoreTable] = rows.map((row) =>
        Object.fromEntries(
          Object.entries(schema.shape).map(([key, s]) => [key, decode(s, row[key])]),
        ),
      );
    }
    await assertContext(ctx);
    return graph;
  }
  async function acceptedTripIds() {
    return withAccountApplyGate(async () => {
      const context = await captureAccountScope(getAccountId);
      let tripIds: string[] = [];
      await database.withTransactionAsync(async () => {
        const rows = await database.getAllAsync<{ trip_id: string }>(
          "SELECT c.trip_id FROM trip_core_read_certificates c JOIN trip_core_scopes s ON s.account_id=c.account_id AND s.trip_id=c.trip_id WHERE c.account_id=? AND s.revoked=0 AND s.access_revision=c.access_revision AND c.business_version=2 AND c.read_version=2 AND c.temporal_version=1 AND c.complete=1 ORDER BY c.trip_id",
          context.accountId,
        );
        tripIds = rows.map((row) => row.trip_id);
        await assertAccountRequestContext(context, getAccountId);
      });
      await assertAccountRequestContext(context, getAccountId);
      return { scope: context, tripIds };
    });
  }
  // Accepted collection only: pending predictions never become Day Feed authority.
  async function acceptedWithinTransaction(
    ctx: AccountRequestContext,
  ): Promise<CoreAcceptedSnapshot | null> {
    await assertContext(ctx);
    const current = await scope(ctx);
    const certificate = await database.getFirstAsync<
      CoreAcceptedCertificate & {
        business_version: number;
        read_version: number;
        temporal_version: number;
        complete: number;
      }
    >(
      "SELECT epoch,revision,access_revision,applied_generation,actor_person_binding_hash,roster_hash,manifest_sha256,ordinary_order_version,business_version,read_version,temporal_version,complete FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    if (!certificate) return null;
    if (
      certificate.business_version !== 2 ||
      certificate.read_version !== 2 ||
      certificate.temporal_version !== 1 ||
      certificate.complete !== 1
    )
      throw new Error("CORE_READ_VERSION_MISMATCH");
    if (certificate.access_revision !== current?.access_revision)
      throw new Error("CORE_READ_ACCESS_MISMATCH");
    const bindings = await database.getAllAsync<{
      person_id: string;
      linked_account_id: string | null;
      active: number;
      participating: number;
    }>(
      "SELECT person_id,linked_account_id,active,participating FROM trip_core_person_bindings WHERE account_id=? AND trip_id=? ORDER BY person_id",
      ctx.accountId,
      ctx.tripId,
    );
    const own = bindings.filter((b) => b.active && b.linked_account_id === ctx.accountId);
    if (own.length > 1) throw new Error("CORE_PERSON_BINDING_MISMATCH");
    const result: CoreAcceptedSnapshot = {
      graph: validateCoreGraph(await readGraph(ctx), ctx.tripId, true),
      actor: {
        accountId: ctx.accountId,
        tripId: ctx.tripId,
        active: true,
        canManageShared: false,
        personId: own[0]?.person_id ?? null,
        personIds: bindings.filter((b) => b.active).map((b) => b.person_id),
      },
      certificate,
      participatingPersonIds: bindings
        .filter((b) => b.active && b.participating)
        .map((b) => b.person_id),
    };
    await assertContext(ctx);
    return result;
  }
  async function acceptedSnapshot(
    ctx: AccountRequestContext,
  ): Promise<CoreAcceptedSnapshot | null> {
    return withAccountApplyGate(async () => {
      let result: CoreAcceptedSnapshot | null = null;
      await database.withTransactionAsync(async () => {
        result = await acceptedWithinTransaction(ctx);
      });
      await assertContext(ctx);
      return result;
    });
  }
  // Caller owns the Account gate and serialized SQLite transaction. Never reacquire either.
  async function ttrWithinTransaction(
    ctx: AccountRequestContext,
    orderId: string,
    fromId: string,
    toId: string,
  ): Promise<CoreTtrReadResult> {
    const snapshot = await acceptedWithinTransaction(ctx);
    if (!snapshot || snapshot.certificate.ordinary_order_version !== 1)
      return {
        version: "otr-core-ttr-input/1" as const,
        status: "UNAVAILABLE" as const,
        reason: "CONTINUITY_UNKNOWN",
      };
    const result = await qualifyCoreTtr(
      snapshot.graph,
      snapshot.actor,
      orderId,
      fromId,
      toId,
      ctx,
      snapshot.certificate,
      snapshot.participatingPersonIds,
      hash,
      true,
    );
    await assertContext(ctx);
    if (result.status !== "QUALIFIED") return result;
    const order = snapshot.graph.trip_person_ordinary_orders.find(
      (o) => o.id === orderId,
    )!;
    const current = await scope(ctx);
    await assertContext(ctx);
    const occurrence = (o: NonNullable<typeof result.input.from>) => ({
      eventId: o.eventId,
      occurrenceToken: o.occurrenceToken!,
      role: o.role!,
      itemRevision: o.semanticRevision,
      locationInputRevision: o.endpoint!.locationInputRevision!,
    });
    return {
      ...result,
      authority: {
        scope: { ...ctx },
        personId: snapshot.actor.personId!,
        branchId: String(order.branch_id),
        order: { id: orderId, revision: Number(order.revision) },
        collection: { ...snapshot.certificate },
        refreshGeneration: current!.refresh_generation,
        from: occurrence(result.input.from!),
        to: occurrence(result.input.to!),
        coverage: "NONE_PROVEN",
        expiry: { ...result.input.expiry! },
      },
    };
  }
  async function readTtr(
    ctx: AccountRequestContext,
    orderId: string,
    fromId: string,
    toId: string,
  ) {
    return withAccountApplyGate(async () => {
      let result!: Awaited<ReturnType<typeof ttrWithinTransaction>>;
      await database.withTransactionAsync(async () => {
        result = await ttrWithinTransaction(ctx, orderId, fromId, toId);
      });
      await assertContext(ctx);
      return result;
    });
  }
  async function revalidateTtrWithinTransaction(
    ctx: AccountRequestContext,
    orderId: string,
    fromId: string,
    toId: string,
    captured: Extract<CoreTtrResult, { status: "QUALIFIED" }>,
  ) {
    const result = await ttrWithinTransaction(ctx, orderId, fromId, toId);
    return (
      result.status === "QUALIFIED" &&
      result.authorityKey === captured.authorityKey &&
      canonicalCoreJson(result.input as unknown as Json) ===
        canonicalCoreJson(captured.input as unknown as Json) &&
      canonicalCoreJson(result.spatial as unknown as Json) ===
        canonicalCoreJson(captured.spatial as unknown as Json) &&
      (!("authority" in captured) ||
        canonicalCoreJson(result.authority as unknown as Json) ===
          canonicalCoreJson(captured.authority as Json))
    );
  }
  // Caller must first finish its personal selection transaction AND release its Account gate.
  async function guardTtrPublication(
    ctx: AccountRequestContext,
    orderId: string,
    fromId: string,
    toId: string,
    captured: CoreQualifiedTtrRead,
    handoff: (lease: CoreTtrPublicationLease) => undefined,
  ): Promise<CoreTtrPublicationResult> {
    const context = Object.freeze({ ...ctx });
    let handedOff = false;
    return withAccountApplyGate(
      async () => {
        let current: CoreTtrReadResult | undefined;
        try {
          await database.withTransactionAsync(async () => {
            current = await ttrWithinTransaction(context, orderId, fromId, toId);
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (
            [
              "CORE_ACCESS_REVOKED",
              "CORE_READ_ACCESS_MISMATCH",
              "CORE_PERSON_BINDING_MISMATCH",
              "Account changed during Ledger request.",
            ].includes(message)
          )
            return { status: "UNAVAILABLE", reason: "ACCESS_UNAVAILABLE" } as const;
          throw error;
        }
        if (!current)
          return { status: "UNAVAILABLE", reason: "CONTINUITY_UNKNOWN" } as const;
        if (current.status === "UNAVAILABLE")
          return { status: "UNAVAILABLE", reason: current.reason } as const;
        if (
          current.authority.collection.applied_generation !==
          current.authority.refreshGeneration
        )
          return { status: "STALE", reason: "REFRESH_PENDING" } as const;
        if (
          canonicalCoreJson(current as unknown as Json) !==
          canonicalCoreJson(captured as unknown as Json)
        )
          return { status: "STALE", reason: "AUTHORITY_CHANGED" } as const;
        const envelope = structuredClone(current);
        const token = ttrFence(database, context);
        const isCurrent = () => {
          try {
            assertAccountRequestGeneration(context);
          } catch {
            return false;
          }
          return ttrFence(database, context) === token;
        };
        const lease: CoreTtrPublicationLease = Object.freeze({
          get envelope() {
            return structuredClone(envelope);
          },
          isCurrent,
          ifCurrent(emit: () => undefined) {
            if (!isCurrent()) return false;
            if (emit() !== undefined) throw new Error("CORE_TTR_ASYNC_HANDOFF_FORBIDDEN");
            return true;
          },
        });
        return { status: "CURRENT", lease } as const;
      },
      (result) => {
        if (result.status === "CURRENT")
          handedOff = result.lease.ifCurrent(() => handoff(result.lease));
      },
    ).then((result) =>
      result.status === "CURRENT"
        ? handedOff
          ? { status: "CURRENT" as const }
          : { status: "UNAVAILABLE" as const, reason: "ACCESS_UNAVAILABLE" as const }
        : result,
    );
  }
  // Caller must hold the Account apply gate and the database transaction.
  async function enqueueWithinTransaction(
    ctx: AccountRequestContext,
    input: unknown,
    createdAt = clock(),
  ) {
    const command = validateCoreCommand(input);
    if (command.tripId !== ctx.tripId) throw new Error("CORE_SCOPE_MISMATCH");
    const text = canonicalCoreJson(command as Json),
      digest = await coreHashValue("otr-trip-core-intent-v2", command, hash);
    await assertContext(ctx);
    await scope(ctx);
    const prior = await database.getFirstAsync<{ intent_sha256: string }>(
      "SELECT intent_sha256 FROM trip_core_pending_intents WHERE account_id=? AND operation_id=?",
      ctx.accountId,
      command.operationId,
    );
    if (prior) {
      if (prior.intent_sha256 !== digest) throw new Error("OPERATION_REUSE_MISMATCH");
      return {
        localStatus: "PENDING" as const,
        itemId: command.target.id,
        operationId: command.operationId,
      };
    }
    // Predictions replay by (created_at, operation_id), including same-tick field saves.
    const latest = await database.getFirstAsync<{ created_at: string }>(
      "SELECT created_at FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? ORDER BY created_at DESC,operation_id DESC LIMIT 1",
      ctx.accountId,
      ctx.tripId,
    );
    const orderedAt = new Date(
      Math.max(Date.parse(createdAt), latest ? Date.parse(latest.created_at) + 1 : 0),
    ).toISOString();
    await database.runAsync(
      "INSERT INTO trip_core_pending_intents(account_id,trip_id,operation_id,intent_version,canonical_intent_text,intent_sha256,base_vector,queue_operation_id,created_at,state) VALUES(?,?,?,2,?,?,?,?,?,'BLOCKED')",
      ctx.accountId,
      ctx.tripId,
      command.operationId,
      text,
      digest,
      canonicalCoreJson(command.baseVector as Json),
      command.operationId,
      orderedAt,
    );
    await createSyncOperationRepository(database, getAccountId, () => orderedAt).enqueue({
      id: command.operationId,
      tripId: ctx.tripId,
      entityType: "TRIP_CORE_V2",
      entityId: command.target.id,
      operationType: "CORE_V2_COMMAND",
      idempotencyKey: command.operationId,
      baseVersion: command.baseVector.find(
        (v) => v.kind === command.target.kind && v.id === command.target.id,
      )!.revision,
      payloadJson: text,
      status: "DEPENDENCY_BLOCKED",
      nextAttemptAt: null,
    });
    await assertContext(ctx);
    return {
      localStatus: "PENDING" as const,
      itemId: command.target.id,
      operationId: command.operationId,
    };
  }
  async function enqueue(ctx: AccountRequestContext, input: unknown) {
    let result: Awaited<ReturnType<typeof enqueueWithinTransaction>>;
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        result = await enqueueWithinTransaction(ctx, input);
      });
    });
    return result!;
  }
  // Both preparation reads and post-write verification share this owning transaction.
  async function commitManualBatch<T>(
    ctx: AccountRequestContext,
    prepare: () => Promise<{ commands: readonly unknown[]; result(): Promise<T> }>,
  ): Promise<T> {
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let result!: T;
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const prepared = await prepare();
        if (prepared.commands.length > 5) throw new Error("MANUAL_BATCH_INVALID");
        const commands = prepared.commands.map(validateCoreCommand);
        if (
          commands.some(
            (c) =>
              c.tripId !== ctx.tripId ||
              c.target.kind !== "ITEM" ||
              c.admission.mode !== "MANUAL" ||
              ![
                "CREATE_ITEM",
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PLACE",
                "SET_ITEM_PARTICIPATION",
                "SET_STAY_DETAILS",
                "SET_RENTAL_DETAILS",
                "SET_TRANSPORT_DETAILS",
              ].includes(c.command) ||
              (c.command === "CREATE_ITEM" &&
                !["P1", "P3", "P4", "P5"].includes(
                  (c.payload as { family: string }).family,
                )),
          ) ||
          new Set(commands.map((c) => c.target.id)).size > 1
        )
          throw new Error("MANUAL_BATCH_INVALID");
        if (commands.length) {
          const creation = commands.find((c) => c.command === "CREATE_ITEM");
          let family: unknown;
          if (creation) {
            if (
              commands[0] !== creation ||
              commands.filter((c) => c.command === "CREATE_ITEM").length !== 1
            )
              throw new Error("MANUAL_BATCH_INVALID");
            family = (creation.payload as { family: string }).family;
          } else {
            const snapshot = await readLocalManualSnapshotWithinTransaction(
              database,
              getAccountId,
              { manualReadSnapshot },
              ctx,
              await acceptedWithinTransaction(ctx),
            );
            family = snapshot?.graph.itinerary_events.find(
              (r) => r.id === commands[0].target.id,
            )?.experience_family;
          }
          if (
            !["P1", "P3", "P4", "P5"].includes(String(family)) ||
            (family !== "P3" && commands.some((c) => c.command === "SET_STAY_DETAILS")) ||
            (family !== "P4" &&
              commands.some((c) => c.command === "SET_RENTAL_DETAILS")) ||
            (family !== "P5" &&
              commands.some((c) => c.command === "SET_TRANSPORT_DETAILS")) ||
            (family === "P5" &&
              commands.some((c) =>
                ["SET_ITEM_SCHEDULE", "SET_ITEM_PLACE"].includes(c.command),
              ))
          )
            throw new Error("MANUAL_BATCH_INVALID");
        }
        for (const command of commands) await enqueueWithinTransaction(ctx, command);
        result = await prepared.result();
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return result;
    });
  }
  async function pending(ctx: AccountRequestContext) {
    await assertContext(ctx);
    await scope(ctx);
    const rows = await database.getAllAsync<{
      canonical_intent_text: string;
      state: string;
      created_at: string;
      reconciled_revision: number | null;
    }>(
      "SELECT canonical_intent_text,state,created_at,reconciled_revision FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? AND reconciled_revision IS NULL ORDER BY created_at,operation_id",
      ctx.accountId,
      ctx.tripId,
    );
    await assertContext(ctx);
    return rows.map((r) => ({
      ...r,
      command: validateCoreCommand(JSON.parse(r.canonical_intent_text)),
    }));
  }
  async function beginRefresh(
    ctx: AccountRequestContext,
    accessRevision: number,
  ): Promise<CoreRefresh> {
    if (!Number.isSafeInteger(accessRevision) || accessRevision < 1)
      throw new Error("INVALID_ACCESS_REVISION");
    let generation = 0;
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      ttrFence(database, ctx, true);
      await database.withTransactionAsync(async () => {
        const current = await scope(ctx);
        if (current && accessRevision < current.access_revision)
          throw new Error("STALE_ACCESS_REVISION");
        generation = (current?.refresh_generation ?? 0) + 1;
        if (!Number.isSafeInteger(generation)) throw new Error("GENERATION_OVERFLOW");
        await database.runAsync(
          "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,?,?,0) ON CONFLICT(account_id,trip_id) DO UPDATE SET refresh_generation=excluded.refresh_generation,access_revision=excluded.access_revision",
          ctx.accountId,
          ctx.tripId,
          generation,
          accessRevision,
        );
      });
    });
    return { ...ctx, refreshGeneration: generation, accessRevision };
  }
  async function install(ctx: CoreRefresh, manifest: unknown, pages: unknown[]) {
    const validated = await validateCoreReadCollection(
      manifest,
      pages,
      ctx.accountId,
      ctx.tripId,
      hash,
    );
    if (validated.manifest.accessRevision !== ctx.accessRevision)
      throw new Error("CORE_READ_ACCESS_MISMATCH");
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      ttrFence(database, ctx, true);
      await database.withTransactionAsync(async () => {
        const current = await scope(ctx);
        if (
          !current ||
          current.refresh_generation !== ctx.refreshGeneration ||
          current.access_revision !== ctx.accessRevision
        )
          throw new Error("CORE_READ_SUPERSEDED");
        const old = await database.getFirstAsync<{ epoch: string; revision: number }>(
          "SELECT epoch,revision FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
          ctx.accountId,
          ctx.tripId,
        );
        if (
          old &&
          (old.epoch !== validated.manifest.epoch ||
            old.revision > validated.manifest.revision)
        )
          throw new Error("CORE_READ_EPOCH_OR_REVISION_MISMATCH");
        for (const [table, schema] of Object.entries(coreTableSchemas)) {
          if (
            table === "trip_person_ordinary_orders" &&
            validated.manifest.ordinaryOrderVersion !== 1
          )
            continue;
          await database.runAsync(
            `DELETE FROM trip_core_${table} WHERE cache_account_id=? AND ${table === "expense_links" ? "journey_id" : "trip_id"}=?`,
            ctx.accountId,
            ctx.tripId,
          );
          const fields = Object.keys(schema.shape);
          for (const row of validated.graph[table as CoreTable])
            await database.runAsync(
              `INSERT INTO trip_core_${table}(cache_account_id,mirror_key,${fields.map((k) => '"' + k + '"').join(",")}) VALUES(${Array(
                fields.length + 2,
              )
                .fill("?")
                .join(",")})`,
              ctx.accountId,
              coreMirrorKey(table as CoreTable, row),
              ...fields.map((k) =>
                encode(schema.shape[k as keyof typeof schema.shape], row[k]),
              ),
            );
        }
        const m = validated.manifest;
        await database.runAsync(
          "DELETE FROM trip_core_person_bindings WHERE account_id=? AND trip_id=?",
          ctx.accountId,
          ctx.tripId,
        );
        for (const binding of validated.bindings)
          await database.runAsync(
            "INSERT INTO trip_core_person_bindings(account_id,trip_id,person_id,linked_account_id,active,participating) VALUES(?,?,?,?,?,?)",
            ctx.accountId,
            ctx.tripId,
            binding.person_id,
            binding.account_id,
            binding.active ? 1 : 0,
            binding.participating ? 1 : 0,
          );
        await database.runAsync(
          "INSERT INTO trip_core_read_certificates(account_id,trip_id,epoch,revision,access_revision,applied_generation,actor_person_binding_hash,roster_hash,manifest_sha256,business_version,read_version,temporal_version,complete,ordinary_order_version) VALUES(?,?,?,?,?,?,?,?,?,2,2,1,1,?) ON CONFLICT(account_id,trip_id) DO UPDATE SET epoch=excluded.epoch,revision=excluded.revision,access_revision=excluded.access_revision,applied_generation=excluded.applied_generation,actor_person_binding_hash=excluded.actor_person_binding_hash,roster_hash=excluded.roster_hash,manifest_sha256=excluded.manifest_sha256,ordinary_order_version=excluded.ordinary_order_version",
          ctx.accountId,
          ctx.tripId,
          m.epoch,
          m.revision,
          m.accessRevision,
          ctx.refreshGeneration,
          m.actorPersonBindingHash,
          m.participatingRosterHash,
          m.manifestSha256,
          m.ordinaryOrderVersion ?? 0,
        );
        const receiptRows = await database.getAllAsync<{
          operation_id: string;
          body_json: string;
        }>(
          "SELECT operation_id,body_json FROM trip_core_trip_core_command_receipts WHERE account_id=? AND trip_id=?",
          ctx.accountId,
          ctx.tripId,
        );
        for (const r of receiptRows) {
          const receipt = await validateCoreReceipt(JSON.parse(r.body_json), hash);
          if (!["APPLIED", "NO_CHANGE"].includes(receipt.outcome)) continue;
          const material = [...receipt.result.created, ...receipt.result.changed];
          const covered = receipt.targetVector
            .filter((v) => material.some((r) => r.kind === v.kind && r.id === v.id))
            .every(
              (v) =>
                v.committedRevision !== null &&
                validated.records.some(
                  (record) =>
                    record.kind === v.kind &&
                    record.id === v.id &&
                    record.revision >= v.committedRevision!,
                ),
            );
          if (covered)
            await database.runAsync(
              "UPDATE trip_core_pending_intents SET reconciled_revision=? WHERE account_id=? AND trip_id=? AND operation_id=?",
              m.revision,
              ctx.accountId,
              ctx.tripId,
              r.operation_id,
            );
        }
        await assertContext(ctx);
      });
    });
    return validated;
  }
  async function applyReceipt(ctx: AccountRequestContext, input: unknown) {
    const receipt = await validateCoreReceipt(input, hash);
    if (receipt.actorAccountId !== ctx.accountId || receipt.tripId !== ctx.tripId)
      throw new Error("CORE_RECEIPT_SCOPE_MISMATCH");
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const intent = await database.getFirstAsync<{ intent_sha256: string }>(
          "SELECT intent_sha256 FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? AND operation_id=?",
          ctx.accountId,
          ctx.tripId,
          receipt.operationId,
        );
        if (!intent || intent.intent_sha256 !== receipt.intentSha256)
          throw new Error("CORE_RECEIPT_INTENT_MISMATCH");
        const prior = await database.getFirstAsync<{ receipt_sha256: string }>(
          "SELECT receipt_sha256 FROM trip_core_trip_core_command_receipts WHERE account_id=? AND operation_id=?",
          ctx.accountId,
          receipt.operationId,
        );
        if (prior) {
          if (prior.receipt_sha256 !== receipt.receiptSha256)
            throw new Error("CORE_RECEIPT_REUSE_MISMATCH");
          return;
        }
        await database.runAsync(
          "INSERT INTO trip_core_trip_core_command_receipts(account_id,trip_id,operation_id,intent_sha256,receipt_sha256,body_json,receipt_version) VALUES(?,?,?,?,?,?,2)",
          ctx.accountId,
          ctx.tripId,
          receipt.operationId,
          receipt.intentSha256,
          receipt.receiptSha256,
          canonicalCoreJson(receipt as Json),
        );
        await database.runAsync(
          "UPDATE trip_core_pending_intents SET state=? WHERE account_id=? AND trip_id=? AND operation_id=?",
          receipt.outcome === "REJECTED"
            ? "REVIEW"
            : receipt.outcome === "CONFLICT"
              ? "CONFLICT"
              : "APPLIED",
          ctx.accountId,
          ctx.tripId,
          receipt.operationId,
        );
        await assertContext(ctx);
      });
    });
    return receipt;
  }
  async function revoke(ctx: AccountRequestContext, accessRevision: number) {
    if (!Number.isSafeInteger(accessRevision) || accessRevision < 1)
      throw new Error("INVALID_ACCESS_REVISION");
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      ttrFence(database, ctx, true);
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,?,1) ON CONFLICT(account_id,trip_id) DO UPDATE SET revoked=1,refresh_generation=refresh_generation+1,access_revision=MAX(access_revision,excluded.access_revision)",
          ctx.accountId,
          ctx.tripId,
          accessRevision,
        );
        await database.runAsync(
          "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED' WHERE owner_user_id=? AND trip_id=? AND operation_type='CORE_V2_COMMAND' AND status<>'COMPLETED'",
          ctx.accountId,
          ctx.tripId,
        );
      });
    });
  }
  async function projection(
    ctx: AccountRequestContext,
    actor: CoreActor,
    committed?: ReadonlySet<string>,
    certifiedBase = true,
  ) {
    if (actor.accountId !== ctx.accountId || actor.tripId !== ctx.tripId)
      throw new Error("CORE_SCOPE_MISMATCH");
    const graph = await readGraph(ctx);
    const cert = await database.getFirstAsync<CoreAcceptedCertificate>(
      "SELECT * FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    if (committed && !certifiedBase) Object.assign(graph, emptyCoreGraph());
    let participatingPersonIds: string[] = [];
    if (cert && (!committed || certifiedBase)) {
      const bindings = await database.getAllAsync<{
        person_id: string;
        linked_account_id: string | null;
        active: number;
        participating: number;
      }>(
        "SELECT person_id,linked_account_id,active,participating FROM trip_core_person_bindings WHERE account_id=? AND trip_id=?",
        ctx.accountId,
        ctx.tripId,
      );
      participatingPersonIds = bindings
        .filter((b) => b.active && b.participating)
        .map((b) => b.person_id);
      const own = bindings.filter(
        (b) => b.active && b.linked_account_id === ctx.accountId,
      );
      if (actor.personId !== null && !own.some((b) => b.person_id === actor.personId))
        throw new Error("CORE_PERSON_BINDING_MISMATCH");
      if (
        actor.personIds.some(
          (id) => !bindings.some((b) => b.active && b.person_id === id),
        )
      )
        throw new Error("CORE_PERSON_BINDING_MISMATCH");
    }
    const predictedIds = new Set<string>();
    for (const intent of await pending(ctx)) {
      if (
        (committed && !committed.has(intent.command.operationId)) ||
        intent.state === "CONFLICT" ||
        intent.state === "REVIEW" ||
        intent.command.admission.mode !== "MANUAL"
      )
        continue;
      try {
        const predicted = applyCoreCommand(
          graph,
          intent.command,
          actor,
          intent.created_at,
          false,
          undefined,
          true,
        );
        Object.assign(graph, predicted.graph);
        for (const changed of predicted.changed)
          if (changed.kind === "ITEM") predictedIds.add(changed.id);
      } catch {
        /* Accepted facts and conflicting intent remain separately durable. */
      }
    }
    await assertContext(ctx);
    return { graph, cert, predictedIds, participatingPersonIds };
  }
  // Read-only local authority: only durable MANUAL intents with their owning queue pin.
  async function manualReadSnapshot(
    ctx: AccountRequestContext,
    actor: CoreActor,
    certifiedBase = false,
  ) {
    await assertContext(ctx);
    const rows = await database.getAllAsync<{
      operation_id: string;
      canonical_intent_text: string;
      intent_sha256: string;
      state: string;
      queue_id: string | null;
      payload_json: string | null;
      entity_id: string | null;
      idempotency_key: string | null;
      queue_status: string | null;
      receipt_body: string | null;
      receipt_sha256: string | null;
    }>(
      `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,i.state,
       op.id AS queue_id,op.payload_json,op.entity_id,op.idempotency_key,op.status AS queue_status,
       r.body_json AS receipt_body,r.receipt_sha256
       FROM trip_core_pending_intents i LEFT JOIN sync_operations op
       ON op.id=i.queue_operation_id AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id
       AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
       WHERE i.account_id=? AND i.trip_id=? AND i.reconciled_revision IS NULL
       AND i.state IN ('BLOCKED','PENDING','IN_FLIGHT','APPLIED') ORDER BY i.created_at,i.operation_id`,
      ctx.accountId,
      ctx.tripId,
    );
    const operations: {
      operationId: string;
      sha256: string;
      state: string;
      receiptSha256?: string;
    }[] = [];
    for (const row of rows) {
      const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
      if (command.admission.mode !== "MANUAL") continue;
      if (
        command.tripId !== ctx.tripId ||
        command.operationId !== row.operation_id ||
        row.queue_id !== row.operation_id ||
        row.idempotency_key !== row.operation_id ||
        row.entity_id !== command.target.id ||
        row.payload_json !== row.canonical_intent_text ||
        (await coreHashValue("otr-trip-core-intent-v2", command, hash)) !==
          row.intent_sha256
      )
        throw new Error("LOCAL_MANUAL_COMMIT_PIN");
      const activeQueue = [
        "PENDING",
        "DEPENDENCY_BLOCKED",
        "PROCESSING",
        "RETRYABLE",
      ].includes(row.queue_status ?? "");
      if (!activeQueue && !(row.state === "APPLIED" && row.queue_status === "COMPLETED"))
        throw new Error("LOCAL_MANUAL_COMMIT_PIN");
      let receiptSha256: string | undefined;
      if (row.state === "APPLIED") {
        if (!row.receipt_body) throw new Error("LOCAL_MANUAL_RECEIPT_PIN");
        const receipt = await validateCoreReceipt(JSON.parse(row.receipt_body), hash);
        if (
          receipt.actorAccountId !== ctx.accountId ||
          receipt.tripId !== ctx.tripId ||
          receipt.operationId !== row.operation_id ||
          receipt.intentSha256 !== row.intent_sha256 ||
          receipt.receiptSha256 !== row.receipt_sha256 ||
          receipt.command !== command.command ||
          !["APPLIED", "NO_CHANGE"].includes(receipt.outcome)
        )
          throw new Error("LOCAL_MANUAL_RECEIPT_PIN");
        receiptSha256 = receipt.receiptSha256;
      }
      operations.push({
        operationId: row.operation_id,
        sha256: row.intent_sha256,
        state: row.state,
        ...(receiptSha256 ? { receiptSha256 } : {}),
      });
    }
    const projected = await projection(
      ctx,
      actor,
      new Set(operations.map((o) => o.operationId)),
      certifiedBase,
    );
    const fingerprint = await coreHashValue(
      "otr-local-manual-read-v1",
      {
        operations,
        actor,
        certificate: projected.cert ?? null,
      },
      hash,
    );
    await assertContext(ctx);
    return { ...projected, operations, fingerprint };
  }
  async function item(ctx: AccountRequestContext, actor: CoreActor, itemId: string) {
    const p = await projection(ctx, actor);
    return projectCoreItem(
      p.graph,
      actor,
      itemId,
      {
        rosterHash: p.cert?.roster_hash,
        participatingPersonIds: p.participatingPersonIds,
      },
      p.predictedIds.has(itemId) ? "PENDING" : "ACCEPTED",
    );
  }
  async function refresh(ctx: AccountRequestContext, transport: CoreReadTransport) {
    await assertContext(ctx);
    await scope(ctx);
    const result = await transport.collection(ctx);
    await assertContext(ctx);
    return install(
      await beginRefresh(ctx, result.manifest.accessRevision),
      result.manifest,
      result.pages,
    );
  }
  async function resume(ctx: AccountRequestContext) {
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await scope(ctx);
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "UPDATE sync_operations SET status='PENDING',next_attempt_at=NULL WHERE owner_user_id=? AND trip_id=? AND operation_type='CORE_V2_COMMAND' AND status='DEPENDENCY_BLOCKED' AND id IN (SELECT queue_operation_id FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? AND state IN ('BLOCKED','PENDING','IN_FLIGHT'))",
          ctx.accountId,
          ctx.tripId,
          ctx.accountId,
          ctx.tripId,
        );
        await assertContext(ctx);
      });
    });
  }
  async function day(ctx: AccountRequestContext, actor: CoreActor, date: string) {
    const { graph, cert, predictedIds } = await projection(ctx, actor);
    return projectCoreDay(graph, actor, date, cert?.applied_generation ?? 0).map(
      (row) => ({
        row: {
          ...row,
          certificateGeneration: predictedIds.has(row.itemRef)
            ? 0
            : row.certificateGeneration,
        },
        localState: predictedIds.has(row.itemRef)
          ? ("PENDING" as const)
          : ("ACCEPTED" as const),
      }),
    );
  }
  return {
    captureContext,
    readGraph,
    manualReadSnapshot,
    acceptedSnapshot,
    // Caller must hold the Account apply gate and the database transaction.
    readAcceptedSnapshotWithinTransaction: acceptedWithinTransaction,
    readTtr,
    guardTtrPublication,
    ttrWithinTransaction,
    revalidateTtrWithinTransaction,
    acceptedTripIds,
    item,
    refresh,
    resume,
    enqueue,
    commitManualBatch,
    pending,
    beginRefresh,
    install,
    applyReceipt,
    revoke,
    day,
  };
}
