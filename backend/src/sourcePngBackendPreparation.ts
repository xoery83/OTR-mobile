import { measureSourcePdfPhase } from "./sourcePdfTiming";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  sourcePngPreparationCommandSchema,
  sourcePngPendingReplySchema,
} from "../../src/domain/trip/sourcePngPreparationCommands";
import { sourceBinaryOriginalReceiptSchema } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import type { Json } from "../../src/domain/trip/tripCoreV2Json";
import { type SourcePngBrokerScope, createSourcePngBroker } from "./sourcePngBroker";
import { createSourcePngPrivateStage } from "./sourcePngPrivateStage";
import {
  createSourcePngStorageProducer,
  sourcePngStorageBindingSchema,
  type SourcePngStorageBinding,
  type SourcePngSandbox,
} from "./sourcePngStorageProducer";
import type { SourcePngExecutionOwner } from "./sourcePngOwnedSandbox";

type Command = z.infer<typeof sourcePngPreparationCommandSchema>;
const uuid = z.uuid(),
  positive = z.number().int().positive().safe();
const journal = z
  .object({
    id: uuid,
    operation_id: uuid,
    canonical_generation: positive,
    trip_id: uuid,
    source_id: uuid,
    representation_id: uuid,
    operation_key: z.string(),
    operation_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    material_revision: positive,
    staged_resource_id: uuid,
    execution_principal: z.literal("otr_trip_source_command_gateway"),
    profile_id: z.literal("PNG_STATIC_RGB8_RGBA8_V1"),
    profile_sha256: z.string(),
    run_token: uuid,
    owner_run: uuid.nullable(),
    owner_fence: z.number().int().nonnegative().safe(),
    phase: z.enum([
      "STARTING",
      "RUNNING",
      "TERMINATION_REQUIRED",
      "UNKNOWN",
      "TERMINAL",
      "RELEASED",
    ]),
    termination_outstanding: z.boolean(),
    terminal_result: z.string().nullable(),
    terminal_evidence_sha256: z.string().nullable(),
  })
  .passthrough();
const envelope = z.object({
  operation: sourcePngPendingReplySchema.or(sourceBinaryOriginalReceiptSchema).nullable(),
  journal: journal.nullable(),
  freshAttempt: z.boolean(),
  binding: sourcePngStorageBindingSchema.nullable(),
  uploadBinding: sourcePngStorageBindingSchema.nullable(),
  uploadJournal: journal.nullable(),
  attempt: z.strictObject({ id: uuid, generation: positive }).nullable(),
});
type Reply = z.infer<typeof envelope>;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const final = (r: Reply) => r.operation !== null && "outcome" in r.operation;

export type SourcePngBackendPreparationDependencies = {
  broker: ReturnType<typeof createSourcePngBroker>;
  stage: ReturnType<typeof createSourcePngPrivateStage>;
  nodeId: string;
  providerForRequest(
    scope: SourcePngBrokerScope,
    runSandbox: SourcePngSandbox,
  ): ReturnType<typeof createSourcePngStorageProducer>;
  worker(
    binding: SourcePngStorageBinding,
    bytes: Uint8Array,
    owner: SourcePngExecutionOwner,
    signal: AbortSignal,
  ): Promise<unknown>;
  assertCurrent(scope: SourcePngBrokerScope): Promise<void>;
};

