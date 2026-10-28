import { abortable } from "./service";
import { requestSchema } from "./contracts";
import type { TrustedContext } from "./ports";
import type { createFlightEnrichmentService } from "./service";
export const PROPOSED_ROUTE = "/v1/flight-enrichment";
// Not registered in OTR. Host must authenticate, authorize Trip if present and bind an account-generation fence.
export function createOtrEnrichmentHandler(
  service: ReturnType<typeof createFlightEnrichmentService>,
  resolveTrustedContext: (request: Request) => Promise<TrustedContext>,
  enabled = false,
) {
  return async (request: Request): Promise<Response> => {
    if (!enabled)
      return Response.json({ error: "ENRICHMENT_PROFILE_CLOSED" }, { status: 503 });
    if (request.method !== "POST")
      return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
    let context: TrustedContext;
    try {
      context = await abortable(resolveTrustedContext(request), deadline);
      await abortable(context.assertCurrent(), deadline);
    } catch {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      if (reader)
        while (true) {
          const r = await abortable(reader.read(), deadline);
          if (r.done) break;
          size += r.value.byteLength;
          if (size > 8192) {
            await reader.cancel();
            return Response.json({ error: "REQUEST_BOUND" }, { status: 413 });
          }
          chunks.push(r.value);
        }
      const parsed = requestSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success)
        return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
      return Response.json(await service.enrich(parsed.data, context, deadline));
    } catch {
      return Response.json(
        { error: "REQUEST_FAILED", manualEntryAllowed: true },
        { status: 400 },
      );
    } finally {
      reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
  };
}
