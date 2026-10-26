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
import { coreUuid, coreTableSchemas, type CoreTable } from "../../domain/trip/tripCoreV2";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import {
  coreHashValue,
  validateCoreReadCollection,
} from "../../domain/trip/tripCoreV2Read";
import type { CoreReceiptProjection } from "../../domain/trip/tripCoreV2Receipt";
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
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
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
  const queue = createSyncOperationRepository(database, getAccountId, clock);
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
  async function enqueue(ctx: AccountRequestContext, input: unknown) {
    const command = validateCoreCommand(input);
    if (command.tripId !== ctx.tripId) throw new Error("CORE_SCOPE_MISMATCH");
    const text = canonicalCoreJson(command as Json),
      digest = await coreHashValue("otr-trip-core-intent-v2", command, hash);
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const prior = await database.getFirstAsync<{ intent_sha256: string }>(
          "SELECT intent_sha256 FROM trip_core_pending_intents WHERE account_id=? AND operation_id=?",
          ctx.accountId,
          command.operationId,
        );
        if (prior) {
          if (prior.intent_sha256 !== digest) throw new Error("OPERATION_REUSE_MISMATCH");
          return;
        }
        await database.runAsync(
          "INSERT INTO trip_core_pending_intents(account_id,trip_id,operation_id,intent_version,canonical_intent_text,intent_sha256,base_vector,queue_operation_id,created_at,state) VALUES(?,?,?,2,?,?,?,?,?,'BLOCKED')",
          ctx.accountId,
          ctx.tripId,
          command.operationId,
          text,
          digest,
          canonicalCoreJson(command.baseVector as Json),
          command.operationId,
          clock(),
        );
        await queue.enqueue({
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
      });
    });
    announceLedgerQueueWorkAvailable();
    return {
      localStatus: "PENDING" as const,
      itemId: command.target.id,
      operationId: command.operationId,
    };
  }
  async function pending(ctx: AccountRequestContext, retainedOperationId?: string) {
    if (retainedOperationId !== undefined) coreUuid.parse(retainedOperationId);
    await assertContext(ctx);
    await scope(ctx);
    const rows = await database.getAllAsync<{
      canonical_intent_text: string;
      state: string;
      created_at: string;
      reconciled_revision: number | null;
    }>(
      "SELECT canonical_intent_text,state,created_at,reconciled_revision FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? AND (reconciled_revision IS NULL OR operation_id=?) ORDER BY created_at,operation_id",
      ctx.accountId,
      ctx.tripId,
      retainedOperationId ?? null,
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
  // Lost-response recovery is read-only remotely. A future write retry is never made due early.
  async function recoverP1Receipts(
    ctx: AccountRequestContext,
    transport: CoreReadTransport & {
      receipt(
        context: AccountRequestContext,
        operationId: string,
      ): Promise<CoreReceiptProjection | null>;
    },
  ) {
    await assertContext(ctx);
    await scope(ctx);
    const rows = await database.getAllAsync<{
      operation_id: string;
      canonical_intent_text: string;
      intent_sha256: string;
      queue_id: string;
      entity_id: string;
      idempotency_key: string;
      payload_json: string;
    }>(
      `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,op.id AS queue_id,op.entity_id,op.idempotency_key,op.payload_json
       FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id
       WHERE i.account_id=? AND i.trip_id=? AND i.state IN ('BLOCKED','PENDING','IN_FLIGHT','APPLIED')
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND' AND op.status IN ('PENDING','RETRYABLE','DEPENDENCY_BLOCKED')
       AND op.claim_owner IS NULL AND op.attempt_count>0 AND op.failure_category IS NOT 'AUTH' ORDER BY i.created_at,i.operation_id`,
      ctx.accountId,
      ctx.tripId,
    );
    await assertContext(ctx);
    const graph = await readGraph(ctx);
    const accepted: typeof rows = [];
    for (const row of rows) {
      const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
      if (
        command.tripId !== ctx.tripId ||
        command.operationId !== row.operation_id ||
        row.queue_id !== row.operation_id ||
        row.idempotency_key !== row.operation_id ||
        command.target.kind !== "ITEM" ||
        command.target.id !== row.entity_id ||
        row.payload_json !== row.canonical_intent_text ||
        (await coreHashValue("otr-trip-core-intent-v2", command, hash)) !==
          row.intent_sha256
      )
        throw Error("CORE_RECOVERY_QUEUE_PIN");
      const p1 =
        command.command === "CREATE_ITEM"
          ? (command.payload as { family: string }).family === "P1"
          : [
              "SET_ITEM_TEXT",
              "SET_ITEM_SCHEDULE",
              "SET_ITEM_PLACE",
              "SET_ITEM_PARTICIPATION",
            ].includes(command.command) &&
            graph.itinerary_events.some(
              (item) => item.id === command.target.id && item.experience_family === "P1",
            );
      if (!p1 || command.admission.mode !== "MANUAL") continue;
      const result = await transport.receipt(ctx, command.operationId);
      await assertContext(ctx);
      if (
        !result ||
        result.projection !== "FULL" ||
        !["APPLIED", "NO_CHANGE"].includes(result.receipt.outcome)
      )
        continue;
      if (result.receipt.operationId !== command.operationId)
        throw Error("CORE_RECOVERY_RECEIPT_PIN");
      await applyReceipt(ctx, result.receipt);
      accepted.push(row);
    }
    if (!accepted.length) return { recovered: 0 };
    // Only a fully hashed authorized collection may prove canonical target revisions and remove optimistic intent.
    await refresh(ctx, transport);
    let recovered = 0;
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        for (const row of accepted) {
          const current = await database.getFirstAsync<{
            reconciled_revision: number | null;
            body_json: string;
            intent_sha256: string;
          }>(
            `SELECT i.reconciled_revision,i.intent_sha256,r.body_json FROM trip_core_pending_intents i
             JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
             WHERE i.account_id=? AND i.trip_id=? AND i.operation_id=? AND i.state='APPLIED'`,
            ctx.accountId,
            ctx.tripId,
            row.operation_id,
          );
          if (
            !current ||
            current.reconciled_revision === null ||
            current.intent_sha256 !== row.intent_sha256
          )
            continue;
          const receipt = await validateCoreReceipt(JSON.parse(current.body_json), hash);
          if (
            receipt.actorAccountId !== ctx.accountId ||
            receipt.tripId !== ctx.tripId ||
            receipt.operationId !== row.operation_id ||
            receipt.intentSha256 !== row.intent_sha256 ||
            !["APPLIED", "NO_CHANGE"].includes(receipt.outcome)
          )
            throw Error("CORE_RECOVERY_RECEIPT_PIN");
          const update = await database.runAsync(
            `UPDATE sync_operations SET status='COMPLETED',next_attempt_at=NULL,failure_category=NULL,last_error_code=NULL,last_error_message=NULL,last_request_id=NULL,lease_expires_at=NULL,updated_at=?
            WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='TRIP_CORE_V2' AND operation_type='CORE_V2_COMMAND'
            AND entity_id=? AND idempotency_key=? AND payload_json=? AND status IN ('PENDING','RETRYABLE','DEPENDENCY_BLOCKED') AND claim_owner IS NULL AND failure_category IS NOT 'AUTH'`,
            clock(),
            row.operation_id,
            ctx.accountId,
            ctx.tripId,
            row.entity_id,
            row.operation_id,
            row.canonical_intent_text,
          );
          recovered += update.changes;
        }
        await assertContext(ctx);
      });
    });
    return { recovered };
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
  async function projection(ctx: AccountRequestContext, actor: CoreActor) {
    if (actor.accountId !== ctx.accountId || actor.tripId !== ctx.tripId)
      throw new Error("CORE_SCOPE_MISMATCH");
    const graph = await readGraph(ctx);
    const cert = await database.getFirstAsync<{
      applied_generation: number;
      roster_hash: string;
    }>(
      "SELECT applied_generation,roster_hash FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    let participatingPersonIds: string[] = [];
    if (cert) {
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
  async function resume(ctx: AccountRequestContext, operationId?: string) {
    if (operationId) coreUuid.parse(operationId);
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await scope(ctx);
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "UPDATE sync_operations SET status='PENDING',next_attempt_at=NULL WHERE owner_user_id=? AND trip_id=? AND operation_type='CORE_V2_COMMAND' AND status='DEPENDENCY_BLOCKED' AND id IN (SELECT queue_operation_id FROM trip_core_pending_intents WHERE account_id=? AND trip_id=? AND state IN ('BLOCKED','PENDING','IN_FLIGHT')) AND (? IS NULL OR id=?)",
          ctx.accountId,
          ctx.tripId,
          ctx.accountId,
          ctx.tripId,
          operationId ?? null,
          operationId ?? null,
        );
        const accepted = await database.getAllAsync<{
          operation_id: string;
          canonical_intent_text: string;
          intent_sha256: string;
          receipt_body: string | null;
          receipt_sha256: string | null;
        }>(
          "SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,r.body_json AS receipt_body,r.receipt_sha256 FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256 WHERE i.account_id=? AND i.trip_id=? AND i.state='APPLIED' AND op.status='DEPENDENCY_BLOCKED' AND op.operation_type='CORE_V2_COMMAND' AND op.entity_type='TRIP_CORE_V2' AND op.id=i.operation_id AND (? IS NULL OR i.operation_id=?)",
          ctx.accountId,
          ctx.tripId,
          operationId ?? null,
          operationId ?? null,
        );
        for (const row of accepted) {
          const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
          if (
            command.command !== "CREATE_ITEM" ||
            (command.payload as { family?: string }).family !== "P1" ||
            command.admission.mode !== "REVIEWED_SOURCE" ||
            !row.receipt_body ||
            !row.receipt_sha256
          )
            continue;
          const receipt = await validateCoreReceipt(JSON.parse(row.receipt_body), hash);
          const digest = await coreHashValue("otr-trip-core-intent-v2", command, hash);
          if (
            command.operationId !== row.operation_id ||
            command.tripId !== ctx.tripId ||
            receipt.operationId !== row.operation_id ||
            receipt.actorAccountId !== ctx.accountId ||
            receipt.tripId !== ctx.tripId ||
            receipt.command !== command.command ||
            receipt.intentSha256 !== digest ||
            row.intent_sha256 !== digest ||
            receipt.receiptSha256 !== row.receipt_sha256 ||
            !["APPLIED", "NO_CHANGE"].includes(receipt.outcome)
          )
            continue;
          await assertContext(ctx);
          // This accepted Source operation can retry finalization only; the worker must never resubmit it.
          await database.runAsync(
            "UPDATE sync_operations SET status='PENDING',next_attempt_at=NULL WHERE owner_user_id=? AND trip_id=? AND id=? AND status='DEPENDENCY_BLOCKED'",
            ctx.accountId,
            ctx.tripId,
            row.operation_id,
          );
        }
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
    acceptedSnapshot,
    // Caller already owns the Account apply gate and serialized transaction.
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
    pending,
    beginRefresh,
    install,
    applyReceipt,
    recoverP1Receipts,
    revoke,
    day,
  };
}
