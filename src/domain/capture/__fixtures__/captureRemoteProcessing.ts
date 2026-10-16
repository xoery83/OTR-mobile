import { createHash, randomUUID } from "node:crypto";
import {
  captureRemoteMaterialBytes,
  type CaptureRemoteRequest,
} from "../captureRemoteProcessing";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// Synthetic protocol-only identities and content, never Runtime evidence.
export function captureRemoteFixture(
  bindingOverride?: CaptureRemoteRequest["binding"],
  evidenceOverride?: CaptureRemoteRequest["localEvidence"],
) {
  const binding = bindingOverride ?? {
    version: 1 as const,
    accountId: randomUUID(),
    batchId: randomUUID(),
    jobId: randomUUID(),
    inputId: randomUUID(),
    inputRevision: 1,
    captureId: randomUUID(),
    payloadId: randomUUID(),
    captureRevision: 1,
    sha256: "a".repeat(64),
    byteCount: 15,
    mediaType: "application/pdf" as const,
  };
  const localEvidence = evidenceOverride ?? {
      text: "Flight AB123",
      textSha256: hash(Buffer.from("Flight AB123")),
    },
    bytes = captureRemoteMaterialBytes({ binding, localEvidence });
  const input: CaptureRemoteRequest = {
    version: 1,
    binding,
    localEvidence,
    task: {
      contract_version: "otr-model-task-v1",
      task_id: randomUUID(),
      logical_request_id: randomUUID(),
      logical_idempotency_key: randomUUID(),
      consumer_id: "import",
      consumer_version: 2,
      input: { reference: randomUUID(), sha256: hash(bytes), byte_count: bytes.length },
      schema: {
        id: "FLIGHT_ASSEMBLY_PROPOSAL_V1",
        version: 1,
        dialect: "OTR_TYPED_V1",
        sha256: "b".repeat(64),
      },
      policy_snapshot: {
        version: 1,
        privacy: "REMOTE_ALLOWED",
        network_required: true,
        region: "DEV",
        budget_currency: "USD",
        budget_nanos: "10000000",
        route: "deepseek",
        max_attempts: 1,
        deadline: "2030-01-01T00:00:00Z",
      },
      policy_sha256: "c".repeat(64),
    },
  };
  const output = {
    binding,
    task: {
      contract_version: "otr-model-task-v1" as const,
      task_id: input.task.task_id,
      logical_request_id: input.task.logical_request_id,
      continuation: {
        work_disposition: "WAITING" as const,
        wait_reason: "WAITING_FOR_REMOTE_INTELLIGENCE" as const,
        row_revision: 1,
        publication_fence: 1,
        cancellation_disposition: "NONE" as const,
      },
      attempt: null,
      structured_output: null,
      technical_error: null,
    },
  };

  return { binding, input, output };
}
