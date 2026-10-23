import {
  captureMaterialBindingSchema,
  captureCustodyBindingJson,
  assertCaptureCustodyBytes,
  type CaptureMaterialCustody,
} from "../../src/domain/capture/captureCustody";
import {
  createRequestBoundary,
  readBoundedBytes,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { ZodError } from "zod";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization" };
function failure(status: number, code: string) {
  return Response.json({ error: { code } }, { status, headers: privateHeaders });
}
export async function captureCustodyBoundary(
  request: Request,
  actor: string,
  custody?: CaptureMaterialCustody,
) {
  const url = new URL(request.url);
  const match = /^\/v2\/capture-inputs\/([a-f0-9-]+)\/material$/.exec(url.pathname);
  if (!["PUT", "GET"].includes(request.method))
    return failure(405, "CAPTURE_CUSTODY_METHOD");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const header = request.headers.get("X-OTR-Capture-Binding");
    if (
      !match ||
      url.search ||
      !header ||
      header.length > 2048 ||
      request.headers.has("Range") ||
      request.headers.has("Content-Encoding") ||
      (request.method === "GET" && request.body !== null)
    )
      return failure(422, "CAPTURE_CUSTODY_REQUEST_INVALID");
    let raw: unknown;
    try {
      raw = JSON.parse(header);
    } catch {
      return failure(422, "CAPTURE_CUSTODY_REQUEST_INVALID");
    }
    const binding = captureMaterialBindingSchema.parse(raw);
    if (binding.inputId !== match[1])
      return failure(422, "CAPTURE_CUSTODY_REQUEST_INVALID");
    if (binding.accountId !== actor) return failure(403, "CAPTURE_CUSTODY_FORBIDDEN");
    if (!custody) return failure(503, "CAPTURE_CUSTODY_UNAVAILABLE");
    if (request.method === "PUT") {
      if (
        request.headers.get("Content-Type") !== binding.mediaType ||
        request.headers.get("Content-Length") !== String(binding.byteCount)
      )
        return failure(422, "CAPTURE_CUSTODY_REQUEST_INVALID");
      const bytes = await readBoundedBytes(request, binding.byteCount, boundary);
      assertCaptureCustodyBytes(binding, bytes);
      await boundary.run(() => custody.put(binding, bytes));
    }
    const bytes = await boundary.run(() => custody.read(binding));
    if (!bytes) return failure(404, "CAPTURE_CUSTODY_NOT_FOUND");
    assertCaptureCustodyBytes(binding, bytes);
    return new Response(Uint8Array.from(bytes), {
      status: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": binding.mediaType,
        "Content-Length": String(binding.byteCount),
        ETag: `"${binding.sha256}"`,
        "X-OTR-Capture-Binding": captureCustodyBindingJson(binding),
      },
    });
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof Error &&
        /CAPTURE_CUSTODY_(BYTES|MEDIA)_INVALID/.test(error.message))
    )
      return failure(422, "CAPTURE_CUSTODY_REQUEST_INVALID");
    if (error instanceof RequestBoundaryError && error.code === "BODY_LIMIT")
      return failure(413, "CAPTURE_CUSTODY_SIZE_LIMIT");
    if (error instanceof Error && error.message === "CAPTURE_CUSTODY_BINDING_CONFLICT")
      return failure(409, "CAPTURE_CUSTODY_BINDING_CONFLICT");
    return failure(503, "CAPTURE_CUSTODY_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
