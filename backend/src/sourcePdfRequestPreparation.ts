import type { PdfSourceRequestIoGuard } from "./sourcePdfStorageProducer";
import { authenticate, type DevBackendGateway } from "./app";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createSourcePdfRequestScope } from "./sourcePdfRequestScope";
import {
  createSourcePdfV2CausalAuthority,
  type PdfCausalOwner,
} from "./sourcePdfCausalAuthority";
import { createSourcePdfV2BackendPreparation } from "./sourcePdfBackendPreparation";
import { createSourcePdfV4Reservation } from "./sourcePdfV4Reservation";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";

// Explicit operator composition only; no Secret loading, listener or startup activation.
export function createSourcePdfRequestPreparation(deps: {
  gateway: DevBackendGateway;
  connection: CorePgConnection;
  workload: Pick<PdfCausalOwner, "ownerRun" | "producerId" | "providerInstanceSha256">;
  nodeId: string;
  stage: Parameters<typeof createSourcePdfV2BackendPreparation>[2];
  providerForRequest(
    guard: PdfSourceRequestIoGuard,
  ): Parameters<typeof createSourcePdfV2BackendPreparation>[3];
  assertEnabled(): void;
}) {
  coreUuid.parse(deps.nodeId);
  return async (request: Request, actorId: string) => {
    deps.assertEnabled();
    const route =
      /^\/v2\/trips\/([^/]+)\/sources\/[^/]+\/representations\/[^/]+\/pdf-v4\/[^/]+\/(?:prepare|reserve|finish|stage|dispatch|observe-retained|status)$/.exec(
        new URL(request.url).pathname,
      );
    if (!route) throw Error("PDF_SCOPE_FORBIDDEN");
    const tripId = coreUuid.parse(route[1]);
    const scope = createSourcePdfRequestScope({
      actorId,
      tripId,
      signal: request.signal,
      workload: deps.workload,
      async readCurrentAccess() {
        deps.assertEnabled();
        const current = await authenticate(request, deps.gateway);
        const canReadTrip = await deps.gateway.canReadTrip(current.id, tripId);
        deps.assertEnabled();
        return { actorId: current.id, tripId, canReadTrip };
      },
    });
    try {
      await scope.owner.accountGeneration(actorId);
      const guard: PdfSourceRequestIoGuard = Object.freeze({
        signal: request.signal,
        assertRequestCurrent() {
          if (!scope.owner.authScopeKind) throw Error("PDF_SCOPE_FORBIDDEN");
          scope.owner.assertRequestCurrent();
        },
        async assertCurrent() {
          await scope.owner.accountGeneration(actorId);
        },
      });
      const provider = deps.providerForRequest(guard);
      const authority = createSourcePdfV2CausalAuthority(deps.connection, scope.owner, {
        continuousSourceScope: true,
      });
      return {
        port: {
          owner: scope.owner,
          reservation: createSourcePdfV4Reservation(authority, scope.owner, deps.nodeId),
          preparation: createSourcePdfV2BackendPreparation(
            deps.gateway,
            authority,
            deps.stage,
            provider,
          ),
        },
        close: scope.close,
      };
    } catch (error) {
      scope.close();
      throw error;
    }
  };
}
