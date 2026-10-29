import { z } from "zod";
import {
  sourcePdfV2UploadBindingSchema,
  type SourcePdfV2UploadBinding,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { authenticate, type DevBackendGateway } from "./app";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  sourcePdfBackendBindingSchema,
  type PdfBackendBinding,
  type SourcePdfStorageProducer,
  type SourcePdfStorageProducerFor,
} from "./sourcePdfStorageProducer";
import type {
  SourcePdfPrivateStage,
  SourcePdfPrivateStageFor,
} from "./sourcePdfPrivateStage";

export type PdfIngressIdentity = {
  tripId: string;
  sourceId: string;
  representationId: string;
  operationId: string;
  accountGeneration: number;
};
type PreparationBinding = PdfBackendBinding | SourcePdfV2UploadBinding;
export type PdfReservedContext<B extends PreparationBinding = PdfBackendBinding> = {
  binding: B;
  accountGeneration: number;
  dispatchId: string | null;
  ownerRun: string;
  ownerFence: number;
};
// Required owning ports, not a proposed Source v2 DTO or a substitute execution ledger.
export type PdfPreparationAuthority<B extends PreparationBinding = PdfBackendBinding> = {
  resolveReserved(
    actorId: string,
    identity: PdfIngressIdentity,
  ): Promise<PdfReservedContext<B>>;
  assertCurrent(context: PdfReservedContext<B>): Promise<void>;
  canResumeSealedStage?(context: PdfReservedContext<B>): Promise<boolean>;
  recordStage?(
    context: PdfReservedContext<B>,
    sealed: Awaited<ReturnType<SourcePdfPrivateStageFor<B>["seal"]>>,
  ): Promise<void>;
  prepareRead?(context: PdfReservedContext<B>): Promise<{
    readId: string;
    ackEvidenceSha256: string;
    retainedEvidenceSha256?: string;
  }>;
  consumeDispatch(context: PdfReservedContext<B>): Promise<{ dispatchId: string } | null>;
  recordObservation(
    context: PdfReservedContext<B>,
    observation:
      | Awaited<ReturnType<SourcePdfStorageProducerFor<B>["upload"]>>
      | Awaited<ReturnType<SourcePdfStorageProducerFor<B>["read"]>>,
  ): Promise<string>;
};
// No caller in server.ts/app routing. Composition requires reviewed Source ports explicitly.
export function createSourcePdfBackendPreparation(
  gateway: DevBackendGateway,
  authority: PdfPreparationAuthority,
  stage: SourcePdfPrivateStage,
  provider: SourcePdfStorageProducer,
) {
  return createPreparation(
    gateway,
    authority,
    stage,
    provider,
    sourcePdfBackendBindingSchema,
  );
}
export function createSourcePdfV2BackendPreparation(
  gateway: DevBackendGateway,
  authority: PdfPreparationAuthority<SourcePdfV2UploadBinding> &
    Required<
      Pick<
        PdfPreparationAuthority<SourcePdfV2UploadBinding>,
        "recordStage" | "prepareRead"
      >
    >,
  stage: SourcePdfPrivateStageFor<SourcePdfV2UploadBinding>,
  provider: SourcePdfStorageProducerFor<SourcePdfV2UploadBinding>,
) {
  if (!authority.recordStage) throw new Error("PDF_CAUSAL_STAGE_PORT_REQUIRED");
  if (!authority.prepareRead) throw new Error("PDF_CAUSAL_READ_PORT_REQUIRED");
  return createPreparation(
    gateway,
    authority,
    stage,
    provider,
    sourcePdfV2UploadBindingSchema,
  );
}
function createPreparation<B extends PreparationBinding>(
  gateway: DevBackendGateway,
  authority: PdfPreparationAuthority<B>,
  stage: SourcePdfPrivateStageFor<B>,
  provider: SourcePdfStorageProducerFor<B>,
  bindingSchema: z.ZodType<B>,
) {
  const busy = new Set<string>();
  async function context(request: Request, identity: PdfIngressIdentity) {
    const actor = await authenticate(request, gateway);
    if (!(await gateway.canReadTrip(actor.id, identity.tripId)))
      throw new Error("PDF_SCOPE_FORBIDDEN");
    const current = await authority.resolveReserved(actor.id, identity);
    const b = bindingSchema.parse(current.binding);
    if (
      b.actorAccountId !== actor.id ||
      b.tripId !== identity.tripId ||
      b.sourceId !== identity.sourceId ||
      b.representationId !== identity.representationId ||
      b.operationId !== identity.operationId ||
      !Number.isSafeInteger(identity.accountGeneration) ||
      identity.accountGeneration < 1 ||
      current.accountGeneration !== identity.accountGeneration
    )
      throw new Error("PDF_SCOPE_FORBIDDEN");
    if (
      (b.uploadVersion === 3 || b.uploadVersion === 4) &&
      b.providerInstanceSha256 !== provider.configurationSha256
    )
      throw new Error("PDF_PROVIDER_BINDING_CONFLICT");
    await authority.assertCurrent(current);
    return current;
  }
  async function dispatch(current: PdfReservedContext<B>, signal?: AbortSignal) {
    const id = current.binding.attemptId;
    if (busy.has(id)) throw new Error("PDF_DUPLICATE_DISPATCH");
    busy.add(id);
    try {
      await authority.assertCurrent(current);
      const bytes = await stage.reopen(current.binding);
      signal?.throwIfAborted();
      // Owning port must consume a durable grant before remote IO, including after restart.
      const grant = await authority.consumeDispatch(current);
      if (
        !grant ||
        (current.dispatchId !== null && current.dispatchId !== grant.dispatchId)
      )
        throw new Error("PDF_DUPLICATE_DISPATCH");
      const dispatched = { ...current, dispatchId: grant.dispatchId };
      const ack = await provider.upload(
        { binding: dispatched.binding, dispatchId: dispatched.dispatchId },
        bytes,
      );
      const evidenceReference = await authority.recordObservation(dispatched, ack);
      await authority.assertCurrent(dispatched);
      return { ...ack, evidenceReference };
    } finally {
      busy.delete(id);
    }
  }
  return {
    async ingress(request: Request, identity: PdfIngressIdentity) {
      const current = await context(request, identity);
      if (
        request.method !== "POST" ||
        request.headers.get("content-type") !== "application/pdf" ||
        request.headers.get("content-encoding") ||
        !request.body
      )
        throw new Error("PDF_INGRESS_UNSUPPORTED");
      const length = request.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) !== current.binding.byteCount)
      )
        throw new Error("PDF_LENGTH_MISMATCH");
      const reader = request.body.getReader();
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const stream = (async function* () {
          for (;;) {
            signal.throwIfAborted();
            const r = await reader.read();
            signal.throwIfAborted();
            if (r.done) break;
            yield r.value;
          }
        })();
        const sealed = await stage.seal(current.binding, stream);
        await authority.assertCurrent(current);
        if (
          (current.binding.uploadVersion === 3 || current.binding.uploadVersion === 4) &&
          !authority.recordStage
        )
          throw new Error("PDF_CAUSAL_STAGE_PORT_REQUIRED");
        await authority.recordStage?.(current, sealed);
        return { context: current, stage: sealed };
      } finally {
        signal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    async upload(request: Request, identity: PdfIngressIdentity, signal?: AbortSignal) {
      const current = await context(request, identity);
      signal?.throwIfAborted();
      return dispatch(current, signal);
    },
    async observeRetained(request: Request, identity: PdfIngressIdentity) {
      const current = await context(request, identity);
      if (!current.dispatchId) throw new Error("DISPATCH_ID_REQUIRED");
      if (
        (current.binding.uploadVersion === 3 || current.binding.uploadVersion === 4) &&
        !authority.prepareRead
      )
        throw new Error("PDF_CAUSAL_READ_PORT_REQUIRED");
      const permit = await authority.prepareRead?.(current);
      if (permit?.retainedEvidenceSha256)
        return {
          kind: "PERSISTED_GET" as const,
          evidenceReference: permit.retainedEvidenceSha256,
        };
      const observation = await provider.read({
        binding: current.binding,
        dispatchId: current.dispatchId,
        ...permit,
      });
      const evidenceReference = await authority.recordObservation(current, observation);
      await authority.assertCurrent(current);
      if (
        canonicalCoreJson(observation.request.binding) !==
        canonicalCoreJson(current.binding)
      )
        throw new Error("PDF_SCOPE_FORBIDDEN");
      return { ...observation, evidenceReference };
    },
  };
}