// Composition over the owning Source journal, durable stage and existing Storage IO.
// No Task, paid model, Admission or client-issued verification is created here.
export function createSourcePngBackendPreparation(
  deps: SourcePngBackendPreparationDependencies,
) {
  uuid.parse(deps.nodeId);
  async function current(scope: SourcePngBrokerScope) {
    scope.signal.throwIfAborted();
    await deps.assertCurrent(scope);
    scope.signal.throwIfAborted();
  }
  async function call(
    scope: SourcePngBrokerScope,
    q: Command,
    action: Parameters<ReturnType<typeof createSourcePngBroker>>[2],
    expected: Json = null,
    detail: Json = null,
  ) {
    await current(scope);
    if (scope.actorId !== q.actor_account_id || scope.tripId !== q.trip_id)
      throw Error("SOURCE_ACCESS_DENIED");
    let phase: "BROKER" | "POST_FENCE" = "BROKER";
    try {
      const r = envelope.parse(await deps.broker(scope, q, action, expected, detail));
      phase = "POST_FENCE";
      await current(scope);
      if (
        r.operation &&
        (r.operation.operation_id !== q.operation_id ||
          r.operation.operation_key !== q.operation_key ||
          r.operation.operation_sha256 !== q.operation_sha256)
      )
        throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
      return r;
    } catch (error) {
      try {
        console.info(
          JSON.stringify({
            event: "source_png_broker_failed",
            command: q.command,
            action,
            phase,
            requestAborted: scope.signal.aborted,
          }),
        );
      } catch {
        // Diagnostics cannot change the owning transaction result.
      }
      throw error;
    }
  }
  function bound(
    scope: SourcePngBrokerScope,
    q: Command,
    b: SourcePngStorageBinding,
    a: z.infer<typeof journal>,
  ) {
    if (
      b.actorAccountId !== scope.actorId ||
      b.tripId !== scope.tripId ||
      b.sourceId !== q.source_id ||
      b.representationId !== q.payload.representation_id ||
      b.materialRevision !== q.payload.material_revision ||
      b.sourceRowRevision !== q.payload.expected_source_row_revision ||
      b.representationRowRevision !== q.payload.expected_representation_row_revision ||
      a.id !== b.attemptId ||
      a.operation_id !== b.operationId ||
      a.canonical_generation !== b.attemptGeneration ||
      a.trip_id !== b.tripId ||
      a.source_id !== b.sourceId ||
      a.representation_id !== b.representationId ||
      a.material_revision !== b.materialRevision ||
      a.operation_key !== b.operationKey ||
      a.operation_sha256 !== b.operationSha256 ||
      a.staged_resource_id !== b.resourceId ||
      a.run_token !== b.runToken ||
      a.profile_sha256 !== b.profileSha256
    )
      throw Error("PNG_SOURCE_BINDING_MISMATCH");
    if (
      q.command === "UPLOAD_ORIGINAL" &&
      (b.operationId !== q.operation_id ||
        b.operationKey !== q.operation_key ||
        b.operationSha256 !== q.operation_sha256 ||
        b.sha256 !== q.payload.payload_sha256 ||
        b.byteCount !== q.payload.byte_count)
    )
      throw Error("PNG_SOURCE_BINDING_MISMATCH");
  }
  function qualified(a: z.infer<typeof journal>) {
    return (
      a.phase === "TERMINAL" &&
      !a.termination_outstanding &&
      a.terminal_result === "PARSE_PASS" &&
      /^[a-f0-9]{64}$/.test(a.terminal_evidence_sha256 ?? "")
    );
  }
  async function finish(
    scope: SourcePngBrokerScope,
    q: Command,
    r: Reply,
    provider: ReturnType<typeof createSourcePngStorageProducer>,
  ) {
    if (final(r) || !r.operation || !("phase" in r.operation) || !r.attempt)
      return r.operation;
    const b = q.command === "UPLOAD_ORIGINAL" ? r.binding : r.uploadBinding;
    const a = q.command === "UPLOAD_ORIGINAL" ? r.journal : r.uploadJournal;
    if (!b || !a) return r.operation;
    bound(scope, q, b, a);
    if (!qualified(a)) return r.operation;
    await current(scope);
    const bytes = await provider.readOriginal({
      accountId: scope.actorId,
      tripId: scope.tripId,
      sourceId: b.sourceId,
      representationId: b.representationId,
      sha256: b.sha256,
      byteCount: b.byteCount,
    });
    await current(scope);
    if (bytes.length !== b.byteCount || hash(bytes) !== b.sha256)
      throw Error("PNG_SOURCE_GET_MISMATCH");
    // This GET is new; the decoder proof is the actual existing upload journal, never reconstructed.
    return (
      await call(
        scope,
        q,
        "FINALIZE",
        { attemptId: r.attempt.id, attemptGeneration: r.attempt.generation },
        { sha256: b.sha256, byteCount: b.byteCount, mimeType: b.mimeType },
      )
    ).operation;
  }
  const noDecode: SourcePngSandbox = async () => {
    throw Error("PNG_RECONCILE_MUST_NOT_REEXECUTE");
  };
  async function reconcile(scope: SourcePngBrokerScope, raw: Command) {
    const q = sourcePngPreparationCommandSchema.parse(raw),
      r = await call(scope, q, "RECONCILE");
    if (q.command === "PREPARE_REPRESENTATION" || final(r)) return r.operation;
    return finish(scope, q, r, deps.providerForRequest(scope, noDecode));
  }
  return {
    async lookup(scope: SourcePngBrokerScope, raw: Command) {
      const q = sourcePngPreparationCommandSchema.parse(raw);
      return (await call(scope, q, "STATUS")).operation;
    },
    reconcile,
    async execute(scope: SourcePngBrokerScope, raw: Command, supplied?: Uint8Array) {
      const q = sourcePngPreparationCommandSchema.parse(raw);
      let r = await call(scope, q, "REGISTER");
      if (!r.operation) throw Error("PNG_SOURCE_OPERATION_UNAVAILABLE");
      if (final(r) || q.command === "PREPARE_REPRESENTATION") return r.operation;
      const retry =
        q.command === "UPLOAD_ORIGINAL" &&
        "phase" in r.operation &&
        r.operation.phase === "IO_QUIESCENT";
      const priorAttempt = retry ? r.attempt : null;
      if (retry && !priorAttempt) throw Error("PNG_SOURCE_PERMIT_INVALID");
      if ("phase" in r.operation && r.operation.phase !== "ADMITTED" && !retry)
        return reconcile(scope, q);
      const bytes = supplied ? Uint8Array.from(supplied) : undefined;
      if (
        q.command === "UPLOAD_ORIGINAL" &&
        (!bytes ||
          bytes.length !== q.payload.byte_count ||
          hash(bytes) !== q.payload.payload_sha256)
      )
        throw Error("PNG_SOURCE_INPUT_MISMATCH");
      const attemptId = randomUUID(),
        ownerRun = randomUUID();
      r = await call(
        scope,
        q,
        "BEGIN",
        q.command === "UPLOAD_ORIGINAL"
          ? {
              attemptId,
              resourceId: randomUUID(),
              nodeId: deps.nodeId,
              resourceKey: randomBytes(32).toString("hex"),
              runToken: randomUUID(),
              ownerRun,
              ...(priorAttempt
                ? {
                    previousAttemptId: priorAttempt.id,
                    previousAttemptGeneration: priorAttempt.generation,
                  }
                : {}),
            }
          : { attemptId },
      );
      if (!r.freshAttempt) return reconcile(scope, q);
      if (
        !r.operation ||
        !("phase" in r.operation) ||
        r.operation.phase !== "IO_ACTIVE" ||
        r.attempt?.id !== attemptId ||
        r.attempt.generation !== r.operation.attempt_generation
      )
        throw Error("PNG_SOURCE_PERMIT_INVALID");
      try {
        if (q.command === "VERIFY_REPRESENTATION")
          return await finish(scope, q, r, deps.providerForRequest(scope, noDecode));
        const b = r.binding,
          a = r.journal;
        if (!b || !a || !bytes) throw Error("PNG_SOURCE_PERMIT_INVALID");
        bound(scope, q, b, a);
        if (
          a.phase !== "STARTING" ||
          a.owner_run !== ownerRun ||
          b.nodeId !== deps.nodeId
        )
          throw Error("PNG_SOURCE_PERMIT_INVALID");
        const ownerExpected = { attemptId: a.id, ownerRun, ownerFence: a.owner_fence };
        const assertOwner = async () => {
          const state = await call(scope, q, "STATUS");
          if (!state.binding || !state.journal)
            throw Error("PNG_EXECUTION_OWNERSHIP_CHANGED");
          bound(scope, q, state.binding, state.journal);
          if (
            JSON.stringify(state.binding) !== JSON.stringify(b) ||
            state.journal.owner_run !== ownerRun ||
            state.journal.owner_fence !== a.owner_fence
          )
            throw Error("PNG_EXECUTION_OWNERSHIP_CHANGED");
        };
        const owner: SourcePngExecutionOwner = {
          assertCurrent: assertOwner,
          async attach(_binding, containerId) {
            await call(scope, q, "EXEC_ATTACH", ownerExpected, {
              nodeId: b.nodeId,
              runToken: b.runToken,
              containerId,
            });
          },
          async running() {
            await call(scope, q, "EXEC_ADVANCE", ownerExpected, { nextPhase: "RUNNING" });
          },
          async terminal(_binding, observed) {
            await call(scope, q, "EXEC_ADVANCE", ownerExpected, {
              nextPhase: "TERMINATION_REQUIRED",
            });
            await call(scope, q, "EXEC_TERMINAL", ownerExpected, {
              nodeId: b.nodeId,
              runToken: b.runToken,
              ...observed,
            });
          },
        };
        await current(scope);
        await deps.stage.seal(
          b,
          (async function* () {
            yield bytes;
          })(),
        );
        await current(scope);
        const staged = await deps.stage.reopen(b);
        await current(scope);
        const provider = deps.providerForRequest(scope, (input) =>
          measureSourcePdfPhase("png_worker", () => deps.worker(b, input, owner, scope.signal)),
        );
        const upload = await provider.upload(
          { binding: b, dispatchId: b.attemptId },
          staged,
        );
        await current(scope);
        if (upload.kind !== "COMPLETE_ACK")
          await call(scope, q, "UNKNOWN", {
            attemptId: r.attempt.id,
            attemptGeneration: r.attempt.generation,
          });
        const observed = await call(scope, q, "STATUS");
        return await finish(scope, q, observed, provider);
      } catch (error) {
        // Keep the same operation/attempt after transport loss; never allocate or POST again.
        if (r.attempt)
          await call(scope, q, "UNKNOWN", {
            attemptId: r.attempt.id,
            attemptGeneration: r.attempt.generation,
          }).catch(() => {});
        throw error;
      }
    },
  };
}
