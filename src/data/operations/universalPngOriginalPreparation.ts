import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  captureMaterialBindingSchema,
  assertCaptureCustodyBytes,
  type CaptureMaterialBinding,
} from "@/domain/capture/captureCustody";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import {
  createPendingPngCommandProposals,
  sourcePngOriginalUploadCommandSchema,
  sourcePngPendingReplySchema,
} from "@/domain/trip/sourcePngPreparationCommands";
import { checkBinaryOriginalResult } from "@/domain/trip/sourceBinaryOriginalCommands";
import { sourcePdfPrepareCommandSchema } from "@/domain/trip/sourcePdfPreparation";
import { sourcePdfVerifyCommandSchema } from "@/domain/trip/sourcePdfRegistration";

type Proposals = Awaited<ReturnType<typeof createPendingPngCommandProposals>>;
export type PngOriginalCommand = Proposals[keyof Proposals];
export type PngOriginalMaterial = { binding: CaptureMaterialBinding; bytes: Uint8Array };
// A missing concrete server adapter stays closed. Replies are the existing Source
// operation reply, not a client-issued upload/verification receipt.
export type PngOriginalPreparationPort = {
  lookup(
    context: AccountRequestContext,
    command: PngOriginalCommand,
  ): Promise<unknown | null>;
  execute(
    context: AccountRequestContext,
    command: PngOriginalCommand,
    material?: PngOriginalMaterial,
  ): Promise<unknown>;
  // Owning reconciliation of the existing operation ONLY; never repeat Storage POST.
  reconcile(
    context: AccountRequestContext,
    command: PngOriginalCommand,
  ): Promise<unknown>;
};
const cloneCommand = (q: PngOriginalCommand): PngOriginalCommand =>
  q.command === "UPLOAD_ORIGINAL"
    ? sourcePngOriginalUploadCommandSchema.parse(q)
    : q.command === "PREPARE_REPRESENTATION"
      ? sourcePdfPrepareCommandSchema.parse(q)
      : sourcePdfVerifyCommandSchema.parse(q);

// Explicit original-only continuation; no derivative, Task, queue or provider authority.
export async function prepareAdmittedPngOriginal(
  context: AccountRequestContext,
  input: {
    acquisition: unknown;
    acquisitionReceipt: unknown;
    binding: CaptureMaterialBinding;
    bytes: Uint8Array;
  },
  deps: {
    getAccountId(): Promise<string>;
    hash: ImportHash;
    port?: PngOriginalPreparationPort;
    assertCurrent?(): void;
    signal?: AbortSignal;
  },
) {
  const current = async () => {
    deps.assertCurrent?.();
    await assertAccountRequestContext(context, deps.getAccountId);
    if (deps.signal?.aborted) throw Error("PHOTO_IMPORT_CANCELLED");
    deps.assertCurrent?.();
  };
  await current();
  if (!deps.port) throw Error("UNIVERSAL_PNG_PREPARATION_UNAVAILABLE");
  const port: PngOriginalPreparationPort = deps.port;
  const binding = captureMaterialBindingSchema.parse(input.binding),
    bytes = Uint8Array.from(input.bytes);
  if (
    binding.accountId !== context.accountId ||
    binding.mediaType !== "image/png" ||
    binding.version !== 2 ||
    (binding.kind !== "IMAGE" && binding.kind !== "FILE")
  )
    throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
  assertCaptureCustodyBytes(binding, bytes);
  const proposals = await createPendingPngCommandProposals(
    { actorId: context.accountId, tripId: context.tripId },
    input.acquisition,
    input.acquisitionReceipt,
    deps.hash,
  );
  await current();
  if (
    proposals.upload.payload.payload_sha256 !== binding.sha256 ||
    proposals.upload.payload.byte_count !== binding.byteCount
  )
    throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
  async function step<T>(work: () => Promise<T>) {
    await current();
    const value = await work();
    await current();
    return value;
  }
  function pending(raw: unknown, q: PngOriginalCommand) {
    if (!raw || typeof raw !== "object" || !("phase" in raw)) return false;
    const r = sourcePngPendingReplySchema.parse(raw);
    if (
      r.operation_id !== q.operation_id ||
      r.operation_key !== q.operation_key ||
      r.operation_sha256 !== q.operation_sha256
    )
      throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
    return true;
  }
  async function receipt(raw: unknown, q: PngOriginalCommand) {
    if (pending(raw, q)) throw Error("PNG_UPLOAD_OUTCOME_UNRESOLVED");
    const r = await checkBinaryOriginalResult(
      raw,
      deps.hash,
      "PNG_SOURCE_RECEIPT_MISMATCH",
    );
    await current();
    if (
      r.operation_id !== q.operation_id ||
      r.operation_key !== q.operation_key ||
      r.operation_sha256 !== q.operation_sha256 ||
      r.command !== q.command ||
      r.source_id !== q.source_id ||
      r.representation_id !== q.payload.representation_id
    )
      throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
    if (r.outcome !== "APPLIED" || r.error_code !== null)
      throw Error("PNG_SOURCE_PREPARATION_REJECTED");
    if (
      r.result_material_revision !== q.payload.material_revision ||
      r.result_source_row_revision !== q.payload.expected_source_row_revision ||
      r.result_retention_state !== "RETAINED" ||
      r.result_action_id !== null ||
      r.result_representation_row_revision !==
        q.payload.expected_representation_row_revision +
          (q.command === "VERIFY_REPRESENTATION" ? 1 : 0) ||
      r.result_remote_state !==
        (q.command === "VERIFY_REPRESENTATION" ? "VERIFIED" : "PENDING") ||
      (q.command === "VERIFY_REPRESENTATION"
        ? !r.result_verified_at
        : r.result_verified_at !== null)
    )
      throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
    return r;
  }
  async function settle(q: PngOriginalCommand) {
    let raw = await step(() => port.lookup(context, cloneCommand(q)));
    if (raw === null)
      raw = await step(() =>
        port.execute(
          context,
          cloneCommand(q),
          q.command === "UPLOAD_ORIGINAL"
            ? {
                binding: captureMaterialBindingSchema.parse(binding),
                bytes: Uint8Array.from(bytes),
              }
            : undefined,
        ),
      );
    else if (pending(raw, q))
      raw = await step(() => port.reconcile(context, cloneCommand(q)));
    return receipt(raw, q);
  }
  await settle(proposals.prepare);
  await settle(proposals.upload);
  const verified = await settle(proposals.verify);
  const readback = await step(() => port.lookup(context, cloneCommand(proposals.verify)));
  if (readback === null) throw Error("PNG_SOURCE_PREPARATION_UNCONFIRMED");
  const confirmed = await receipt(readback, proposals.verify);
  if (confirmed.result_sha256 !== verified.result_sha256)
    throw Error("PNG_SOURCE_RECEIPT_MISMATCH");
  return confirmed;
}
