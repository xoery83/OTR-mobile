// Synthetic transport protocol fixture; no Hosted Source or authority claim.
import { randomUUID, createHash } from "node:crypto";
import { vi } from "vitest";
import { captureAccountRequestContext } from "../../auth/accountRequestContext";
import { importDigest } from "@/domain/trip/flightImportReview";
export const pdfProtocolHash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function pdfPreparationFixture(states: string[]) {
  const actor = randomUUID(),
    context = await captureAccountRequestContext(randomUUID(), async () => actor);
  const bytes = new TextEncoder().encode("%PDF-synthetic-transport-protocol");
  const binding = {
    version: 1 as const,
    accountId: actor,
    batchId: randomUUID(),
    jobId: randomUUID(),
    inputId: randomUUID(),
    inputRevision: 1,
    captureId: randomUUID(),
    payloadId: randomUUID(),
    captureRevision: 1,
    sha256: await pdfProtocolHash(bytes),
    byteCount: bytes.length,
    mediaType: "application/pdf" as const,
  };
  const acquisition = {
    contract_version: 1,
    command: "ACQUIRE_SOURCE",
    actor_account_id: actor,
    trip_id: context.tripId,
    source_id: randomUUID(),
    operation_id: randomUUID(),
    operation_key: "synthetic-acquire",
    operation_sha256: "a".repeat(64),
    payload: {
      original: {
        id: randomUUID(),
        material_kind: "BINARY",
        mime_type: "application/pdf",
        payload_sha256: binding.sha256,
        byte_count: bytes.length,
      },
    },
  };
  async function receipt(
    q: {
      operation_id: string;
      operation_key: string;
      operation_sha256: string;
      command: string;
      source_id: string;
      payload?: { representation_id?: string; original?: unknown };
    },
    verified = false,
  ) {
    const value = {
      contract_version: 1,
      operation_id: q.operation_id,
      operation_key: q.operation_key,
      operation_sha256: q.operation_sha256,
      command: q.command,
      outcome: "APPLIED",
      error_code: null,
      completed_at: "2026-10-30T00:00:00.000000Z",
      source_id: q.source_id,
      representation_id: q.payload?.representation_id ?? acquisition.payload.original.id,
      result_source_row_revision: 1,
      result_material_revision: 1,
      result_representation_row_revision: verified ? 2 : 1,
      result_remote_state: verified ? "VERIFIED" : "PENDING",
      result_retention_state: "RETAINED",
      result_action_id: null,
      result_verified_at: verified ? "2026-10-30T00:00:00.000000Z" : null,
    };
    const digest = await importDigest(
      "otr-source-result-v1",
      [
        1,
        value.operation_id,
        value.command,
        value.operation_sha256,
        value.outcome,
        value.error_code,
        value.completed_at,
        value.result_source_row_revision,
        value.result_material_revision,
        value.result_representation_row_revision,
        value.result_remote_state,
        value.result_retention_state,
        value.result_action_id,
        value.result_verified_at,
      ],
      pdfProtocolHash,
    );
    return { ...value, result_sha256: digest };
  }
  const acquisitionReceipt = await receipt(acquisition);
  const observation = (id: object, observation: string, rest = {}) => ({
    ...id,
    observation,
    ...rest,
  });
  const transport = {
    status: vi.fn(async (_context, id) =>
      observation(id, "STATUS_OBSERVED", { status: states.shift() ?? "READ_OBSERVED" }),
    ),
    prepare: vi.fn(async (_context, id, q) =>
      observation(id, "PREPARE_OBSERVED", { receipt: await receipt(q) }),
    ),
    reserve: vi.fn(async (_context, id) => observation(id, "RESERVATION_OBSERVED")),
    stage: vi.fn(),
    dispatch: vi.fn(),
    observeRetained: vi.fn(),
    finish: vi.fn(async (_context, id, q) =>
      observation(id, "FINISH_OBSERVED", { receipt: await receipt(q) }),
    ),
    verifyOriginal: vi.fn(async (_context, q) => receipt(q, true)),
    registerDerived: vi.fn(async () => ({})),
    seal: vi.fn(async (_context, request) => ({ request })),
  };
  return {
    context,
    input: { acquisition, acquisitionReceipt, binding, bytes },
    transport,
    deps: {
      getAccountId: async () => actor,
      hash: pdfProtocolHash,
      transport: transport as never,
    },
  };
}
