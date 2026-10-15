import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import { getDefaultLocalCaptureInboxRepository } from "../repositories/defaultLocalCaptureInboxRepository";
import { createCaptureCustodyTransport } from "../api/captureCustodyTransport";
import { createCaptureCustodyOperation } from "./captureCustody";
import {
  captureCustodyBatchSchema,
  captureCustodyBindingJson,
  assertCaptureCustodyBytes,
  type CaptureCustodyBatch,
} from "@/domain/capture/captureCustody";

// Explicit owning operation only: no UI, startup caller, logging or debug global.
export async function runDefaultCaptureCustodyBatch(raw: CaptureCustodyBatch) {
  const batch = captureCustodyBatchSchema.parse(raw);
  const context = await captureAccountRequestContext("", requireActiveUserId);
  if (batch.inputs[0].accountId !== context.accountId)
    throw new Error("CAPTURE_CUSTODY_SCOPE_INVALID");
  const operation = createCaptureCustodyOperation({
    submissions: await getDefaultCaptureSubmissionRepository(),
    inbox: await getDefaultLocalCaptureInboxRepository(),
    getAccountId: requireActiveUserId,
    transport: createCaptureCustodyTransport(requireActiveUserId, {
      baseUrl: "https://api-dev.xoery.art",
    }),
  });
  // Check both original bindings before the first network write; each call rechecks.
  for (const expected of batch.inputs) {
    const actual = await operation.binding(
      context,
      batch.jobId,
      expected.inputId,
    );
    if (
      captureCustodyBindingJson(actual) !== captureCustodyBindingJson(expected)
    )
      throw new Error("CAPTURE_CUSTODY_INPUT_STALE");
  }
  const receipts = [];
  for (const expected of batch.inputs) {
    await operation.put(context, batch.jobId, expected.inputId);
    const bytes = await operation.recover(
      context,
      batch.jobId,
      expected.inputId,
    );
    if (!bytes) throw new Error("CAPTURE_CUSTODY_UNAVAILABLE");
    assertCaptureCustodyBytes(expected, bytes);
    receipts.push({
      inputId: expected.inputId,
      sha256: expected.sha256,
      byteCount: bytes.length,
    });
  }
  return { batchId: batch.batchId, jobId: batch.jobId, inputs: receipts };
}
