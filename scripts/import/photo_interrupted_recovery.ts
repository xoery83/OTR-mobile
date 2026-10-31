import { createHash } from "node:crypto";
import { z } from "zod";
import { readUniversalContinuousConfig } from "../../backend/src/universalContinuousConfig";
import { createSourcePgConnection } from "../../backend/src/tripCoreV2PgConnection";
import { universalPgTransaction } from "../../backend/src/universalPg";
import { createSourcePngCloseControl } from "../../backend/src/sourcePngCloseControl";
import { sourcePngStorageBindingSchema } from "../../backend/src/sourcePngStorageProducer";
import {
  sourcePngOriginalUploadCommandSchema,
  sourcePngPendingReplySchema,
} from "../../src/domain/trip/sourcePngPreparationCommands";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";

// One frozen operator packet only; never mounted in the public API or supplied by Native.
declare const OTR_PNG_RECOVERY_PACKET_JSON: string;
declare const OTR_PNG_RECOVERY_PACKET_SHA256: string;
let stage = "PACKET";
async function main() {
  const mode = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !["verify", "record-negative", "quiesce"].includes(mode)
  )
    throw Error("PNG_RECOVERY_MODE_DENIED");
  const digest = createHash("sha256").update(OTR_PNG_RECOVERY_PACKET_JSON).digest("hex");
  if (digest !== OTR_PNG_RECOVERY_PACKET_SHA256) throw Error("PNG_RECOVERY_PACKET_DRIFT");
  const p = z
    .strictObject({
      command: sourcePngOriginalUploadCommandSchema,
      binding: sourcePngStorageBindingSchema,
      ownerRun: z.uuid(),
      ownerFence: z.number().int().positive(),
      workerInactive: z.literal(true),
      markerRetained: z.literal(true),
      physical: z.strictObject({
        status: z.literal("TERMINATED"),
        terminated: z.literal(true),
      }),
      observedAt: z.iso.datetime(),
      markerRawSHA256: z.string().regex(/^[a-f0-9]{64}$/),
      containerId: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(JSON.parse(OTR_PNG_RECOVERY_PACKET_JSON));
  const q = p.command,
    b = p.binding;
  if (
    q.actor_account_id !== "f4b059c5-8241-4ffb-aa15-37fa25474543" ||
    q.trip_id !== "825f79b2-4a9d-4535-a62e-43000ca50c4a" ||
    q.source_id !== "df39c9b2-fc19-4baa-8c7c-aafd0f04726f" ||
    q.operation_id !== "d2f59e69-59c0-83bf-b745-a2c6727cb618" ||
    b.attemptId !== "077c0f34-f9e2-438c-b922-42bb3283566f" ||
    b.attemptGeneration !== 1 ||
    b.actorAccountId !== q.actor_account_id ||
    b.tripId !== q.trip_id ||
    b.sourceId !== q.source_id ||
    b.representationId !== q.payload.representation_id ||
    b.operationId !== q.operation_id ||
    b.operationKey !== q.operation_key ||
    b.operationSha256 !== q.operation_sha256 ||
    b.sha256 !== q.payload.payload_sha256 ||
    b.byteCount !== q.payload.byte_count
  )
    throw Error("PNG_RECOVERY_SCOPE_DENIED");
  stage = "CONFIG";
  const config = await readUniversalContinuousConfig(process.env);
  if (!config) throw Error("PNG_RECOVERY_CONFIG_UNAVAILABLE");
  const connection = createSourcePgConnection(config.sourcePg),
    signal = AbortSignal.timeout(90000);
  const state = await createSourcePngCloseControl(connection).read();
  if (
    state.actorId !== q.actor_account_id ||
    state.tripId !== q.trip_id ||
    state.closed !== (mode !== "quiesce")
  )
    throw Error("PNG_RECOVERY_GATE_STATE_DRIFT");
  const call = async (action: string, expected: unknown = null, proof: unknown = null) =>
    universalPgTransaction(
      connection,
      async (lease) => {
        const who = (
          await lease.query("SELECT session_user AS principal,current_user AS role")
        ).rows[0];
        if (
          who?.principal !== "otr_trip_source_command_gateway" ||
          who.role !== who.principal
        )
          throw Error("PNG_RECOVERY_PRINCIPAL_DENIED");
        return (
          await lease.query(
            "SELECT public.trip_source_png_operation($1::uuid,$2::text,$3::text,$4::jsonb,$5::jsonb) AS result",
            [
              q.actor_account_id,
              canonicalCoreJson(q),
              action,
              JSON.stringify(expected),
              JSON.stringify(proof),
            ],
          )
        ).rows[0]?.result as Record<string, unknown>;
      },
      false,
      () => signal.throwIfAborted(),
    );
  const snapshot = async () => {
    const r = await call("STATUS"),
      current = sourcePngPendingReplySchema.parse(r.operation);
    if (
      current.operation_id !== q.operation_id ||
      current.operation_key !== q.operation_key ||
      current.operation_sha256 !== q.operation_sha256 ||
      current.attempt_generation !== 1 ||
      canonicalCoreJson(sourcePngStorageBindingSchema.parse(r.binding)) !==
        canonicalCoreJson(b)
    )
      throw Error("PNG_RECOVERY_OPERATION_DRIFT");
    const j = z
      .object({
        id: z.uuid(),
        owner_run: z.uuid(),
        owner_fence: z.number().int(),
        phase: z.string(),
        container_id: z.string().nullable(),
        terminal_result: z.string().nullable(),
        terminal_evidence_sha256: z.string().nullable(),
        termination_outstanding: z.boolean(),
      })
      .parse(r.journal);
    if (
      j.container_id !== p.containerId ||
      j.id !== b.attemptId ||
      j.owner_run !== p.ownerRun ||
      j.owner_fence !== p.ownerFence
    )
      throw Error("PNG_RECOVERY_OWNER_DRIFT");
    return { operation: current, journal: j };
  };
  stage = "STATUS";
  let actual = await snapshot();
  const owner = {
    attemptId: b.attemptId,
    ownerRun: p.ownerRun,
    ownerFence: p.ownerFence,
  };
  if (mode === "record-negative") {
    if (actual.journal.phase === "RUNNING") {
      stage = "TERMINATION_REQUIRED";
      await call("EXEC_ADVANCE", owner, { nextPhase: "TERMINATION_REQUIRED" });
      actual = await snapshot();
    }
    if (actual.journal.phase === "TERMINATION_REQUIRED") {
      stage = "NEGATIVE_TERMINAL";
      await call("EXEC_TERMINAL", owner, {
        nodeId: b.nodeId,
        runToken: b.runToken,
        containerId: p.containerId,
        observedAt: p.observedAt,
        evidenceSha256: digest,
        result: "PARSER_CRASH",
      });
      actual = await snapshot();
    }
    if (
      actual.journal.phase !== "TERMINAL" ||
      actual.journal.terminal_result !== "PARSER_CRASH" ||
      actual.journal.termination_outstanding ||
      actual.journal.terminal_evidence_sha256 !== digest
    )
      throw Error("PNG_RECOVERY_NEGATIVE_UNCONFIRMED");
  } else if (mode === "quiesce") {
    stage = "QUIESCE_NEGATIVE";
    await call("QUIESCE_NEGATIVE", { attemptId: b.attemptId, attemptGeneration: 1 });
    actual = await snapshot();
    if (actual.operation.phase !== "IO_QUIESCENT")
      throw Error("PNG_RECOVERY_QUIESCENCE_UNCONFIRMED");
  }
  console.log(
    JSON.stringify({
      status: "PNG_RECOVERY_" + mode.toUpperCase().replaceAll("-", "_") + "_VERIFIED",
      sourceId: q.source_id,
      operationId: q.operation_id,
      attemptId: b.attemptId,
      generation: 1,
      operationPhase: actual.operation.phase,
      journalPhase: actual.journal.phase,
      terminalResult: actual.journal.terminal_result,
      negativeProofMatchesPacket:
        actual.journal.phase === "TERMINAL" &&
        actual.journal.terminal_result === "PARSER_CRASH" &&
        !actual.journal.termination_outstanding &&
        actual.journal.terminal_evidence_sha256 === digest,
      originalAndStageRetained: true,
      decoderOrStorageStarted: false,
      providerCalls: 0,
    }),
  );
}
void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^PNG_RECOVERY_[A-Z_]+$/.test(error.message)
      ? error.message
      : "PNG_RECOVERY_UNCONFIRMED";
  console.error(JSON.stringify({ status: "UNCONFIRMED", stage, code }));
  process.exitCode = 1;
});
