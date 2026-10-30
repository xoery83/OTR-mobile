import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  assertCaptureCustodyBytes,
  captureMaterialBindingSchema,
  type CaptureMaterialBinding,
} from "@/domain/capture/captureCustody";
import {
  createPendingPdfCommandProposals,
  createPdfDerivativeRequests,
} from "@/domain/trip/sourcePdfPreparationCommands";
import { sourcePdfPrepareReceiptSchema } from "@/domain/trip/sourcePdfPreparation";
import { sourcePdfUploadReceiptSchema } from "@/domain/trip/sourcePdfUploadAuthority";
import {
  sourcePdfV4StatusObservationSchema,
  sourcePdfV4CommandObservationSchema,
} from "../api/sourcePdfV4PreparationContracts";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import type { createSourcePdfV4PreparationTransport } from "../api/sourcePdfV4PreparationTransport";

// Explicit continuation only. Existing local binding + Backend journals own durability/retry.
// No Task, Source acquisition, Candidate or Core Item is created here.
export async function prepareAdmittedPdfOriginal(
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
    transport: ReturnType<typeof createSourcePdfV4PreparationTransport>;
    assertCurrent?(): void;
  },
) {
  const current = async () => {
    deps.assertCurrent?.();
    await assertAccountRequestContext(context, deps.getAccountId);
    deps.assertCurrent?.();
  };
  await current();
  const binding = captureMaterialBindingSchema.parse(input.binding),
    bytes = Uint8Array.from(input.bytes);
  if (binding.accountId !== context.accountId || binding.mediaType !== "application/pdf")
    throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
  assertCaptureCustodyBytes(binding, bytes);
  const proposals = await createPendingPdfCommandProposals(
    { actorId: context.accountId, tripId: context.tripId },
    input.acquisition,
    input.acquisitionReceipt,
    deps.hash,
  );
  await current();
  const q = proposals.upload;
  if (
    q.payload.payload_sha256 !== binding.sha256 ||
    q.payload.byte_count !== binding.byteCount
  )
    throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
  const identity = {
    sourceId: q.source_id,
    representationId: q.payload.representation_id,
    operationId: q.operation_id,
  };
  async function step<T>(work: () => Promise<T>) {
    await current();
    const value = await work();
    await current();
    return value;
  }
  const status = async () =>
    sourcePdfV4StatusObservationSchema.parse(
      await step(() => deps.transport.status(context, identity)),
    ).status;
  let state = await status(),
    uploadComplete = false;
  if (state === "NO_ACTIVE_ATTEMPT") {
    const prepared = await step(() =>
      deps.transport.prepare(
        context,
        { ...identity, operationId: proposals.prepare.operation_id },
        proposals.prepare,
      ),
    );
    if (!("receipt" in prepared)) throw Error("PDF_SOURCE_PREPARATION_UNCONFIRMED");
    const receipt = sourcePdfPrepareReceiptSchema.parse(prepared.receipt);
    if (receipt.outcome !== "APPLIED") throw Error("PDF_SOURCE_PREPARATION_REJECTED");
    const reserved = sourcePdfV4CommandObservationSchema.parse(
      await step(() => deps.transport.reserve(context, identity, q)),
    );
    if (reserved.receipt) {
      const receipt = sourcePdfUploadReceiptSchema.parse(reserved.receipt);
      if (receipt.outcome !== "APPLIED") throw Error("PDF_SOURCE_PREPARATION_REJECTED");
      uploadComplete = true;
    } else state = await status();
  }
  if (!uploadComplete) {
    if (state === "RESERVED") {
      await step(() => deps.transport.stage(context, identity, binding, bytes));
      state = await status();
    }
    if (state === "STAGED") {
      await step(() => deps.transport.dispatch(context, identity));
      state = await status();
    }
    if (state === "ACK_OBSERVED") {
      await step(() => deps.transport.observeRetained(context, identity));
      state = await status();
    }
    if (state !== "READ_OBSERVED") throw Error("PDF_UPLOAD_OUTCOME_UNRESOLVED");
    const finished = sourcePdfV4CommandObservationSchema.parse(
      await step(() => deps.transport.finish(context, identity, q)),
    );
    const receipt = sourcePdfUploadReceiptSchema.parse(finished.receipt);
    if (receipt.outcome !== "APPLIED") throw Error("PDF_SOURCE_PREPARATION_REJECTED");
  }
  const verification = await step(() =>
    deps.transport.verifyOriginal(context, proposals.verify),
  );
  const requests = await createPdfDerivativeRequests(proposals, verification, deps.hash);
  await current();
  await step(() => deps.transport.registerDerived(context, requests.registration));
  return step(() => deps.transport.seal(context, requests.seal));
}
