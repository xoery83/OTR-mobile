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

// Explicit calls only; GET verification never resubmits originals.
export function runDefaultCaptureCustodyBatch(
  raw: CaptureCustodyBatch,
  check: () => void = () => {},
) {
  return executeBatch(raw, true, check);
}
export function verifyDefaultCaptureCustodyBatch(
  raw: CaptureCustodyBatch,
  check: () => void = () => {},
) {
  return executeBatch(raw, false, check);
}
async function executeBatch(
  raw: CaptureCustodyBatch,
  write: boolean,
  check: () => void,
) {
  check();
  const batch = captureCustodyBatchSchema.parse(raw);
  const context = await captureAccountRequestContext("", requireActiveUserId);
  if (batch.inputs[0].accountId !== context.accountId)
    throw new Error("CAPTURE_CUSTODY_SCOPE_INVALID");
  check();
  const operation = createCaptureCustodyOperation({
    submissions: await getDefaultCaptureSubmissionRepository(),
    inbox: await getDefaultLocalCaptureInboxRepository(),
    getAccountId: requireActiveUserId,
    transport: createCaptureCustodyTransport(requireActiveUserId, {
      baseUrl: "https://api-dev.xoery.art",
      assertRequestCurrent: check,
    }),
  });
  // Check both original bindings before the first network write; each call rechecks.
  for (const expected of batch.inputs) {
    check();
    const actual = await operation.binding(
      context,
      batch.jobId,
      expected.inputId,
    );
    check();
    if (
      captureCustodyBindingJson(actual) !== captureCustodyBindingJson(expected)
    )
      throw new Error("CAPTURE_CUSTODY_INPUT_STALE");
  }
  const receipts = [];
  for (const expected of batch.inputs) {
    check();
    if (write) await operation.put(context, batch.jobId, expected.inputId);
    check();
    const bytes = await operation.recover(
      context,
      batch.jobId,
      expected.inputId,
    );
    check();
    if (!bytes) throw new Error("CAPTURE_CUSTODY_NOT_FOUND");
    assertCaptureCustodyBytes(expected, bytes);
    receipts.push({
      inputId: expected.inputId,
      sha256: expected.sha256,
      byteCount: bytes.length,
    });
  }
  check();
  return { batchId: batch.batchId, jobId: batch.jobId, inputs: receipts };
}
