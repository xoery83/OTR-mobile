import { createUuid } from "../../domain/localId";
import {
  resolveCoreInstructionParentForSubmit,
  CoreInstructionScopeError,
} from "../../domain/trip/tripCoreInstructionParent";
import {
  createLocalCoreCommitRepository,
  type LocalCoreAuthorityDependencies,
  type LocalCoreBaseline,
  type LocalCoreSnapshot,
} from "./localCoreCommitRepository";
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
import {
  coreUuid,
  coreHash,
  coreTableSchemas,
  type CoreTable,
} from "../../domain/trip/tripCoreV2";
import {
  validateCoreCommand,
  isNormalImportCoreCommand,
  isReviewedSourceCreate,
} from "../../domain/trip/tripCoreV2Commands";
import {
  coreHashValue,
  validateCoreReadCollection,
} from "../../domain/trip/tripCoreV2Read";
import type { CoreReceiptProjection } from "../../domain/trip/tripCoreV2Receipt";
import { validateCoreReceipt } from "../../domain/trip/tripCoreV2Receipt";
import {
  emptyCoreGraph,
  applyCoreCommand,
  coreCanManage,
  type CoreActor,
  type CoreGraph,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreMirrorKey, validateCoreGraph } from "../../domain/trip/tripCoreV2Graph";
import { projectCoreItem } from "../../domain/trip/tripCoreV2Views";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";
import { projectCoreDay } from "../../domain/trip/tripCoreV2Day";
import type { ImportHash } from "../../domain/trip/flightImportReview";
import {
  createSyncOperationRepository,
  type SyncOperation,
} from "../sync/syncOperationRepository";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import { readLocalManualSnapshotWithinTransaction } from "./tripLocalManualReadRepository";
// Private negative replay fence. Never hydrate from a DTO or persisted claim.
const correctionModuleIncarnation = createUuid();
export type CoreCorrectionClaim = Readonly<{
  version: 1;
  operationId: string;
  intentSha256: string;
  claimOwner: string;
}>;
export type CoreCorrectionClaimResult =
  | { kind: "NOT_CLAIMED" }
  | { kind: "CLAIMED"; path: "CANDIDATE" | "RECEIPT_ONLY"; claim: CoreCorrectionClaim };
export type CoreCorrectionTransport = {
  receipt(
    ctx: AccountRequestContext,
    operationId: string,
  ): Promise<CoreReceiptProjection | null>;
  submit(
    ctx: AccountRequestContext,
    command: ReturnType<typeof validateCoreCommand>,
  ): Promise<CoreReceiptProjection>;
};
export type CoreCorrectionExecutionResult =
  { kind: "RECEIPT"; result: CoreReceiptProjection } | { kind: "RECEIPT_ONLY" };
