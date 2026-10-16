import { z } from "zod";
import {
  captureCustodyBindingSchema,
  captureCustodyBindingJson,
} from "../../src/domain/capture/captureCustody";
import {
  validateCaptureRemoteRequest,
  assertCaptureRemoteResult,
  type CaptureRemoteRequest,
  type CaptureRemoteResult,
} from "../../src/domain/capture/captureRemoteProcessing";
import {
  createRequestBoundary,
  readBoundedBytes,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
export type CaptureRemoteProcessingPort = {
  run(
    actor: string,
    request: CaptureRemoteRequest,
    signal: AbortSignal,
  ): Promise<CaptureRemoteResult>;
  read(
    actor: string,
    binding: CaptureRemoteRequest["binding"],
    taskId: string,
    signal: AbortSignal,
  ): Promise<CaptureRemoteResult | null>;
};
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const failure = (status: number, code: string) =>
  Response.json({ error: { code } }, { status, headers });
// Actor comes only from the normal authenticated Backend handler, never request JSON.
export async function captureRemoteProcessingBoundary(
  request: Request,
  actor: string,
  port?: CaptureRemoteProcessingPort,
) {
  const url = new URL(request.url),
    match =
      /^\/v2\/capture-jobs\/([a-f0-9-]+)\/inputs\/([a-f0-9-]+)\/processing\/([a-f0-9-]+)$/.exec(
        url.pathname,
      );
  if (!["GET", "POST"].includes(request.method))
    return failure(405, "CAPTURE_REMOTE_METHOD");
  const boundary = createRequestBoundary(35000, request.signal);
  try {
    if (
      !match ||
      url.search ||
      request.headers.has("Content-Encoding") ||
      request.headers.has("Range")
    )
      return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
    const taskId = z.uuid().parse(match[3]);
    const requestBinding = request.headers.get("X-OTR-Capture-Binding");
    if (!requestBinding || requestBinding.length > 2048)
      return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
    const binding = captureCustodyBindingSchema.parse(JSON.parse(requestBinding));
    if (binding.jobId !== match[1] || binding.inputId !== match[2])
      return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
    if (binding.accountId !== actor) return failure(403, "CAPTURE_REMOTE_FORBIDDEN");
    if (!port) return failure(503, "CAPTURE_REMOTE_CLOSED");
    let result: CaptureRemoteResult | null;
    if (request.method === "POST") {
      if (request.headers.get("Content-Type") !== "application/json")
        return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
      const body = validateCaptureRemoteRequest(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await readBoundedBytes(request, 524288, boundary),
          ),
        ),
      );
      if (
        captureCustodyBindingJson(body.binding) !== captureCustodyBindingJson(binding) ||
        body.task.task_id !== taskId
      )
        return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
      result = assertCaptureRemoteResult(
        await boundary.run(() => port.run(actor, body, boundary.signal)),
        binding,
        taskId,
        body.task.logical_request_id,
      );
    } else {
      if (request.body !== null) return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
      const read = await boundary.run(() =>
        port.read(actor, binding, taskId, boundary.signal),
      );
      result = read === null ? null : assertCaptureRemoteResult(read, binding, taskId);
    }
    return result
      ? Response.json(result, { headers })
      : failure(404, "CAPTURE_REMOTE_NOT_FOUND");
  } catch (error) {
    if (error instanceof RequestBoundaryError && error.code === "BODY_LIMIT")
      return failure(413, "CAPTURE_REMOTE_SIZE_LIMIT");
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "CAPTURE_REMOTE_MATERIAL_MISMATCH")
    )
      return failure(422, "CAPTURE_REMOTE_REQUEST_INVALID");
    return failure(503, "CAPTURE_REMOTE_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
