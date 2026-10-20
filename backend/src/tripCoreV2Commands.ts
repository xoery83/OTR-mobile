import {
  applyCoreCommand,
  coreCanRead,
  type CoreActor,
  type CoreGraph,
  type CoreMutation,
  type VerifiedPrivateDocumentCustody,
} from "../../src/domain/trip/tripCoreV2Mutation";
import {
  validateCoreCommand,
  type CoreCommand,
  type CoreCommandName,
} from "../../src/domain/trip/tripCoreV2Commands";
import { coreKindTables } from "../../src/domain/trip/tripCoreV2";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import {
  coreReceiptSchema,
  validateCoreReceipt,
  type CoreReceipt,
  CoreReceiptProjection,
} from "../../src/domain/trip/tripCoreV2Receipt";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { ZodError } from "zod";
export type CoreCommandTransaction = {
  actor: CoreActor;
  authoritativeClock?(): Promise<string>;
  readReceipt(): Promise<{ domainReceiptId: string; receiptText: string } | null>;
  hasLegacyOperation(): Promise<boolean>;
  canReadReceipt(receipt: CoreReceipt): Promise<boolean>;
  enabledCommands(): Promise<readonly CoreCommandName[]>;
  readLockedGraph(command: CoreCommand): Promise<CoreGraph>;
  verifyAdmission(
    command: CoreCommand,
    intentSha256: string,
    graph: CoreGraph,
  ): Promise<void | VerifiedPrivateDocumentCustody>;
  lifecycleGraphHash(command: CoreCommand, graph: CoreGraph): Promise<string | undefined>;
  admissionAudit?(): Promise<
    Pick<CoreReceipt["audit"], "evidenceRefs" | "authorizationRefs">
  >;
  commit(
    mutation: CoreMutation | null,
    receipt: CoreReceipt,
    canonicalIntent: string,
  ): Promise<string>;
};
export type CoreCommandStorage = {
  withLockedCommand<T>(
    scope: {
      actorAccountId: string;
      tripId: string;
      operationId: string;
      baseVector: CoreCommand["baseVector"];
    },
    work: (transaction: CoreCommandTransaction) => Promise<T>,
  ): Promise<T>;
};
export type { CoreReceiptProjection } from "../../src/domain/trip/tripCoreV2Receipt";
export const coreReceiptStatus = (id: string, r: CoreReceipt): CoreReceiptProjection => ({
  projection: "STATUS_ONLY",
  domainReceiptId: id,
  receiptSha256: r.receiptSha256,
  operationId: r.operationId,
  outcome: r.outcome,
  targetRevision: null,
});
const terminalErrors = new Set([
  "TRIP_NOT_AUTHORIZED",
  "INVALID_PROVENANCE",
  "NOT_VISIBLE",
  "REVISION_CONFLICT",
  "INVALID_BASE_VECTOR",
  "UNUSED_BASE_VECTOR",
  "INVALID_SELF_PERSON",
  "CROSS_TRIP_PERSON",
  "CROSS_TRIP_REFERENCE",
  "PROTECTED_FIELD",
  "AUTO_CLEAR_FORBIDDEN",
  "INVALID_AGGREGATE",
  "INVALID_FACT",
  "INVALID_RANGE",
  "DUPLICATE_SCHEDULE",
  "INVALID_COORDINATES",
  "INVALID_MONEY",
  "INVALID_VALIDITY",
  "DUPLICATE_CORE_ROW",
  "DUPLICATE_LINK",
  "INVALID_LINK",
  "ORPHAN_CORE_ROW",
  "INVALID_CORRECTION_CHAIN",
  "SCOPE_NOT_AUTHORIZED",
  "GRAPH_CHANGED",
  "DUPLICATE_OBSERVATION",
  "OWNING_CAPABILITY_REQUIRED",
  "INVALID_PARTICIPATION",
  "REVISION_OVERFLOW",
]);
export async function executeCoreCommandV2(
  storage: CoreCommandStorage,
  actorAccountId: string,
  tripId: string,
  input: unknown,
  hash: ImportHash,
  clock = () => new Date().toISOString(),
): Promise<CoreReceiptProjection> {
  const command = validateCoreCommand(input);
  if (command.tripId !== tripId) throw new Error("NOT_VISIBLE");
  const canonicalIntent = canonicalCoreJson(command as Json),
    intentSha256 = await coreHashValue("otr-trip-core-intent-v2", command, hash);
  return storage.withLockedCommand(
    {
      actorAccountId,
      tripId,
      operationId: command.operationId,
      baseVector: command.baseVector,
    },
    async (tx) => {
      if (tx.actor.accountId !== actorAccountId || tx.actor.tripId !== tripId)
        throw new Error("NOT_VISIBLE");
      const prior = await tx.readReceipt();
      if (prior) {
        const receipt = await validateCoreReceipt(JSON.parse(prior.receiptText), hash);
        if (
          receipt.actorAccountId !== actorAccountId ||
          receipt.tripId !== tripId ||
          receipt.operationId !== command.operationId ||
          receipt.intentSha256 !== intentSha256 ||
          receipt.command !== command.command
        )
          throw new Error("OPERATION_REUSE_MISMATCH");
        return (await tx.canReadReceipt(receipt))
          ? { projection: "FULL", domainReceiptId: prior.domainReceiptId, receipt }
          : coreReceiptStatus(prior.domainReceiptId, receipt);
      }
      if (!tx.actor.active) throw new Error("NOT_VISIBLE");
      if (await tx.hasLegacyOperation()) throw new Error("OPERATION_REUSE_MISMATCH");
      if (!(await tx.enabledCommands()).includes(command.command))
        throw new Error("CORE_CAPABILITY_CLOSED");
      const before = await tx.readLockedGraph(command);
      const committedAt = tx.authoritativeClock ? await tx.authoritativeClock() : clock();
      let mutation: CoreMutation | null = null,
        errorCode: string | null = null;
      try {
        const privateDocumentCustody = await tx.verifyAdmission(
          command,
          intentSha256,
          before,
        );
        mutation = applyCoreCommand(
          before,
          command,
          tx.actor,
          committedAt,
          command.admission.mode !== "MANUAL",
          await tx.lifecycleGraphHash(command, before),
          false,
          privateDocumentCustody || undefined,
        );
      } catch (error) {
        if (error instanceof ZodError) errorCode = "INVALID_FACT";
        else {
          if (!(error instanceof Error) || !terminalErrors.has(error.message))
            throw error;
          errorCode = error.message;
        }
      }
      const outcome: CoreReceipt["outcome"] =
        errorCode === null
          ? mutation!.changed.length
            ? "APPLIED"
            : "NO_CHANGE"
          : errorCode === "REVISION_CONFLICT" || errorCode === "GRAPH_CHANGED"
            ? "CONFLICT"
            : "REJECTED";
      const affected = mutation?.changed ?? [];
      const snapshots = (graph: CoreGraph) =>
        affected.flatMap((x) => {
          const facts = graph[coreKindTables[x.kind]].find((r) => r.id === x.id);
          return facts && coreCanRead(graph, tx.actor, x.kind, facts)
            ? [
                {
                  kind: x.kind,
                  id: x.id,
                  revision: facts[
                    x.kind === "ITEM" ? "semantic_revision" : "revision"
                  ] as number,
                  facts,
                },
              ]
            : [];
        });
      const vector = command.baseVector.map((v) => {
        const changed = affected.find((x) => x.kind === v.kind && x.id === v.id);
        return {
          kind: v.kind,
          id: v.id,
          baseRevision: v.revision,
          committedRevision: errorCode
            ? null
            : (changed?.committedRevision ?? v.revision),
        };
      });
      const typed = (x: CoreMutation["changed"][number]) => ({ kind: x.kind, id: x.id });
      const edgeTables = {
        trip_booking_item_links: ["booking_id", "BOOKING", "item_id", "ITEM"],
        trip_entitlement_item_links: ["entitlement_id", "ENTITLEMENT", "item_id", "ITEM"],
        trip_booking_entitlement_links: [
          "booking_id",
          "BOOKING",
          "entitlement_id",
          "ENTITLEMENT",
        ],
        trip_booking_document_links: ["booking_id", "BOOKING", "document_id", "DOCUMENT"],
        trip_entitlement_document_links: [
          "entitlement_id",
          "ENTITLEMENT",
          "document_id",
          "DOCUMENT",
        ],
        trip_item_document_links: ["item_id", "ITEM", "document_id", "DOCUMENT"],
      } as const;
      const retiredEdges = mutation
        ? Object.entries(edgeTables).flatMap(
            ([relation, [parentField, parentKind, childField, childKind]]) =>
              before[relation as keyof CoreGraph]
                .filter(
                  (edge) =>
                    edge.active &&
                    mutation!.graph[relation as keyof CoreGraph].some(
                      (current) =>
                        current[parentField] === edge[parentField] &&
                        current[childField] === edge[childField] &&
                        !current.active,
                    ),
                )
                .map((edge) => ({
                  relation,
                  parent: { kind: parentKind, id: edge[parentField] },
                  child: { kind: childKind, id: edge[childField] },
                })),
          )
        : [];
      const admissionAudit =
        errorCode === null && tx.admissionAudit
          ? await tx.admissionAudit()
          : { evidenceRefs: [], authorizationRefs: [] };
      const body = {
        receiptVersion: 2 as const,
        commandVersion: 2 as const,
        intentVersion: 2 as const,
        actorAccountId,
        tripId,
        operationId: command.operationId,
        command: command.command,
        intentSha256,
        targetVector: vector,
        outcome,
        result: {
          created: affected.filter((x) => x.baseRevision === null).map(typed),
          changed: affected.filter((x) => x.baseRevision !== null).map(typed),
          retiredEdges,
          replacement:
            command.command === "REPLACE_BOOKING" && mutation
              ? {
                  old: command.target,
                  new: {
                    kind: "BOOKING" as const,
                    id: (command.payload as { newBookingId: string }).newBookingId,
                  },
                }
              : null,
          custodyGrantId: null,
        },
        errorCode,
        committedAt,
        audit: {
          before: mutation ? snapshots(before) : [],
          after: mutation ? snapshots(mutation.graph) : [],
          evidenceRefs: admissionAudit.evidenceRefs,
          authorizationRefs: admissionAudit.authorizationRefs,
        },
      };
      const receipt = coreReceiptSchema.parse({
        ...body,
        receiptSha256: await coreHashValue("otr-trip-core-receipt-v2", body, hash),
      });
      const domainReceiptId = await tx.commit(mutation, receipt, canonicalIntent);
      return (await tx.canReadReceipt(receipt))
        ? { projection: "FULL", domainReceiptId, receipt }
        : coreReceiptStatus(domainReceiptId, receipt);
    },
  );
}
