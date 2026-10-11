import type * as SQLite from "expo-sqlite";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
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
import { coreMirrorKey } from "../../domain/trip/tripCoreV2Graph";
import { projectCoreItem } from "../../domain/trip/tripCoreV2Views";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";
import { projectCoreDay } from "../../domain/trip/tripCoreV2Day";
import type { ImportHash } from "../../domain/trip/flightImportReview";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
export type CoreDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
export type CoreRefresh = AccountRequestContext & {
  refreshGeneration: number;
  accessRevision: number;
};
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
    const accepted = await database.getFirstAsync<{ access_revision: number }>(
      "SELECT access_revision FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    const graph = emptyCoreGraph();
    if (accepted && accepted.access_revision !== currentScope?.access_revision)
      return graph;
    for (const [table, schema] of Object.entries(coreTableSchemas)) {
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
    return {
      localStatus: "PENDING" as const,
      itemId: command.target.id,
      operationId: command.operationId,
    };
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
          "INSERT INTO trip_core_read_certificates(account_id,trip_id,epoch,revision,access_revision,applied_generation,actor_person_binding_hash,roster_hash,manifest_sha256,business_version,read_version,temporal_version,complete) VALUES(?,?,?,?,?,?,?,?,?,2,2,1,1) ON CONFLICT(account_id,trip_id) DO UPDATE SET epoch=excluded.epoch,revision=excluded.revision,access_revision=excluded.access_revision,applied_generation=excluded.applied_generation,actor_person_binding_hash=excluded.actor_person_binding_hash,roster_hash=excluded.roster_hash,manifest_sha256=excluded.manifest_sha256",
          ctx.accountId,
          ctx.tripId,
          m.epoch,
          m.revision,
          m.accessRevision,
          ctx.refreshGeneration,
          m.actorPersonBindingHash,
          m.participatingRosterHash,
          m.manifestSha256,
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
    item,
    refresh,
    resume,
    enqueue,
    pending,
    beginRefresh,
    install,
    applyReceipt,
    revoke,
    day,
  };
}
