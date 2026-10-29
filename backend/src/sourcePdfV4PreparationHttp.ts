import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { createSourcePdfV2BackendPreparation } from "./sourcePdfBackendPreparation";
import type { PdfCausalOwner } from "./sourcePdfCausalAuthority";

type PreparationPort = {
  owner: Pick<PdfCausalOwner, "accountGeneration">;
  preparation: ReturnType<typeof createSourcePdfV2BackendPreparation>;
};

// Unbound: parent owns bearer Auth; existing preparation owns journal/bytes/dispatch.
export async function sourcePdfV4PreparationBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  port?: PreparationPort,
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const route =
    /^\/v2\/trips\/([^/]+)\/sources\/([^/]+)\/representations\/([^/]+)\/pdf-v4\/([^/]+)\/(stage|dispatch|observe-retained)$/.exec(
      url.pathname,
    );
  if (
    !route ||
    url.search ||
    route.slice(1, 5).some((id) => !coreUuid.safeParse(id).success)
  )
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  try {
    request.signal.throwIfAborted();
    coreUuid.parse(actor);
    if (!(await canReadTrip(actor, route[1]))) return fail(403, "SOURCE_ACCESS_DENIED");
    request.signal.throwIfAborted();
    if (!port) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    if (route[5] !== "stage" && request.body !== null)
      return fail(422, "INVALID_SOURCE_COMMAND");
    const generation = await port.owner.accountGeneration(actor);
    request.signal.throwIfAborted();
    if (!Number.isSafeInteger(generation) || generation < 1)
      return fail(403, "SOURCE_ACCESS_DENIED");
    const identity = {
      tripId: route[1],
      sourceId: route[2],
      representationId: route[3],
      operationId: route[4],
      accountGeneration: generation,
    };
    let observation: "STAGED" | "DISPATCH_OBSERVED" | "READ_OBSERVED";
    if (route[5] === "stage") {
      await port.preparation.ingress(request, identity);
      observation = "STAGED";
    } else if (route[5] === "dispatch") {
      await port.preparation.upload(request, identity, request.signal);
      observation = "DISPATCH_OBSERVED";
    } else {
      await port.preparation.observeRetained(request, identity);
      observation = "READ_OBSERVED";
    }
    // Internal bindings carry resource/run capabilities and must never reach Native.
    return reply(200, {
      sourceId: identity.sourceId,
      representationId: identity.representationId,
      operationId: identity.operationId,
      observation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return fail(422, "INVALID_SOURCE_COMMAND");
    if (error instanceof Error && "status" in error && error.status === 401)
      return fail(401, "AUTH_REQUIRED");
    const code = error instanceof Error ? error.message : "";
    if (code === "PDF_TOO_LARGE") return fail(413, "INVALID_SOURCE_COMMAND");
    if (
      [
        "PDF_INGRESS_UNSUPPORTED",
        "PDF_LENGTH_MISMATCH",
        "PDF_INGRESS_INTEGRITY_MISMATCH",
      ].includes(code)
    )
      return fail(422, "INVALID_SOURCE_COMMAND");
    if (["PDF_SCOPE_FORBIDDEN", "SOURCE_ACCESS_DENIED"].includes(code))
      return fail(403, "SOURCE_ACCESS_DENIED");
    if (["PDF_DUPLICATE_DISPATCH", "PDF_PROVIDER_BINDING_CONFLICT"].includes(code))
      return fail(409, "SOURCE_CAS_CONFLICT");
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  }
}
