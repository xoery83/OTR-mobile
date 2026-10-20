import { createHash } from "node:crypto";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { createTripDocumentOriginalRead } from "./tripDocumentOriginalRead";

export type DocumentOriginalReader = ReturnType<typeof createTripDocumentOriginalRead>;

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};

function unavailable() {
  return new Response(JSON.stringify({ error: { code: "ORIGINAL_UNAVAILABLE" } }), {
    status: 404,
    headers: { ...privateHeaders, "Content-Type": "application/json" },
  });
}

export async function tripDocumentOriginalBoundary(
  request: Request,
  authenticatedActorAccountId: string,
  canReadTrip: (actorAccountId: string, tripId: string) => Promise<boolean>,
  reader?: DocumentOriginalReader,
) {
  const url = new URL(request.url);
  const match = /^\/v2\/trips\/([^/]+)\/documents\/([^/]+)\/original$/.exec(url.pathname);
  if (!match || request.method !== "GET") return unavailable();
  const [, tripId, documentId] = match;
  const rawVersion = request.headers.get("X-OTR-Content-Version");
  const rawMatch = request.headers.get("If-Match");
  const contentVersion = rawVersion ? Number(rawVersion) : NaN;
  const sha256 = /^"([0-9a-f]{64})"$/.exec(rawMatch ?? "")?.[1];
  if (
    url.search ||
    request.body !== null ||
    request.headers.has("Range") ||
    request.headers.has("If-Range") ||
    request.headers.has("Content-Length") ||
    !coreUuid.safeParse(authenticatedActorAccountId).success ||
    !coreUuid.safeParse(tripId).success ||
    !coreUuid.safeParse(documentId).success ||
    !rawVersion ||
    !/^[1-9][0-9]*$/.test(rawVersion) ||
    !Number.isSafeInteger(contentVersion) ||
    !coreHash.safeParse(sha256).success
  )
    return unavailable();
  if (!reader) return unavailable();
  try {
    if (!(await canReadTrip(authenticatedActorAccountId, tripId))) return unavailable();
    const result = await reader.read(authenticatedActorAccountId, {
      actorAccountId: authenticatedActorAccountId,
      tripId,
      documentId,
      contentVersion,
      sha256,
    });
    if (
      result.status !== "AVAILABLE" ||
      result.documentId !== documentId ||
      result.contentVersion !== contentVersion ||
      result.sha256 !== sha256 ||
      !(result.bytes instanceof Uint8Array) ||
      result.byteSize !== result.bytes.byteLength ||
      result.byteSize > 10 * 1024 * 1024 ||
      createHash("sha256").update(result.bytes).digest("hex") !== sha256
    )
      return unavailable();
    return new Response(Uint8Array.from(result.bytes), {
      status: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(result.byteSize),
        "Content-Disposition": 'attachment; filename="otr-document"',
        ETag: `"${result.sha256}"`,
        "X-OTR-Content-Version": String(result.contentVersion),
      },
    });
  } catch {
    return unavailable();
  }
}
