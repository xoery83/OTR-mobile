import {
  sourcePdfPrepareCommandSchema,
  sourcePdfPrepareReceiptSchema,
} from "../../src/domain/trip/sourcePdfPreparation";
import { randomBytes, randomUUID } from "node:crypto";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { sourcePdfV2UploadCommandSchema } from "../../src/domain/trip/sourcePdfV2Upload";
import type { PdfIngressIdentity } from "./sourcePdfBackendPreparation";
import type {
  createSourcePdfV2CausalAuthority,
  PdfCausalOwner,
} from "./sourcePdfCausalAuthority";

type Authority = Pick<
  ReturnType<typeof createSourcePdfV2CausalAuthority>,
  "admit" | "finish" | "resolveReserved" | "prepare"
>;

// Unbound: the parent authenticates and checks Trip access; SQL remains the issuer.
export function createSourcePdfV4Reservation(
  authority: Authority,
  owner: Pick<PdfCausalOwner, "accountGeneration">,
  nodeId: string,
) {
  coreUuid.parse(nodeId);
  async function validate(actor: string, raw: string, identity: PdfIngressIdentity) {
    coreUuid.parse(actor);
    // Only the frozen Source command is accepted; no client resource capabilities.
    if (Buffer.byteLength(raw, "utf8") > 16384) throw Error("INVALID_SOURCE_COMMAND");
    const command = sourcePdfV2UploadCommandSchema.parse(JSON.parse(raw));
    if (
      command.actor_account_id !== actor ||
      command.trip_id !== identity.tripId ||
      command.source_id !== identity.sourceId ||
      command.operation_id !== identity.operationId ||
      command.payload.representation_id !== identity.representationId ||
      command.payload.byte_count > 4194304 ||
      !Number.isSafeInteger(identity.accountGeneration) ||
      identity.accountGeneration < 1 ||
      (await owner.accountGeneration(actor)) !== identity.accountGeneration
    )
      throw Error("PDF_SCOPE_FORBIDDEN");
  }
  return {
    async prepare(actor: string, raw: string, identity: PdfIngressIdentity) {
      coreUuid.parse(actor);
      if (Buffer.byteLength(raw, "utf8") > 16384) throw Error("INVALID_SOURCE_COMMAND");
      const q = sourcePdfPrepareCommandSchema.parse(JSON.parse(raw));
      if (
        q.actor_account_id !== actor ||
        q.trip_id !== identity.tripId ||
        q.source_id !== identity.sourceId ||
        q.operation_id !== identity.operationId ||
        q.payload.representation_id !== identity.representationId ||
        !Number.isSafeInteger(identity.accountGeneration) ||
        identity.accountGeneration < 1 ||
        (await owner.accountGeneration(actor)) !== identity.accountGeneration
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
      const receipt = sourcePdfPrepareReceiptSchema.parse(
        await authority.prepare(actor, raw, identity.accountGeneration),
      );
      if ((await owner.accountGeneration(actor)) !== identity.accountGeneration)
        throw Error("PDF_SCOPE_FORBIDDEN");
      if (
        receipt.operation_id !== q.operation_id ||
        receipt.operation_key !== q.operation_key ||
        receipt.operation_sha256 !== q.operation_sha256 ||
        receipt.source_id !== q.source_id ||
        receipt.representation_id !== q.payload.representation_id
      )
        throw Error("PDF_PREPARE_RECEIPT_CONFLICT");
      return receipt;
    },
    async reserve(actor: string, raw: string, identity: PdfIngressIdentity) {
      await validate(actor, raw, identity);
      // Existing begin returns an existing journal/receipt before allocating again.
      const result = await authority.admit(actor, raw, identity.accountGeneration, {
        attemptId: randomUUID(),
        resourceId: randomUUID(),
        nodeId,
        resourceKey: randomBytes(32).toString("hex"),
        runToken: randomUUID(),
      });
      if ((await owner.accountGeneration(actor)) !== identity.accountGeneration)
        throw Error("PDF_SCOPE_FORBIDDEN");
      // Resource permits remain internal even if a caller serializes this result.
      return result.receipt ? { receipt: result.receipt } : { reserved: true as const };
    },
    async finish(actor: string, raw: string, identity: PdfIngressIdentity) {
      await validate(actor, raw, identity);
      const context = await authority.resolveReserved(actor, identity);
      if (
        context.binding.actorAccountId !== actor ||
        context.binding.tripId !== identity.tripId ||
        context.binding.sourceId !== identity.sourceId ||
        context.binding.representationId !== identity.representationId ||
        context.binding.operationId !== identity.operationId ||
        context.accountGeneration !== identity.accountGeneration
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
      const receipt = await authority.finish(context, raw);
      if ((await owner.accountGeneration(actor)) !== identity.accountGeneration)
        throw Error("PDF_SCOPE_FORBIDDEN");
      return receipt;
    },
  };
}
