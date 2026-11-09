import { z } from "zod";
import { universalRetainedOriginalPrepareSchema as wireSchema } from "../../src/data/api/universalImportContracts";
import { createHash } from "node:crypto";
import { checkBinaryOriginalResult } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import {
  createPdfDerivativeRequests,
  createPendingPdfCommandProposals,
} from "../../src/domain/trip/sourcePdfPreparationCommands";
import {
  createPendingPngCommandProposals,
  sourcePngPendingReplySchema,
} from "../../src/domain/trip/sourcePngPreparationCommands";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { universalOriginalAcquisitionSchema } from "./universalOriginalSource";
import { universalBatchInputsSchema } from "./universalBatchSource";
import type { SourcePngPreparationForRequest } from "./sourcePngPreparationHttp";
import type { createSourcePdfRuntimePorts } from "./sourcePdfRuntime";

export const universalRetainedOriginalPrepareSchema = wireSchema.extend({
  retainedOriginals: wireSchema.shape.retainedOriginals.element
    .extend({ acquisition: universalOriginalAcquisitionSchema })
    .array()
    .min(1)
    .max(64),
});
type Batch = z.infer<typeof universalBatchInputsSchema>;
type Original = z.infer<
  typeof universalRetainedOriginalPrepareSchema.shape.retainedOriginals
>[number];
type Scope = { actorId: string; tripId: string; signal: AbortSignal };
type PdfPlan = Awaited<ReturnType<typeof createPendingPdfCommandProposals>>;
type PngPlan = Awaited<ReturnType<typeof createPendingPngCommandProposals>>;
export class OriginalBytesRequired extends Error {
  constructor(readonly inputId: string) {
    super("UNIVERSAL_ORIGINAL_BYTES_REQUIRED");
  }
}
type Operation = (PdfPlan | PngPlan)["prepare" | "upload" | "verify"];

