import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSourcePdfV2RegistrationLocalPreparation } from "./sourcePdfV2RegistrationLocal";
import {
  sourcePdfRegistrationBodySchema,
  sourcePdfRegistrationReceiptSchema,
} from "../../src/domain/trip/sourcePdfRegistration";
import { sourcePdfSealSchema } from "../../src/domain/trip/sourcePdfAuthority";

const bytes = new TextEncoder().encode("%PDF-synthetic-local-protocol-only");
const sha256 = createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID();
  const input = {
    accountId: randomUUID(),
    tripId,
    request: {
      derivativeVersion: 2 as const,
      operationId: randomUUID(),
      sourceId,
      sourceRevision: 1,
      sourceRowRevision: 2,
      originalRepresentationId: representationId,
      originalRowRevision: 3,
      derivedRepresentationId: randomUUID(),
    },
    original: {
      source_id: sourceId,
      id: representationId,
      role: "ORIGINAL" as const,
      material_kind: "BINARY" as const,
      mime_type: "application/pdf" as const,
      storage_provider: "supabase_storage" as const,
      storage_bucket: "trip-source-material" as const,
      object_key: `v1/${tripId}/${sourceId}/${representationId}/payload`,
      payload_sha256: sha256,
      byte_count: bytes.length,
      row_revision: 3,
      retention_state: "RETAINED" as const,
    },
  };
  const read = vi.fn().mockResolvedValue(bytes);
  const decode = vi.fn().mockResolvedValue({
    engine: "apple-pdfkit",
    version: 1,
    originalSha256: sha256,
    originalByteCount: bytes.length,
    text: "NZ5069",
    pages: [{ pageIndex: 0, start: 0, end: 6 }],
  });
  const prepare = createSourcePdfV2RegistrationLocalPreparation(read, decode);
  return { input, read, decode, prepare };
}
it("prepares exact Source identity and independently reread derivation without authority", async () => {
  const f = fixture();
  const result = await f.prepare(f.input);
  expect(result).toMatchObject({
    status: "LOCAL_PREPARATION_ONLY",
    grantsSourceAuthority: false,
    runtimeStatus: "BLOCKED_TRUSTED_DECODER",
    body: {
      derivativeVersion: 2,
      accountId: f.input.accountId,
      tripId: f.input.tripId,
      request: f.input.request,
      originalSha256: sha256,
      textByteCount: 6,
    },
  });
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.read).toHaveBeenCalledWith({
    accountId: f.input.accountId,
    tripId: f.input.tripId,
    sourceId: f.input.request.sourceId,
    representationId: f.input.request.originalRepresentationId,
    sha256,
    byteCount: bytes.length,
  });
  expect(result).not.toHaveProperty("registrationSha256");
  expect(result).not.toHaveProperty("sealSha256");
  expect(result.body).not.toHaveProperty("verificationOperationId");
  expect(sourcePdfRegistrationBodySchema.safeParse(result.body).success).toBe(false);
  expect(sourcePdfRegistrationReceiptSchema.safeParse(result).success).toBe(false);
  expect(sourcePdfSealSchema.safeParse(result.body).success).toBe(false);
});
it.each([
  "capture key",
  "wrong source",
  "wrong representation",
  "wrong row revision",
  "same derivative identity",
  "wrong trip key",
])("rejects %s before custody/decoder IO", async (failure) => {
  const f = fixture();
  switch (failure) {
    case "capture key":
      f.input.original.object_key = `capture/${f.input.accountId}/${randomUUID()}`;
      break;
    case "wrong source":
      f.input.original.source_id = randomUUID();
      break;
    case "wrong representation":
      f.input.original.id = randomUUID();
      break;
    case "wrong row revision":
      f.input.original.row_revision++;
      break;
    case "same derivative identity":
      f.input.request.derivedRepresentationId = f.input.original.id;
      break;
    case "wrong trip key":
      f.input.tripId = randomUUID();
  }
  await expect(f.prepare(f.input)).rejects.toThrow("PDF_V2_REGISTRATION_SCOPE_MISMATCH");
  expect(f.read).not.toHaveBeenCalled();
  expect(f.decode).not.toHaveBeenCalled();
});
it("rejects unknown sensitive configuration rather than retaining it in a draft", async () => {
  const f = fixture();
  await expect(
    f.prepare({ ...f.input, sessionToken: "private" } as typeof f.input),
  ).rejects.toThrow(/^PDF_V2_REGISTRATION_INPUT_INVALID$/);
  expect(f.read).not.toHaveBeenCalled();
});
it("does not certify custody that changes while decoding", async () => {
  const f = fixture();
  f.read
    .mockReset()
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce(new Uint8Array(2));
  await expect(f.prepare(f.input)).rejects.toThrow("PDF_V2_ORIGINAL_MISMATCH");
});
it("pins request identity across asynchronous work and produces stable local digests", async () => {
  const f = fixture();
  const original = structuredClone(f.input);
  f.decode.mockImplementation(async () => {
    f.input.request.sourceId = randomUUID();
    return {
      engine: "apple-pdfkit",
      version: 1,
      originalSha256: sha256,
      originalByteCount: bytes.length,
      text: "NZ5069",
      pages: [{ pageIndex: 0, start: 0, end: 6 }],
    };
  });
  const first = await f.prepare(f.input);
  const second = await f.prepare(original);
  expect(first.body.request).toEqual(original.request);
  expect(first.preparationSha256).toBe(second.preparationSha256);
  const different = await f.prepare({
    ...original,
    request: { ...original.request, operationId: randomUUID() },
  });
  expect(different.preparationSha256).not.toBe(first.preparationSha256);
});
