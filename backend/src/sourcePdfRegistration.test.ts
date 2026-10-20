import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  sourcePdfRegistrationRequestSchema,
  type SourcePdfVerifyCommand,
} from "../../src/domain/trip/sourcePdfRegistration";
import { createSourcePdfRegistration } from "./sourcePdfRegistration";
import { encodeProfilePdf, pdfHash } from "./sourcePdfProfile";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import type { CorePgLease } from "./tripCoreV2PgStorage";
function fixture() {
  const account = randomUUID(),
    trip = randomUUID(),
    source = randomUUID(),
    original = randomUUID();
  const q: SourcePdfVerifyCommand = {
    contract_version: 1,
    command: "VERIFY_REPRESENTATION",
    operation_id: randomUUID(),
    operation_key: "verify-1",
    actor_account_id: account,
    trip_id: trip,
    source_id: source,
    operation_sha256: "a".repeat(64),
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: original,
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
    },
  };
  const bytes = encodeProfilePdf(["synthetic line"]);
  const descriptor = {
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key: `v1/${trip}/${source}/${original}/payload`,
    payload_sha256: pdfHash(bytes),
    byte_count: bytes.length,
  };
  const statements: string[] = [];
  const lease: CorePgLease = {
    retire: vi.fn(),
    async query(sql) {
      statements.push(sql);
      return {
        rows: sql.includes("original_begin")
          ? [{ context: { original: descriptor } }]
          : [],
      };
    },
  };
  const read = vi.fn(async () => bytes);
  const api = createSourcePdfRegistration(
    { withLease: async (work) => work(lease) },
    hash,
    read,
  );
  return { account, trip, q, descriptor, read, api, statements, bytes };
}
it("denies caller actor/Trip mismatch before SQL or private reads", async () => {
  const f = fixture();
  await expect(f.api.verifyOriginal(randomUUID(), f.trip, f.q)).rejects.toThrow(
    "SOURCE_ACCESS_DENIED",
  );
  expect(f.statements).toEqual([]);
  expect(f.read).not.toHaveBeenCalled();
});
it("denies non-owning object identity and rolls back without completion", async () => {
  const f = fixture();
  f.descriptor.object_key = "client/url-or-path";
  await expect(f.api.verifyOriginal(f.account, f.trip, f.q)).rejects.toThrow(
    "PDF_CUSTODY_UNSUPPORTED",
  );
  expect(f.read).not.toHaveBeenCalled();
  expect(f.statements.at(-1)).toBe("ROLLBACK");
  expect(f.statements.some((s) => s.includes("original_finish"))).toBe(false);
});
it("binds private read scope and rejects changed retained bytes without completion", async () => {
  const f = fixture();
  f.read.mockResolvedValue(encodeProfilePdf(["other retained line"]));
  await expect(f.api.verifyOriginal(f.account, f.trip, f.q)).rejects.toThrow(
    "MATERIAL_INTEGRITY_MISMATCH",
  );
  expect(f.read).toHaveBeenCalledWith({
    accountId: f.account,
    tripId: f.trip,
    sourceId: f.q.source_id,
    representationId: f.q.payload.representation_id,
    sha256: pdfHash(f.bytes),
    byteCount: f.bytes.length,
  });
  expect(f.statements.at(-1)).toBe("ROLLBACK");
  expect(f.statements.some((s) => s.includes("original_finish"))).toBe(false);
});
it("does not convert unavailable custody into verification", async () => {
  const f = fixture();
  f.read.mockRejectedValue(new Error("SOURCE_IO_UNAVAILABLE"));
  await expect(f.api.verifyOriginal(f.account, f.trip, f.q)).rejects.toThrow(
    "SOURCE_IO_UNAVAILABLE",
  );
  expect(f.statements.at(-1)).toBe("ROLLBACK");
  expect(f.statements.some((s) => s.includes("original_finish"))).toBe(false);
});
it("shared registration DTO accepts only identity/CAS/verification receipt pins", () => {
  const q = {
    derivativeVersion: 1,
    operationId: randomUUID(),
    sourceId: randomUUID(),
    sourceRevision: 1,
    sourceRowRevision: 1,
    originalRepresentationId: randomUUID(),
    originalRowRevision: 2,
    derivedRepresentationId: randomUUID(),
    verificationOperationId: randomUUID(),
    verificationResultSha256: "a".repeat(64),
  };
  expect(sourcePdfRegistrationRequestSchema.parse(q)).toEqual(q);
  for (const [key, value] of Object.entries({
    text: "client text",
    producer: "apple-pdfkit",
    pages: [],
    verified: true,
    originalBytes: "client bytes",
  }))
    expect(
      sourcePdfRegistrationRequestSchema.safeParse({ ...q, [key]: value }).success,
    ).toBe(false);
});
