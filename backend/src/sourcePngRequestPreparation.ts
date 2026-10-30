import { authenticate, type DevBackendGateway } from "./app";
import type {
  SourcePngPreparationForRequest,
  SourcePngPreparationPort,
} from "./sourcePngPreparationHttp";
import type { SourcePngBrokerScope } from "./sourcePngBroker";
import type { PdfSourceRequestIoGuard } from "./sourcePdfStorageProducer";

// Same normal bearer/Trip authority as other Source requests; this closure only fences its lifetime.
export function createSourcePngRequestPreparation(deps: {
  gateway: DevBackendGateway;
  actorId: string;
  tripId: string;
  assertEnabled(): void;
  prepare(
    scope: SourcePngBrokerScope,
    guard: PdfSourceRequestIoGuard,
  ): SourcePngPreparationPort;
}): SourcePngPreparationForRequest {
  return async (request, actor) => {
    deps.assertEnabled();
    const route =
      /^\/v2\/trips\/([^/]+)\/universal-source-originals\/png\/(?:result|execute|reconcile)$/.exec(
        new URL(request.url).pathname,
      );
    if (actor !== deps.actorId || route?.[1] !== deps.tripId)
      throw Error("SOURCE_ACCESS_DENIED");
    let closed = false;
    const assertRequestCurrent = () => {
      deps.assertEnabled();
      if (closed || request.signal.aborted) throw Error("SOURCE_REQUEST_UNCONFIRMED");
    };
    const assertCurrent = async () => {
      assertRequestCurrent();
      const current = await authenticate(request, deps.gateway);
      assertRequestCurrent();
      if (current.id !== actor || !(await deps.gateway.canReadTrip(actor, deps.tripId)))
        throw Error("SOURCE_ACCESS_DENIED");
      assertRequestCurrent();
    };
    await assertCurrent();
    const scope = { actorId: actor, tripId: deps.tripId, signal: request.signal };
    return {
      port: deps.prepare(scope, {
        signal: request.signal,
        assertRequestCurrent,
        assertCurrent,
      }),
      close() {
        closed = true;
      },
    };
  };
}