export async function prepareUniversalRetainedOriginals(
  scope: Scope,
  batch: Batch,
  originals: Original[],
  deps: {
    hash: ImportHash;
    assertCurrent(): Promise<void>;
    lookupAcquisition(raw: Original["acquisition"]): Promise<unknown>;
    acquire?(raw: Original["acquisition"]): Promise<unknown>;
    originalUpload?: z.infer<typeof wireSchema>["originalUpload"];
    onOriginalStaged?(): void;
    uploadPdf?(plan: PdfPlan, requireBytes: () => Buffer): Promise<unknown>;
    lookupOperation(command: Operation): Promise<unknown>;
    openPdf?: () => ReturnType<
      ReturnType<typeof createSourcePdfRuntimePorts>["sourcePdfV2ForRequest"]
    >;
    openPng?: () => ReturnType<SourcePngPreparationForRequest>;
  },
) {
  const current = async () => {
    scope.signal.throwIfAborted();
    await deps.assertCurrent();
    scope.signal.throwIfAborted();
  };
  const step = async <T>(work: () => Promise<T>) => {
    scope.signal.throwIfAborted();
    const value = await work();
    scope.signal.throwIfAborted();
    return value;
  };
  async function applied(raw: unknown, command: Operation) {
    const r = await checkBinaryOriginalResult(raw, deps.hash, "SOURCE_RECEIPT_MISMATCH");
    const verified = command.command === "VERIFY_REPRESENTATION";
    if (
      r.command !== command.command ||
      r.operation_id !== command.operation_id ||
      r.operation_key !== command.operation_key ||
      r.operation_sha256 !== command.operation_sha256 ||
      r.source_id !== command.source_id ||
      r.representation_id !== command.payload.representation_id ||
      r.outcome !== "APPLIED" ||
      r.error_code !== null ||
      r.result_source_row_revision !== command.payload.expected_source_row_revision ||
      r.result_material_revision !== command.payload.material_revision ||
      r.result_representation_row_revision !==
        command.payload.expected_representation_row_revision + (verified ? 1 : 0) ||
      r.result_remote_state !== (verified ? "VERIFIED" : "PENDING") ||
      r.result_retention_state !== "RETAINED" ||
      r.result_action_id !== null ||
      (verified ? !r.result_verified_at : r.result_verified_at !== null)
    )
      throw Error("SOURCE_RECEIPT_MISMATCH");
    return r;
  }
  const selected = originals.map(({ inputId, acquisition }) => {
    const pin = batch.inputs.find((input) => input.id === inputId);
    const original = acquisition.payload.original;
    if (
      !pin ||
      acquisition.actor_account_id !== scope.actorId ||
      acquisition.trip_id !== scope.tripId ||
      acquisition.source_id !== pin.source_id ||
      original.id !== pin.representation_id ||
      original.payload_sha256 !== pin.payload_sha256 ||
      original.byte_count !== pin.byte_count
    )
      throw Error("UNIVERSAL_RETAINED_SOURCE_SCOPE");
    const format =
      original.mime_type === "image/png"
        ? "PNG"
        : original.mime_type === "application/pdf"
          ? "PDF"
          : "TEXT";
    if ((format === "PNG" && !deps.openPng) || (format === "PDF" && !deps.openPdf))
      throw Error("UNIVERSAL_RETAINED_SOURCE_UNAVAILABLE");
    return { acquisition, pin, format };
  });
  if (
    new Set(selected.map(({ pin }) => pin.id)).size !== selected.length ||
    selected.filter(({ format }) => format === "PNG").length > 1
  )
    throw Error("UNIVERSAL_RETAINED_SOURCE_SCOPE");
  const upload = deps.originalUpload;
  let supplied: Buffer | undefined;
  if (upload) {
    const input = selected.find(({ pin }) => pin.id === upload.inputId);
    supplied = Buffer.from(upload.base64, "base64");
    if (
      !input ||
      input.format === "TEXT" ||
      (input.format === "PNG" && supplied.length > 1048576) ||
      supplied.toString("base64") !== upload.base64 ||
      supplied.length !== input.pin.byte_count ||
      createHash("sha256").update(supplied).digest("hex") !== input.pin.payload_sha256
    )
      throw Error("SOURCE_INTEGRITY_FAILURE");
  }
  await current();
  async function complete(
    { acquisition, pin, format }: (typeof selected)[number],
    onPngUploadLocated?: () => void,
  ) {
    const requireBytes = () => {
      if (upload?.inputId !== pin.id || !supplied)
        throw new OriginalBytesRequired(pin.id);
      return supplied;
    };
    let acquired = await step(() => deps.lookupAcquisition(acquisition));
    if (acquired === null && deps.acquire) {
      await current();
      acquired = await step(() => deps.acquire!(acquisition));
    }
    if (acquired === null) throw Error("UNIVERSAL_RETAINED_ACQUISITION_UNCONFIRMED");
    if (format === "TEXT") return;
    const commands =
      format === "PNG"
        ? {
            format,
            ...(await createPendingPngCommandProposals(
              scope,
              acquisition,
              acquired,
              deps.hash,
            )),
          }
        : {
            format,
            ...(await createPendingPdfCommandProposals(
              scope,
              acquisition,
              acquired,
              deps.hash,
            )),
          };
    if (
      commands.upload.payload.material_revision !== pin.material_revision ||
      commands.upload.payload.expected_source_row_revision !==
        pin.observed_source_row_revision
    )
      throw Error("UNIVERSAL_RETAINED_SOURCE_SCOPE");

    if (!("sealOperationId" in commands)) {
      await current();
      const owned = await deps.openPng!();
      if (!owned) throw Error("UNIVERSAL_RETAINED_SOURCE_UNAVAILABLE");
      try {
        const port = owned.port;
        const upload = await step(() => port.lookup(scope, commands.upload));
        const pendingUpload = sourcePngPendingReplySchema.safeParse(upload).data;
        if (
          pendingUpload &&
          (pendingUpload.operation_id !== commands.upload.operation_id ||
            pendingUpload.operation_key !== commands.upload.operation_key ||
            pendingUpload.operation_sha256 !== commands.upload.operation_sha256)
        )
          throw Error("SOURCE_RECEIPT_MISMATCH");
        const needsBytes =
          upload === null ||
          (pendingUpload?.phase === "ADMITTED" && pendingUpload.attempt_generation === 0);
        const pngBytes = needsBytes ? requireBytes() : undefined;
        onPngUploadLocated?.();
        if (pngBytes) {
          await applied(
            await step(
              async () =>
                (await port.lookup(scope, commands.prepare)) ??
                port.execute(scope, commands.prepare),
            ),
            commands.prepare,
          );
          await applied(
            await step(() => port.execute(scope, commands.upload, pngBytes, deps.onOriginalStaged)),
            commands.upload,
          );
        } else if (upload && typeof upload === "object" && "phase" in upload) {
          // Reconcile an existing attempt through its owner; never resend bytes.
          await applied(
            await step(() => port.reconcile(scope, commands.upload)),
            commands.upload,
          );
        } else {
          await applied(upload, commands.upload);
        }
        const verified = await step(() => port.lookup(scope, commands.verify));
        if (
          verified === null ||
          (typeof verified === "object" &&
            sourcePngPendingReplySchema.safeParse(verified).data?.phase === "ADMITTED")
        ) {
          const issued = await applied(
            await step(() => port.execute(scope, commands.verify)),
            commands.verify,
          );
          const observed = await applied(
            await step(() => port.lookup(scope, commands.verify)),
            commands.verify,
          );
          if (issued.result_sha256 !== observed.result_sha256)
            throw Error("SOURCE_RECEIPT_MISMATCH");
        } else if (typeof verified === "object" && "phase" in verified) {
          await applied(
            await step(() => port.reconcile(scope, commands.verify)),
            commands.verify,
          );
        } else {
          await applied(verified, commands.verify);
        }
      } finally {
        owned.close();
      }
      return;
    }
    // A retained-read observation or pending upload cannot substitute for Finish.
    let uploaded = await step(() => deps.lookupOperation(commands.upload));
    if (uploaded === null && deps.uploadPdf)
      uploaded = await step(() => deps.uploadPdf!(commands, requireBytes));
    if (uploaded === null || (typeof uploaded === "object" && "phase" in uploaded))
      throw Error("UNIVERSAL_RETAINED_UPLOAD_UNCONFIRMED");
    await applied(uploaded, commands.upload);
    const prior = await step(() => deps.lookupOperation(commands.verify));
    let verified = null;
    if (prior !== null && typeof prior === "object" && "phase" in prior) {
      const pending = sourcePngPendingReplySchema.parse(prior);
      if (
        pending.operation_id !== commands.verify.operation_id ||
        pending.operation_key !== commands.verify.operation_key ||
        pending.operation_sha256 !== commands.verify.operation_sha256
      )
        throw Error("SOURCE_RECEIPT_MISMATCH");
      if (pending.phase !== "ADMITTED")
        throw Error("UNIVERSAL_RETAINED_VERIFY_UNCONFIRMED");
    } else if (prior !== null) {
      verified = await applied(prior, commands.verify);
    }
    await current();
    const owned = await deps.openPdf!();
    try {
      const { actorId, tripId } = scope;
      const receipt =
        verified ??
        (await step(() => owned.port.verifyOriginal(actorId, tripId, commands.verify)));
      const requests = await createPdfDerivativeRequests(commands, receipt, deps.hash);
      await step(() =>
        owned.port.registerDerived(actorId, tripId, requests.registration),
      );
      await step(() => owned.port.seal(actorId, tripId, requests.seal));
    } finally {
      owned.close();
    }
  }
  // The existing Source principal serializes PG leases. Only overlap the two worker lanes.
  const failures: unknown[] = [];
  const settle = async (input: (typeof selected)[number], onPngUploadLocated?: () => void) => {
    try {
      await complete(input, onPngUploadLocated);
    } catch (error) {
      failures.push(error);
    }
  };
  const completeOtherInputs = async () => {
    for (const input of selected) if (input.format !== "PNG") await settle(input);
  };
  const png = selected.find((input) => input.format === "PNG");
  if (png && !upload) {
    // A missing PNG challenge does not need to wait for a separate PDF seal.
    let otherInputs: Promise<void> | undefined;
    await settle(png, () => { otherInputs = completeOtherInputs(); });
    if (otherInputs) await otherInputs;
    else if (!failures.some((error) => error instanceof OriginalBytesRequired))
      await completeOtherInputs();
  } else {
    await Promise.all([completeOtherInputs(), png && settle(png)]);
  }
  await current();
  if (failures.length) {
    throw (
      failures.find((error) => !(error instanceof OriginalBytesRequired)) ?? failures[0]
    );
  }
}
