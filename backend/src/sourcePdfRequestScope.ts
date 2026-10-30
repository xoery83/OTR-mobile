import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import type { PdfCausalOwner } from "./sourcePdfCausalAuthority";

export const PDF_SOURCE_REQUEST_SCOPE = "SOURCE_REQUEST_LIFETIME_V1" as const;
let nextFence = 0;

// Trusted request composition only. This is an async lifetime fence, never Auth authority.
export function createSourcePdfRequestScope(input: {
  actorId: string;
  tripId: string;
  signal: AbortSignal;
  workload: Pick<PdfCausalOwner, "ownerRun" | "producerId" | "providerInstanceSha256">;
  readCurrentAccess(): Promise<{ actorId: string; tripId: string; canReadTrip: boolean }>;
}) {
  const actorId = coreUuid.parse(input.actorId),
    tripId = coreUuid.parse(input.tripId);
  const ownerRun = coreUuid.parse(input.workload.ownerRun);
  const producerId = coreUuid.parse(input.workload.producerId);
  const providerInstanceSha256 = coreHash.parse(input.workload.providerInstanceSha256);
  if (nextFence >= Number.MAX_SAFE_INTEGER) throw Error("PDF_SCOPE_FORBIDDEN");
  const fence = ++nextFence;
  const signal = input.signal,
    readCurrentAccess = input.readCurrentAccess;
  let closed = false;
  function assertOpen() {
    if (closed || signal.aborted) throw Error("PDF_SCOPE_FORBIDDEN");
  }
  const owner: PdfCausalOwner = Object.freeze({
    authScopeKind: PDF_SOURCE_REQUEST_SCOPE,
    assertRequestCurrent: assertOpen,
    ownerRun,
    producerId,
    providerInstanceSha256,
    async accountGeneration(actor: string) {
      // Legacy field name; this version explicitly means only this request's fence.
      assertOpen();
      if (actor !== actorId) throw Error("PDF_SCOPE_FORBIDDEN");
      const access = await readCurrentAccess();
      assertOpen();
      if (
        access.actorId !== actorId ||
        access.tripId !== tripId ||
        access.canReadTrip !== true
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
      return fence;
    },
  });
  return {
    owner,
    close() {
      closed = true;
    },
  };
}
