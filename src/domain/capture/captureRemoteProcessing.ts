import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { captureCustodyBindingSchema } from "./captureCustody";
import { modelTaskRequestSchema, modelTaskResultSchema } from "../intelligence/modelTask";
import { canonicalEventJson, type Json } from "../trip/eventIntentJson";
export const captureRemoteRequestSchema = z.strictObject({
  version: z.literal(1),
  binding: captureCustodyBindingSchema,
  task: modelTaskRequestSchema,
  localEvidence: z.strictObject({
    text: z.string().min(1).max(262144),
    textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export type CaptureRemoteRequest = z.infer<typeof captureRemoteRequestSchema>;
export const captureRemoteResultSchema = z.strictObject({
  binding: captureCustodyBindingSchema,
  task: modelTaskResultSchema,
});
export type CaptureRemoteResult = z.infer<typeof captureRemoteResultSchema>;
// Temporary interpretation material, not a Source verification or Admission proof.
export function captureRemoteMaterialBytes(
  input: Pick<CaptureRemoteRequest, "binding" | "localEvidence">,
) {
  return new TextEncoder().encode(
    canonicalEventJson({
      version: 1,
      binding: input.binding,
      localEvidence: input.localEvidence,
    } as unknown as Json),
  );
}
export function validateCaptureRemoteRequest(raw: unknown) {
  const request = captureRemoteRequestSchema.parse(raw),
    bytes = captureRemoteMaterialBytes(request);
  if (
    bytes.length > 524288 ||
    bytes.length !== request.task.input.byte_count ||
    bytesToHex(sha256(bytes)) !== request.task.input.sha256 ||
    bytesToHex(sha256(new TextEncoder().encode(request.localEvidence.text))) !==
      request.localEvidence.textSha256
  )
    throw new Error("CAPTURE_REMOTE_MATERIAL_MISMATCH");
  return request;
}
export function assertCaptureRemoteResult(
  raw: unknown,
  binding: CaptureRemoteRequest["binding"],
  taskId: string,
  logicalRequestId?: string,
) {
  const result = captureRemoteResultSchema.parse(raw);
  if (
    canonicalEventJson(result.binding as unknown as Json) !==
      canonicalEventJson(binding as unknown as Json) ||
    result.task.task_id !== taskId ||
    (logicalRequestId && result.task.logical_request_id !== logicalRequestId)
  )
    throw new Error("CAPTURE_REMOTE_RESULT_SCOPE");
  return result;
}