type CorrectionOriginPin = {
  entryId: string;
  operationId: string;
  intentSha256: string;
  receiptSha256: string | null;
  reconciledRevision: number | null;
};
type CorrectionQueueRow = SyncOperation & {
  canonicalIntentText: string;
  intentSha256: string;
  intentState: string;
  reconciledRevision: number | null;
  receiptSha256: string | null;
  claimOwner: string | null;
  dependencyOperationId: string | null;
  lastAttemptAt: string | null;
  leaseExpiresAt: string | null;
  failureCategory: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastRequestId: string | null;
  firstFailedAt: string | null;
};
const correctionObservedKeys = [
  "id",
  "tripId",
  "entityType",
  "entityId",
  "operationType",
  "idempotencyKey",
  "baseVersion",
  "payloadJson",
  "ownerUserId",
  "status",
  "attemptCount",
  "nextAttemptAt",
  "dependencyOperationId",
  "claimOwner",
  "createdAt",
  "updatedAt",
] as const;
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
  localAuthority: Omit<
    LocalCoreAuthorityDependencies,
    "readBaselineWithinTransaction"
  > = {},
) {
  const correctionFactoryIncarnation = createUuid();
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
  async function localBaselineWithinTransaction(
    ctx: AccountRequestContext,
  ): Promise<LocalCoreBaseline | null> {
    await assertContext(ctx);
    await scope(ctx);
    const accepted = await acceptedWithinTransaction(ctx);
    const manual = await readLocalManualSnapshotWithinTransaction(
      database,
      getAccountId,
      { manualReadSnapshot },
      ctx,
      accepted,
    );
    if (!manual) return null;
    return {
      graph: accepted?.graph ?? emptyCoreGraph(),
      actor: manual.actor,
      participatingPersonIds: manual.participatingPersonIds.length
        ? manual.participatingPersonIds
        : [...manual.actor.personIds],
      certificate: accepted?.certificate ?? null,
    };
  }
  const localCommits = createLocalCoreCommitRepository(
    database,
    getAccountId,
    hash,
    {
      ...localAuthority,
      readBaselineWithinTransaction: localBaselineWithinTransaction,
    },
    () => clock().replace(/\.(\d{3})Z$/, ".$1000Z"),
  );
  async function readLocalCombinedWithinTransaction(ctx: AccountRequestContext) {
    if (
      !("isInTransactionAsync" in database) ||
      typeof database.isInTransactionAsync !== "function" ||
      !(await database.isInTransactionAsync())
    )
      throw new Error("LOCAL_SOURCE_TRANSACTION_CAPABILITY_UNAVAILABLE");
    await assertContext(ctx);
    const baseline = await localBaselineWithinTransaction(ctx);
    if (!baseline) return null;
    const snapshot = await localCommits.readCommittedWithinTransaction(ctx, baseline);
    await assertContext(ctx);
    return snapshot;
  }
  async function combinedSnapshot(
    ctx: AccountRequestContext,
  ): Promise<LocalCoreSnapshot | null> {
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let result: Awaited<
        ReturnType<typeof localCommits.readCommittedWithinTransaction>
      > | null = null;
      await database.withTransactionAsync(async () => {
        const baseline = await localBaselineWithinTransaction(ctx);
        if (!baseline) return;
        const snapshot = await localCommits.readCommittedWithinTransaction(ctx, baseline);
        if (snapshot.certificate || snapshot.localRevision) result = snapshot;
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return result;
    });
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
            return {
              status: "UNAVAILABLE",
              reason: "ACCESS_UNAVAILABLE",
            } as const;
          throw error;
        }
        if (!current)
          return {
            status: "UNAVAILABLE",
            reason: "CONTINUITY_UNKNOWN",
          } as const;
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
          : {
              status: "UNAVAILABLE" as const,
              reason: "ACCESS_UNAVAILABLE" as const,
            }
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
    await assertContext(ctx);
    announceLedgerQueueWorkAvailable();
    return result!;
  }
  async function enqueueConfirmedItemDocuments(ctx: AccountRequestContext, inputs: readonly unknown[]) {
    const commands = inputs.map(validateCoreCommand);
    const link = commands.at(-1);
    const flightDetails = commands[0]?.command === "CREATE_SPARSE_FLIGHT" &&
      commands[1]?.command === "SET_AUTHORED_FLIGHT_DETAILS";
    if (
      commands.length < 1 || commands.length > (flightDetails ? 8 : 7) ||
      new Set(commands.map((command) => command.operationId)).size !== commands.length ||
      link?.command !== "RECONCILE_ITEM_DOCUMENTS" ||
      commands.some((command) => command.tripId !== ctx.tripId || (command.admission.mode !== "MANUAL" && !isNormalImportCoreCommand(command))) ||
      commands.slice(0, -1).some((command, index) =>
        command.command !== "CREATE_DOCUMENT_METADATA" &&
        !(flightDetails && index === 1 && command.target.id === link.target.id &&
          command.baseVector.length === 1 && command.baseVector[0].kind === "ITEM" &&
          command.baseVector[0].id === link.target.id && command.baseVector[0].revision === 1) &&
        (index !== 0 || command.target.id !== link.target.id ||
          !["CREATE_ITEM", "CREATE_SPARSE_FLIGHT", "SET_ITEM_TEXT"].includes(command.command)))
    ) throw Error("CORE_REVIEWED_DOCUMENT_COMMANDS");
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        for (const command of commands) await enqueueWithinTransaction(ctx, command);
      });
    });
    await assertContext(ctx);
    announceLedgerQueueWorkAvailable();
    return commands.map(({ operationId }) => operationId);
  }
  async function manualInstructionOriginWithinTransaction(
    ctx: AccountRequestContext,
    snapshot: Pick<
      NonNullable<Awaited<ReturnType<typeof readLocalManualSnapshotWithinTransaction>>>,
      "graph" | "cert" | "operations"
    >,
    acceptedIds: ReadonlySet<string>,
    entryId: string,
    proof?: CorrectionOriginPin[],
  ) {
    const seen = new Set<string>();
    let id: string | null = entryId;
    while (id !== null) {
      if (seen.has(id)) return false;
      seen.add(id);
      const entry = snapshot.graph.trip_instruction_entries.find((r) => r.id === id);
      const state = entry?.field_state as Record<string, { origin?: string }> | undefined;
      if (
        !entry ||
        entry.owner_account_id !== ctx.accountId ||
        entry.source_representation_id !== null ||
        state?.["trip_instruction_entries.body"]?.origin !== "MANUAL"
      )
        return false;
      const rows = await database.getAllAsync<{
        operation_id: string;
        canonical_intent_text: string;
        intent_sha256: string;
        state: string;
        reconciled_revision: number | null;
        receipt_body: string | null;
        receipt_sha256: string | null;
      }>(
        `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,i.state,i.reconciled_revision,
         r.body_json AS receipt_body,r.receipt_sha256 FROM trip_core_pending_intents i
         LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id
         AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
         WHERE i.account_id=? AND i.trip_id=? AND
         ((json_extract(i.canonical_intent_text,'$.command')='APPEND_INSTRUCTION'
           AND json_extract(i.canonical_intent_text,'$.target.id')=?) OR
          (json_extract(i.canonical_intent_text,'$.command')='CORRECT_INSTRUCTION'
           AND json_extract(i.canonical_intent_text,'$.payload.newEntryId')=?))`,
        ctx.accountId,
        ctx.tripId,
        id,
        id,
      );
      let origin: ReturnType<typeof validateCoreCommand> | undefined;
      for (const row of rows) {
        const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
        const payload = command.payload as {
          itemId?: string;
          section?: string;
          body: string;
          sensitivity: string;
          newEntryId?: string;
          sourceRepresentationId?: string | null;
        };
        if (
          command.tripId !== ctx.tripId ||
          command.operationId !== row.operation_id ||
          command.admission.mode !== "MANUAL" ||
          payload.body !== entry.body ||
          payload.sensitivity !== entry.sensitivity ||
          (command.command === "APPEND_INSTRUCTION"
            ? command.target.id !== id ||
              payload.itemId !== entry.event_id ||
              payload.section !== entry.section ||
              payload.sourceRepresentationId !== null ||
              entry.supersedes_id !== null
            : command.command !== "CORRECT_INSTRUCTION" ||
              payload.newEntryId !== id ||
              command.target.id !== entry.supersedes_id)
        )
          continue;
        const digest = await coreHashValue("otr-trip-core-intent-v2", command, hash);
        if (digest !== row.intent_sha256) throw new Error("LOCAL_MANUAL_COMMIT_PIN");
        if (acceptedIds.has(id)) {
          if (
            row.state !== "APPLIED" ||
            !row.receipt_body ||
            !snapshot.cert ||
            row.reconciled_revision === null ||
            row.reconciled_revision > Number(snapshot.cert.revision)
          )
            continue;
          const receipt = await validateCoreReceipt(JSON.parse(row.receipt_body), hash);
          const after = receipt.audit.after.find(
            (a) => a.kind === "INSTRUCTION" && a.id === id,
          )?.facts as Record<string, unknown> | undefined;
          if (
            receipt.actorAccountId !== ctx.accountId ||
            receipt.tripId !== ctx.tripId ||
            receipt.operationId !== command.operationId ||
            receipt.command !== command.command ||
            receipt.intentSha256 !== digest ||
            receipt.receiptSha256 !== row.receipt_sha256 ||
            receipt.outcome !== "APPLIED" ||
            !receipt.result.created.some(
              (r) => r.kind === "INSTRUCTION" && r.id === id,
            ) ||
            !after ||
            [
              "id",
              "trip_id",
              "event_id",
              "owner_account_id",
              "section",
              "body",
              "sensitivity",
              "source_representation_id",
              "supersedes_id",
              "created_at",
            ].some((k) => after[k] !== entry[k])
          )
            continue;
        } else if (
          !snapshot.operations.some(
            (op) => op.operationId === command.operationId && op.sha256 === digest,
          )
        )
          continue;
        proof?.push({
          entryId: id,
          operationId: command.operationId,
          intentSha256: digest,
          receiptSha256: row.receipt_sha256,
          reconciledRevision: row.reconciled_revision,
        });
        origin = command;
        break;
      }
      if (!origin) return false;
      id = origin.command === "APPEND_INSTRUCTION" ? null : origin.target.id;
    }
    return true;
  }
  async function manualInstructionEligibility(
    ctx: AccountRequestContext,
    itemId: string,
    entryId: string,
  ) {
    coreUuid.parse(itemId);
    coreUuid.parse(entryId);
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let eligible = false;
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const accepted = await acceptedWithinTransaction(ctx);
        const snapshot = await readLocalManualSnapshotWithinTransaction(
          database,
          getAccountId,
          { manualReadSnapshot },
          ctx,
          accepted,
        );
        const parent = snapshot?.graph.itinerary_events.find((r) => r.id === itemId);
        const entry = snapshot?.graph.trip_instruction_entries.find(
          (r) => r.id === entryId,
        );
        if (
          snapshot &&
          parent?.experience_family === "P3" &&
          parent.owner_account_id === ctx.accountId &&
          parent.hidden_at === null &&
          parent.status !== "cancelled" &&
          parent.status !== "skipped" &&
          entry?.event_id === itemId &&
          entry.hidden_at === null &&
          ["ARRIVAL", "DEPARTURE"].includes(String(entry.section)) &&
          !snapshot.graph.trip_instruction_entries.some(
            (r) => r.supersedes_id === entryId,
          ) &&
          coreCanManage(snapshot.graph, snapshot.actor, "ITEM", parent) &&
          coreCanManage(snapshot.graph, snapshot.actor, "INSTRUCTION", entry)
        )
          eligible = await manualInstructionOriginWithinTransaction(
            ctx,
            snapshot,
            new Set(
              accepted?.graph.trip_instruction_entries.map((r) => String(r.id)) ?? [],
            ),
            entryId,
          );
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return { status: eligible ? ("ELIGIBLE" as const) : ("UNPROVEN" as const) };
    });
  }
  // Read-only PRECLAIM qualification of the exact original queued command.
  // Never use the optimistic UI head hint here, or reauthorize an UNKNOWN op.
  async function manualInstructionCorrectionPreclaimEligibility(
    ctx: AccountRequestContext,
    input: unknown,
  ) {
    const command = validateCoreCommand(input);
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let eligible = false;
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        if (
          command.tripId !== ctx.tripId ||
          command.command !== "CORRECT_INSTRUCTION" ||
          command.admission.mode !== "MANUAL"
        )
          return;
        const row = await database.getFirstAsync<{
          canonical_intent_text: string;
          intent_sha256: string;
          state: string;
          reconciled_revision: number | null;
          queue_id: string;
          entity_id: string;
          payload_json: string;
          idempotency_key: string;
          queue_status: string;
          attempt_count: number;
          failure_category: string | null;
          last_error_message: string | null;
          last_attempt_at: string | null;
          receipt_sha256: string | null;
        }>(
          `SELECT i.canonical_intent_text,i.intent_sha256,i.state,i.reconciled_revision,
           op.id AS queue_id,op.entity_id,op.payload_json,op.idempotency_key,
           op.status AS queue_status,op.attempt_count,op.failure_category,op.last_error_message,op.last_attempt_at,
           r.receipt_sha256 FROM trip_core_pending_intents i
           JOIN sync_operations op ON op.id=i.queue_operation_id
           AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id
           AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
           LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id
           AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id
           WHERE i.account_id=? AND i.trip_id=? AND i.operation_id=?`,
          ctx.accountId,
          ctx.tripId,
          command.operationId,
        );
        const canonical = canonicalCoreJson(command as Json);
        if (
          !row ||
          row.queue_id !== command.operationId ||
          row.idempotency_key !== command.operationId ||
          row.entity_id !== command.target.id ||
          row.canonical_intent_text !== canonical ||
          row.payload_json !== canonical ||
          row.intent_sha256 !==
            (await coreHashValue("otr-trip-core-intent-v2", command, hash)) ||
          !["BLOCKED", "PENDING"].includes(row.state) ||
          row.reconciled_revision !== null ||
          row.receipt_sha256 !== null ||
          !["PENDING", "DEPENDENCY_BLOCKED"].includes(row.queue_status) ||
          row.attempt_count !== 0 ||
          row.last_attempt_at !== null ||
          (row.failure_category !== null && row.failure_category !== "DEPENDENCY") ||
          row.last_error_message === "INTERRUPTED"
        )
          return;
        const accepted = await acceptedWithinTransaction(ctx);
        if (!accepted) return;
        let parent;
        try {
          parent = resolveCoreInstructionParentForSubmit(
            accepted.graph,
            accepted.actor,
            command,
            clock(),
          );
        } catch (error) {
          if (error instanceof CoreInstructionScopeError) return;
          throw error;
        }
        if (
          parent.family !== "P3" ||
          !["ARRIVAL", "DEPARTURE"].includes(parent.section) ||
          accepted.graph.itinerary_events.find((r) => r.id === parent.parentItemId)
            ?.owner_account_id !== ctx.accountId
        )
          return;
        eligible = await manualInstructionOriginWithinTransaction(
          ctx,
          {
            graph: accepted.graph,
            cert: accepted.certificate,
            operations: [],
          },
          new Set(accepted.graph.trip_instruction_entries.map((r) => String(r.id))),
          command.target.id,
        );
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return { status: eligible ? ("ELIGIBLE" as const) : ("UNPROVEN" as const) };
    });
  }
  async function correctionQueueWithinTransaction(
    ctx: AccountRequestContext,
    operationId: string,
  ) {
    return database.getFirstAsync<CorrectionQueueRow>(
      `SELECT op.id,op.trip_id AS tripId,op.entity_type AS entityType,op.entity_id AS entityId,
       op.operation_type AS operationType,op.idempotency_key AS idempotencyKey,
       op.base_version AS baseVersion,op.payload_json AS payloadJson,op.owner_user_id AS ownerUserId,
       op.status,op.attempt_count AS attemptCount,op.next_attempt_at AS nextAttemptAt,
       op.dependency_operation_id AS dependencyOperationId,op.claim_owner AS claimOwner,
       op.created_at AS createdAt,op.updated_at AS updatedAt,op.last_attempt_at AS lastAttemptAt,
       op.lease_expires_at AS leaseExpiresAt,op.failure_category AS failureCategory,
       op.last_error_code AS lastErrorCode,op.last_error_message AS lastErrorMessage,
       op.last_request_id AS lastRequestId,op.first_failed_at AS firstFailedAt,
       i.canonical_intent_text AS canonicalIntentText,i.intent_sha256 AS intentSha256,
       i.state AS intentState,i.reconciled_revision AS reconciledRevision,r.receipt_sha256 AS receiptSha256
       FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id
       AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id
       LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id
       AND r.trip_id=i.trip_id AND r.operation_id=i.operation_id
       WHERE i.account_id=? AND i.trip_id=? AND i.operation_id=?`,
      ctx.accountId,
      ctx.tripId,
      operationId,
    );
  }
  async function boundCorrection(
    ctx: AccountRequestContext,
    row: CorrectionQueueRow | null,
  ) {
    if (!row) return null;
    const command = validateCoreCommand(JSON.parse(row.canonicalIntentText));
    if (
      command.command !== "CORRECT_INSTRUCTION" ||
      command.admission.mode !== "MANUAL" ||
      command.tripId !== ctx.tripId ||
      row.tripId !== ctx.tripId ||
      row.ownerUserId !== ctx.accountId ||
      row.entityType !== "TRIP_CORE_V2" ||
      row.operationType !== "CORE_V2_COMMAND" ||
      row.id !== command.operationId ||
      row.idempotencyKey !== command.operationId ||
      row.entityId !== command.target.id ||
      row.payloadJson !== row.canonicalIntentText ||
      row.canonicalIntentText !== canonicalCoreJson(command as Json) ||
      row.baseVersion !==
        command.baseVector.find(
          (b) => b.kind === command.target.kind && b.id === command.target.id,
        )?.revision ||
      (await coreHashValue("otr-trip-core-intent-v2", command, hash)) !== row.intentSha256
    )
      return null;
    return command;
  }
  async function correctionContextHashWithinTransaction(
    ctx: AccountRequestContext,
    row: CorrectionQueueRow,
    command: ReturnType<typeof validateCoreCommand>,
  ) {
    let accepted: CoreAcceptedSnapshot | null;
    try {
      accepted = await acceptedWithinTransaction(ctx);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "CORE_READ_VERSION_MISMATCH",
          "CORE_READ_ACCESS_MISMATCH",
          "CORE_PERSON_BINDING_MISMATCH",
        ].includes(error.message)
      )
        return null;
      throw error;
    }
    if (!accepted) return null;
    let parent;
    try {
      parent = resolveCoreInstructionParentForSubmit(
        accepted.graph,
        accepted.actor,
        command,
        clock(),
      );
    } catch (error) {
      if (error instanceof CoreInstructionScopeError) return null;
      throw error;
    }
    const item = accepted.graph.itinerary_events.find(
      (r) => r.id === parent.parentItemId,
    );
    if (
      parent.family !== "P3" ||
      !["ARRIVAL", "DEPARTURE"].includes(parent.section) ||
      item?.owner_account_id !== ctx.accountId
    )
      return null;
    const proof: CorrectionOriginPin[] = [];
    if (
      !(await manualInstructionOriginWithinTransaction(
        ctx,
        { graph: accepted.graph, cert: accepted.certificate, operations: [] },
        new Set(accepted.graph.trip_instruction_entries.map((r) => String(r.id))),
        command.target.id,
        proof,
      ))
    )
      return null;
    return coreHashValue(
      "otr-core-correction-claim-context-v1",
      {
        moduleIncarnation: correctionModuleIncarnation,
        factoryIncarnation: correctionFactoryIncarnation,
        accountId: ctx.accountId,
        tripId: ctx.tripId,
        generation: ctx.generation,
        intentSha256: row.intentSha256,
        certificate: accepted.certificate,
        actor: accepted.actor,
        parent: item,
        entries: proof.map((p) =>
          accepted.graph.trip_instruction_entries.find((r) => r.id === p.entryId),
        ),
        proof,
        queue: {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          operationType: row.operationType,
          idempotencyKey: row.idempotencyKey,
          baseVersion: row.baseVersion,
        },
        claimPostimage: {
          status: row.status,
          attemptCount: row.attemptCount,
          lastAttemptAt: row.lastAttemptAt,
          leaseExpiresAt: row.leaseExpiresAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          nextAttemptAt: row.nextAttemptAt,
          dependencyOperationId: row.dependencyOperationId,
          failureCategory: row.failureCategory,
          lastErrorCode: row.lastErrorCode,
          lastErrorMessage: row.lastErrorMessage,
          lastRequestId: row.lastRequestId,
          firstFailedAt: row.firstFailedAt,
        },
      } as unknown as Json,
      hash,
    );
  }
  function candidateOwnerContext(owner: string) {
    try {
      const value: unknown = JSON.parse(owner);
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        value[0] !== "otr-core-correction-claim/1" ||
        !coreUuid.safeParse(value[1]).success ||
        !coreHash.safeParse(value[2]).success
      )
        return null;
      return value[2] as string;
    } catch {
      return null;
    }
  }
  async function claimQueuedManualInstructionCorrection(
    ctx: AccountRequestContext,
    observed: SyncOperation,
  ): Promise<CoreCorrectionClaimResult> {
    coreUuid.parse(observed.id);
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let result: CoreCorrectionClaimResult = { kind: "NOT_CLAIMED" };
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const row = await correctionQueueWithinTransaction(ctx, observed.id);
        const command = await boundCorrection(ctx, row);
        if (
          !row ||
          !command ||
          !correctionObservedKeys.every(
            (k) => (row[k] ?? null) === (observed[k] ?? null),
          ) ||
          !["PENDING", "RETRYABLE"].includes(row.status) ||
          row.claimOwner !== null ||
          (row.nextAttemptAt !== null &&
            (!Number.isFinite(Date.parse(row.nextAttemptAt)) ||
              Date.parse(row.nextAttemptAt) > Date.parse(clock())))
        )
          return;
        const fresh =
          ["BLOCKED", "PENDING"].includes(row.intentState) &&
          row.reconciledRevision === null &&
          row.receiptSha256 === null &&
          row.status === "PENDING" &&
          row.attemptCount === 0 &&
          row.lastAttemptAt === null &&
          (row.failureCategory === null || row.failureCategory === "DEPENDENCY") &&
          row.lastErrorMessage !== "INTERRUPTED";
        const now = clock(),
          lease = new Date(Date.parse(now) + 5 * 60_000).toISOString();
        // Commit the exact postimage this claim writes, preserving legitimate
        // existing dependency/error metadata instead of assuming it was null.
        const postimage: CorrectionQueueRow = {
          ...row,
          status: "PROCESSING",
          lastAttemptAt: now,
          leaseExpiresAt: lease,
          updatedAt: now,
        };
        const contextHash = fresh
          ? await correctionContextHashWithinTransaction(ctx, postimage, command)
          : null;
        const owner = canonicalCoreJson([
          "otr-core-correction-claim/1",
          createUuid(),
          contextHash,
        ] as Json);
        const update = await database.runAsync(
          `UPDATE sync_operations SET status='PROCESSING',claim_owner=?,lease_expires_at=?,last_attempt_at=?,updated_at=?
           WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type=? AND entity_id=? AND operation_type=?
           AND idempotency_key=? AND base_version IS ? AND payload_json=? AND status=? AND attempt_count=?
           AND next_attempt_at IS ? AND dependency_operation_id IS ? AND claim_owner IS ?
           AND lease_expires_at IS ? AND last_attempt_at IS ? AND created_at=? AND updated_at=?
           AND failure_category IS ? AND last_error_code IS ? AND last_error_message IS ?
           AND last_request_id IS ? AND first_failed_at IS ?
           AND EXISTS(SELECT 1 FROM trip_core_pending_intents i WHERE i.account_id=? AND i.trip_id=?
             AND i.operation_id=? AND i.queue_operation_id=sync_operations.id AND i.intent_sha256=?
             AND i.canonical_intent_text=? AND i.state=?)`,
          owner,
          lease,
          now,
          now,
          row.id,
          ctx.accountId,
          ctx.tripId,
          row.entityType,
          row.entityId,
          row.operationType,
          row.idempotencyKey,
          row.baseVersion,
          row.payloadJson,
          row.status,
          row.attemptCount,
          row.nextAttemptAt,
          row.dependencyOperationId ?? null,
          row.claimOwner ?? null,
          row.leaseExpiresAt,
          row.lastAttemptAt,
          row.createdAt,
          row.updatedAt,
          row.failureCategory,
          row.lastErrorCode,
          row.lastErrorMessage,
          row.lastRequestId,
          row.firstFailedAt,
          ctx.accountId,
          ctx.tripId,
          command.operationId,
          row.intentSha256,
          row.canonicalIntentText,
          row.intentState,
        );
        if (update.changes === 1) {
          const minted = await correctionQueueWithinTransaction(ctx, command.operationId);
          if (
            !minted ||
            minted.claimOwner !== owner ||
            !(await boundCorrection(ctx, minted)) ||
            (contextHash !== null &&
              (await correctionContextHashWithinTransaction(ctx, minted, command)) !==
                contextHash)
          )
            throw Error("CORE_CORRECTION_CLAIM_POSTIMAGE_CHANGED");
          result = {
            kind: "CLAIMED",
            path: contextHash ? "CANDIDATE" : "RECEIPT_ONLY",
            claim: {
              version: 1,
              operationId: command.operationId,
              intentSha256: row.intentSha256,
              claimOwner: owner,
            },
          };
        }
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return result;
    });
  }
  async function validateCorrectionProjection(
    ctx: AccountRequestContext,
    command: ReturnType<typeof validateCoreCommand>,
    digest: string,
    input: CoreReceiptProjection,
  ) {
    coreUuid.parse(input.domainReceiptId);
    if (input.projection === "STATUS_ONLY") {
      coreHash.parse(input.receiptSha256);
      if (
        input.operationId !== command.operationId ||
        input.targetRevision !== null ||
        !["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"].includes(input.outcome)
      )
        throw Error("CORE_CORRECTION_RECEIPT_BINDING");
      return {
        projection: "STATUS_ONLY" as const,
        domainReceiptId: input.domainReceiptId,
        receiptSha256: input.receiptSha256,
        operationId: input.operationId,
        outcome: input.outcome,
        targetRevision: null,
      };
    }
    if (input.projection !== "FULL") throw Error("CORE_CORRECTION_RECEIPT_BINDING");
    const receipt = await validateCoreReceipt(input.receipt, hash);
    if (
      receipt.actorAccountId !== ctx.accountId ||
      receipt.tripId !== ctx.tripId ||
      receipt.operationId !== command.operationId ||
      receipt.command !== command.command ||
      receipt.intentSha256 !== digest
    )
      throw Error("CORE_CORRECTION_RECEIPT_BINDING");
    return {
      projection: "FULL" as const,
      domainReceiptId: input.domainReceiptId,
      receipt,
    };
  }
  async function consumeAndSubmitManualInstructionCorrection(
    ctx: AccountRequestContext,
    claim: CoreCorrectionClaim,
    transport: CoreCorrectionTransport,
  ): Promise<CoreCorrectionExecutionResult> {
    coreUuid.parse(claim.operationId);
    coreHash.parse(claim.intentSha256);
    if (
      claim.version !== 1 ||
      typeof claim.claimOwner !== "string" ||
      claim.claimOwner.length > 1024
    )
      throw Error("CORE_CORRECTION_CLAIM_BINDING");
    let command: ReturnType<typeof validateCoreCommand> | null = null;
    await withAccountApplyGate(async () => {
      await assertContext(ctx);
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const row = await correctionQueueWithinTransaction(ctx, claim.operationId);
        command = await boundCorrection(ctx, row);
        if (!row || !command || row.intentSha256 !== claim.intentSha256)
          throw Error("CORE_CORRECTION_CLAIM_BINDING");
        await assertContext(ctx);
      });
    });
    if (!command) throw Error("CORE_CORRECTION_CLAIM_BINDING");
    const originalCommand = command;
    // Original receipt recovery precedes incarnation, lease and NEW eligibility.
    const retained = await transport.receipt(ctx, claim.operationId);
    await assertContext(ctx);
    if (retained !== null) {
      const result = await validateCorrectionProjection(
        ctx,
        originalCommand,
        claim.intentSha256,
        retained,
      );
      await assertContext(ctx);
      return { kind: "RECEIPT", result };
    }
    let consumed = false;
    let submission: Promise<CoreReceiptProjection> | null = null;
    await withAccountApplyGate(
      async () => {
        await assertContext(ctx);
        await database.withTransactionAsync(async () => {
          await scope(ctx);
          const row = await correctionQueueWithinTransaction(ctx, claim.operationId);
          const current = await boundCorrection(ctx, row);
          if (
            !row ||
            !current ||
            row.intentSha256 !== claim.intentSha256 ||
            row.claimOwner !== claim.claimOwner ||
            row.status !== "PROCESSING" ||
            row.attemptCount !== 0 ||
            (row.failureCategory !== null && row.failureCategory !== "DEPENDENCY") ||
            row.lastErrorMessage === "INTERRUPTED" ||
            row.leaseExpiresAt === null ||
            !Number.isFinite(Date.parse(row.leaseExpiresAt)) ||
            !Number.isFinite(Date.parse(clock())) ||
            Date.parse(row.leaseExpiresAt) <= Date.parse(clock()) ||
            !["BLOCKED", "PENDING"].includes(row.intentState) ||
            row.receiptSha256 !== null ||
            row.reconciledRevision !== null
          )
            return;
          const boundHash = candidateOwnerContext(row.claimOwner);
          if (
            !boundHash ||
            (await correctionContextHashWithinTransaction(ctx, row, current)) !==
              boundHash
          )
            return;
          const update = await database.runAsync(
            `UPDATE trip_core_pending_intents SET state='IN_FLIGHT'
           WHERE account_id=? AND trip_id=? AND operation_id=? AND intent_sha256=? AND canonical_intent_text=?
           AND state IN ('BLOCKED','PENDING') AND reconciled_revision IS NULL
           AND NOT EXISTS(SELECT 1 FROM trip_core_trip_core_command_receipts r WHERE r.account_id=? AND r.trip_id=? AND r.operation_id=?)
           AND EXISTS(SELECT 1 FROM sync_operations op WHERE op.id=trip_core_pending_intents.queue_operation_id
             AND op.owner_user_id=? AND op.trip_id=? AND op.status='PROCESSING' AND op.claim_owner=?
             AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND' AND op.entity_id=?
             AND op.idempotency_key=? AND op.payload_json=? AND op.base_version IS ? AND op.lease_expires_at=?
             AND op.attempt_count=? AND op.failure_category IS ? AND op.last_error_message IS ?
             AND op.last_attempt_at IS ? AND op.updated_at=? AND op.created_at=?
             AND op.next_attempt_at IS ? AND op.dependency_operation_id IS ?
             AND op.last_error_code IS ? AND op.last_request_id IS ? AND op.first_failed_at IS ?)`,
            ctx.accountId,
            ctx.tripId,
            claim.operationId,
            claim.intentSha256,
            row.canonicalIntentText,
            ctx.accountId,
            ctx.tripId,
            claim.operationId,
            ctx.accountId,
            ctx.tripId,
            claim.claimOwner,
            current.target.id,
            current.operationId,
            row.canonicalIntentText,
            row.baseVersion,
            row.leaseExpiresAt,
            row.attemptCount,
            row.failureCategory,
            row.lastErrorMessage,
            row.lastAttemptAt,
            row.updatedAt,
            row.createdAt,
            row.nextAttemptAt,
            row.dependencyOperationId,
            row.lastErrorCode,
            row.lastRequestId,
            row.firstFailedAt,
          );
          consumed = update.changes === 1;
          await assertContext(ctx);
        });
        await assertContext(ctx);
        return consumed;
      },
      (won) => {
        // Synchronous handoff after committed transaction/gate release. Never
        // export a permit; the existing transport retains its request fences.
        if (won) submission = transport.submit(ctx, originalCommand);
      },
    );
    if (submission === null) return { kind: "RECEIPT_ONLY" };
    const result = await submission;
    await assertContext(ctx);
    const validated = await validateCorrectionProjection(
      ctx,
      originalCommand,
      claim.intentSha256,
      result,
    );
    await assertContext(ctx);
    return { kind: "RECEIPT", result: validated };
  }
  async function validateManualInstructionsWithinTransaction(
    ctx: AccountRequestContext,
    commands: readonly ReturnType<typeof validateCoreCommand>[],
  ) {
    const accepted = await acceptedWithinTransaction(ctx);
    const snapshot = await readLocalManualSnapshotWithinTransaction(
      database,
      getAccountId,
      { manualReadSnapshot },
      ctx,
      accepted,
    );
    if (
      !snapshot ||
      new Set(commands.map((c) => c.operationId)).size !== commands.length ||
      commands.filter((c) => c.target.kind === "ITEM").length > 5
    )
      throw new Error("MANUAL_BATCH_INVALID");
    let graph = snapshot.graph,
      parentId: string | undefined;
    const acceptedIds = new Set(
      accepted?.graph.trip_instruction_entries.map((r) => String(r.id)) ?? [],
    );
    const fresh: ReturnType<typeof validateCoreCommand>[] = [];
    const sections = new Set<string>();
    for (const command of commands) {
      const instruction =
        command.command === "APPEND_INSTRUCTION" ||
        command.command === "CORRECT_INSTRUCTION";
      if (
        command.tripId !== ctx.tripId ||
        command.admission.mode !== "MANUAL" ||
        (!instruction &&
          (command.target.kind !== "ITEM" ||
            ![
              "SET_ITEM_TEXT",
              "SET_ITEM_SCHEDULE",
              "SET_ITEM_PLACE",
              "SET_ITEM_PARTICIPATION",
              "SET_STAY_DETAILS",
            ].includes(command.command)))
      )
        throw new Error("MANUAL_BATCH_INVALID");
      const payload = command.payload as {
        itemId?: string;
        newEntryId?: string;
        section?: string;
        body: string;
        sourceRepresentationId?: string | null;
      };
      const previous = graph.trip_instruction_entries.find(
        (r) => r.id === command.target.id,
      );
      const itemId = !instruction
        ? command.target.id
        : command.command === "APPEND_INSTRUCTION"
          ? payload.itemId
          : previous?.event_id;
      const parent = graph.itinerary_events.find((r) => r.id === itemId);
      if (
        !parent ||
        parent.experience_family !== "P3" ||
        parent.owner_account_id !== ctx.accountId ||
        parent.hidden_at !== null ||
        parent.status === "cancelled" ||
        parent.status === "skipped" ||
        (parentId !== undefined && parentId !== parent.id)
      )
        throw new Error("MANUAL_BATCH_INVALID");
      parentId = String(parent.id);
      if (!coreCanManage(graph, snapshot.actor, "ITEM", parent))
        throw new Error("NOT_VISIBLE");
      if (instruction) {
        const section =
          command.command === "APPEND_INSTRUCTION" ? payload.section : previous?.section;
        if (
          !["ARRIVAL", "DEPARTURE"].includes(String(section)) ||
          sections.has(String(section))
        )
          throw new Error("MANUAL_BATCH_INVALID");
        sections.add(String(section));
        if (
          command.command === "APPEND_INSTRUCTION" &&
          payload.sourceRepresentationId !== null
        )
          throw new Error("MANUAL_INSTRUCTION_UNPROVEN");
        if (
          command.command === "CORRECT_INSTRUCTION" &&
          (!previous ||
            !coreCanManage(graph, snapshot.actor, "INSTRUCTION", previous) ||
            !(await manualInstructionOriginWithinTransaction(
              ctx,
              snapshot,
              acceptedIds,
              command.target.id,
            )))
        )
          throw new Error("MANUAL_INSTRUCTION_UNPROVEN");
      }
      const prior = await database.getFirstAsync<{
        intent_sha256: string;
        state: string;
      }>(
        "SELECT intent_sha256,state FROM trip_core_pending_intents WHERE account_id=? AND operation_id=?",
        ctx.accountId,
        command.operationId,
      );
      if (prior) {
        const digest = await coreHashValue("otr-trip-core-intent-v2", command, hash);
        if (prior.intent_sha256 !== digest) throw new Error("OPERATION_REUSE_MISMATCH");
        const created = instruction
          ? graph.trip_instruction_entries.find(
              (r) =>
                r.id ===
                (command.command === "APPEND_INSTRUCTION"
                  ? command.target.id
                  : payload.newEntryId),
            )
          : parent;
        if (
          !["BLOCKED", "PENDING", "IN_FLIGHT", "APPLIED"].includes(prior.state) ||
          (!snapshot.operations.some(
            (op) => op.operationId === command.operationId && op.sha256 === digest,
          ) &&
            prior.state !== "APPLIED") ||
          !created ||
          (instruction &&
            (created.event_id !== parent.id ||
              created.body !== payload.body ||
              created.source_representation_id !== null ||
              (command.command === "CORRECT_INSTRUCTION" &&
                created.supersedes_id !== previous?.id)))
        )
          throw new Error("MANUAL_INSTRUCTION_RETRY_UNAVAILABLE");
        continue;
      }
      if (
        command.command === "APPEND_INSTRUCTION" &&
        graph.trip_instruction_entries.some(
          (r) =>
            r.event_id === parent.id &&
            r.section === payload.section &&
            r.hidden_at === null &&
            !graph.trip_instruction_entries.some((next) => next.supersedes_id === r.id),
        )
      )
        throw new Error("MANUAL_INSTRUCTION_UNPROVEN");
      if (command.command === "CORRECT_INSTRUCTION" && previous?.hidden_at !== null)
        throw new Error("MANUAL_INSTRUCTION_UNPROVEN");
      graph = applyCoreCommand(
        graph,
        command,
        snapshot.actor,
        clock(),
        false,
        undefined,
        true,
      ).graph;
      fresh.push(command);
    }
    return fresh;
  }
  // Both preparation reads and post-write verification share this owning transaction.
  async function commitManualBatch<T>(
    ctx: AccountRequestContext,
    prepare: () => Promise<{
      commands: readonly unknown[];
      result(): Promise<T>;
    }>,
  ): Promise<T> {
    return withAccountApplyGate(async () => {
      await assertContext(ctx);
      let result!: T;
      let queued = false;
      await database.withTransactionAsync(async () => {
        await scope(ctx);
        const prepared = await prepare();
        if (prepared.commands.length > 7) throw new Error("MANUAL_BATCH_INVALID");
        const commands = prepared.commands.map(validateCoreCommand);
        const instructions = commands.some(
          (c) =>
            c.command === "APPEND_INSTRUCTION" || c.command === "CORRECT_INSTRUCTION",
        );
        if (!instructions && commands.length > 5) throw new Error("MANUAL_BATCH_INVALID");
        const toEnqueue = instructions
          ? await validateManualInstructionsWithinTransaction(ctx, commands)
          : commands;
        if (
          !instructions &&
          (commands.some(
            (c) =>
              c.tripId !== ctx.tripId ||
              c.target.kind !== "ITEM" ||
              c.admission.mode !== "MANUAL" ||
              ![
                "CREATE_ITEM",
                "CREATE_SPARSE_FLIGHT",
                "SET_AUTHORED_FLIGHT_DETAILS",
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PLACE",
                "SET_ITEM_PARTICIPATION",
                "SET_STAY_DETAILS",
                "SET_RENTAL_DETAILS",
                "SET_TRANSPORT_DETAILS",
                "SET_ACTIVITY_DETAILS",
              ].includes(c.command) ||
              (c.command === "CREATE_ITEM" &&
                !["P1", "P3", "P4", "P5", "P6"].includes(
                  (c.payload as { family: string }).family,
                )),
          ) ||
            new Set(commands.map((c) => c.target.id)).size > 1)
        )
          throw new Error("MANUAL_BATCH_INVALID");
        if (!instructions && commands.length) {
          const isCreation = (c: (typeof commands)[number]) =>
            c.command === "CREATE_ITEM" || c.command === "CREATE_SPARSE_FLIGHT";
          const creation = commands.find(isCreation);
          let family: unknown;
          if (creation) {
            if (commands[0] !== creation || commands.filter(isCreation).length !== 1)
              throw new Error("MANUAL_BATCH_INVALID");
            family =
              creation.command === "CREATE_SPARSE_FLIGHT"
                ? "P2"
                : (creation.payload as { family: string }).family;
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
            !["P1", "P2", "P3", "P4", "P5", "P6"].includes(String(family)) ||
            (family !== "P2" &&
              commands.some((c) => c.command === "SET_AUTHORED_FLIGHT_DETAILS")) ||
            (family === "P2" &&
              commands.some(
                (c) =>
                  ![
                    "CREATE_SPARSE_FLIGHT",
                    "SET_AUTHORED_FLIGHT_DETAILS",
                    "SET_ITEM_PARTICIPATION",
                  ].includes(c.command),
              )) ||
            (family !== "P3" && commands.some((c) => c.command === "SET_STAY_DETAILS")) ||
            (family !== "P4" &&
              commands.some((c) => c.command === "SET_RENTAL_DETAILS")) ||
            (family !== "P5" &&
              commands.some((c) => c.command === "SET_TRANSPORT_DETAILS")) ||
            (family !== "P6" &&
              commands.some((c) => c.command === "SET_ACTIVITY_DETAILS")) ||
            (family === "P5" &&
              commands.some((c) =>
                ["SET_ITEM_SCHEDULE", "SET_ITEM_PLACE"].includes(c.command),
              ))
          )
            throw new Error("MANUAL_BATCH_INVALID");
        }
        for (const command of toEnqueue) await enqueueWithinTransaction(ctx, command);
        queued = toEnqueue.length > 0;
        result = await prepared.result();
        await assertContext(ctx);
      });
      await assertContext(ctx);
      if (queued) announceLedgerQueueWorkAvailable();
      return result;
    });
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
        const old = await database.getFirstAsync<{
          epoch: string;
          revision: number;
        }>(
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
        (intent.command.admission.mode !== "MANUAL" && !isNormalImportCoreCommand(intent.command))
      )
        continue;
      try {
        const predicted = applyCoreCommand(
          graph,
          intent.command,
          actor,
          intent.created_at,
          intent.command.admission.mode === "IMPORT",
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
    // Reuse the verified local journal for P2; only Manual-owned targets join this reader.
    const journalAvailable = await database.getFirstAsync(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_core_authority_commits'",
    );
    if (
      journalAvailable &&
      (await database.getFirstAsync(
        "SELECT 1 FROM local_core_authority_commits WHERE account_id=? AND trip_id=? AND authority_kind='LOCAL_MANUAL' LIMIT 1",
        ctx.accountId,
        ctx.tripId,
      ))
    ) {
      const local = await localCommits.readCommittedWithinTransaction(ctx, {
        graph: projected.graph,
        actor,
        participatingPersonIds: projected.participatingPersonIds.length
          ? projected.participatingPersonIds
          : [...actor.personIds],
        certificate: projected.cert,
      });
      const localFlights = local.graph.trip_flight_intents.filter(
        (r) =>
          local.perTargetAuthority[`ITEM:${r.event_id}`]?.authority === "LOCAL_MANUAL",
      );
      if (localFlights.length) {
        Object.assign(projected.graph, local.graph);
        for (const flight of localFlights)
          projected.predictedIds.add(String(flight.event_id));
        for (const receipt of local.receipts.filter(
          (r) =>
            r.authority === "LOCAL_MANUAL" &&
            localFlights.some((f) => f.event_id === r.target.id),
        ))
          operations.push({
            operationId: receipt.operationId,
            sha256: receipt.intentSha256,
            state: "LOCAL_COMMITTED",
            receiptSha256: receipt.receiptSha256,
          });
      }
    }
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
            !isReviewedSourceCreate(command) ||
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
    manualReadSnapshot,
    acceptedSnapshot,
    combinedSnapshot,
    readLocalCombinedWithinTransaction,
    commitLocal: localCommits.commit,
    prepareLocalManualSparse: localCommits.prepareManualSparse,
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
    enqueueConfirmedItemDocuments,
    commitManualBatch,
    manualInstructionEligibility,
    manualInstructionCorrectionPreclaimEligibility,
    claimQueuedManualInstructionCorrection,
    consumeAndSubmitManualInstructionCorrection,
    pending,
    beginRefresh,
    install,
    applyReceipt,
    recoverP1Receipts,
    revoke,
    day,
  };
}
