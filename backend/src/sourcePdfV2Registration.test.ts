// Synthetic SQL protocol fixtures verify adapter fences, never Hosted/Source Runtime PASS.
import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";
import { createSourcePdfV2Registration } from "./sourcePdfV2Registration";
import { createSourcePdfV2Authority } from "./sourcePdfV2Authority";
import { SOURCE_PDF_V2_LINUX_PROFILE_SHA } from "./sourcePdfV2LinuxVerifier";
import {
  PDF_V2_OPTIONS_SHA,
  sourcePdfV2RegistrationRequestSchema,
} from "./sourcePdfV2Contracts";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { sourcePdfRegistrationRequestSchema } from "../../src/domain/trip/sourcePdfRegistration";
import type { CorePgLease } from "./tripCoreV2PgStorage";
vi.mock("./sourcePdfV2LinuxWorker", () => ({
  SOURCE_PDF_V2_LINUX_IMAGE: "sha256:" + "a".repeat(64),
  runSourcePdfV2LinuxWorker: vi.fn(),
}));
const digest = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const hash = async (b: Uint8Array) => digest(b);
const bytes = new TextEncoder().encode("%PDF-synthetic-protocol");
const output = () => ({
  engine: "qpdf-poppler",
  version: 1,
  originalSha256: digest(bytes),
  originalByteCount: bytes.length,
  text: "NZ5069",
  pages: [{ pageIndex: 0, start: 0, end: 6 }],
  toleratedUnreferencedZeroOffsetObjects: [],
});
beforeEach(() =>
  vi.mocked(runSourcePdfV2LinuxWorker).mockReset().mockResolvedValue(output()),
);
function fixture(continuousSourceScope?: true) {
  const accountId = randomUUID(),
    tripId = randomUUID();
  const request = sourcePdfV2RegistrationRequestSchema.parse({
    derivativeVersion: 2,
    operationId: randomUUID(),
    sourceId: randomUUID(),
    sourceRevision: 2,
    sourceRowRevision: 3,
    originalRepresentationId: randomUUID(),
    originalRowRevision: 4,
    derivedRepresentationId: randomUUID(),
    verificationOperationId: randomUUID(),
    verificationResultSha256: "a".repeat(64),
  });
  const original = {
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key: `v1/${tripId}/${request.sourceId}/${request.originalRepresentationId}/payload`,
    payload_sha256: digest(bytes),
    byte_count: bytes.length,
  };
  const read = vi.fn().mockResolvedValue(bytes);
  const statements: string[] = [];
  let corrupt = false,
    closed = false,
    previous: unknown = null,
    rollbackFails = false;
  const lease: CorePgLease = {
    retire: vi.fn(),
    async query(sql, args = []) {
      statements.push(sql);
      if (sql.includes("trip_source_universal_pdf_enter"))
        return { rows: [{ entered: true }] };
      if (sql === "ROLLBACK" && rollbackFails) throw Error("rollback failure");
      if (closed && sql.includes("trip_source_pdf_v2_"))
        throw Error("PDF_AUTHORITY_CLOSED");
      if (sql.includes("original_begin")) return { rows: [{ context: { original } }] };
      if (sql.includes("original_finish")) {
        const q = JSON.parse(args[1] as string);
        const r = {
          contract_version: 1 as const,
          operation_id: q.operation_id,
          operation_key: q.operation_key,
          command: "VERIFY_REPRESENTATION" as const,
          operation_sha256: q.operation_sha256,
          outcome: "APPLIED" as const,
          error_code: null,
          completed_at: "2026-10-17T00:00:00.000Z",
          source_id: corrupt ? randomUUID() : q.source_id,
          representation_id: q.payload.representation_id,
          result_source_row_revision: q.payload.expected_source_row_revision,
          result_material_revision: q.payload.material_revision,
          result_representation_row_revision:
            q.payload.expected_representation_row_revision + 1,
          result_remote_state: "VERIFIED" as const,
          result_retention_state: "RETAINED" as const,
          result_action_id: null,
          result_verified_at: "2026-10-17T00:00:00.000Z",
        };
        const result_sha256 = await importDigest(
          "otr-source-result-v1",
          [
            1,
            r.operation_id,
            r.command,
            r.operation_sha256,
            r.outcome,
            r.error_code,
            r.completed_at,
            r.result_source_row_revision,
            r.result_material_revision,
            r.result_representation_row_revision,
            r.result_remote_state,
            r.result_retention_state,
            r.result_action_id,
            r.result_verified_at,
          ],
          hash,
        );
        return { rows: [{ receipt: { ...r, result_sha256 } }] };
      }
      if (sql.includes("registration_lookup")) return { rows: [{ receipt: previous }] };
      if (sql.includes("registration_context")) return { rows: [{ original }] };
      if (sql.includes("registration_commit")) {
        const body = JSON.parse(args[0] as string);
        return {
          rows: [
            {
              receipt: {
                derivativeVersion: 2,
                operationId: request.operationId,
                body,
                registrationSha256: corrupt ? "b".repeat(64) : args[1],
              },
            },
          ],
        };
      }
      if (sql.includes("trip_source_pdf_v2_lookup"))
        return { rows: [{ receipt: previous }] };
      if (sql.includes("trip_source_pdf_v2_context"))
        return {
          rows: [
            {
              context: {
                original,
                derived: {
                  text_content: "NZ5069",
                  payload_sha256: digest("NZ5069"),
                  byte_count: 6,
                  transform_key: "otr.pdf.qpdf-poppler",
                  transform_version: "2",
                  transform_options_sha256: PDF_V2_OPTIONS_SHA,
                },
              },
            },
          ],
        };
      if (sql.includes("trip_source_pdf_v2_commit"))
        return {
          rows: [
            {
              receipt: {
                derivativeVersion: 2,
                operationId: request.operationId,
                body: JSON.parse(args[0] as string),
                sealSha256: corrupt ? "b".repeat(64) : args[1],
              },
            },
          ],
        };
      return { rows: [] };
    },
  };
  const connection = {
    withLease: async <T>(work: (lease: CorePgLease) => Promise<T>) => work(lease),
  };
  return {
    accountId,
    tripId,
    request,
    original,
    read,
    statements,
    lease,
    registration: createSourcePdfV2Registration(connection, hash, read, undefined, {
      continuousSourceScope,
    }),
    authority: createSourcePdfV2Authority(connection, hash, read, undefined, {
      continuousSourceScope,
    }),
    corrupt: () => {
      corrupt = true;
    },
    close: () => {
      closed = true;
    },
    prior: (p: unknown) => {
      previous = p;
    },
    failRollback: () => {
      rollbackFails = true;
    },
  };
}
it("registers only a validated independent /2 derivation through distinct fixed SQL functions", async () => {
  const f = fixture();
  const r = await f.registration.registerDerived(f.accountId, f.tripId, f.request);
  expect(r.body).toMatchObject({
    derivativeVersion: 2,
    profileSha256: SOURCE_PDF_V2_LINUX_PROFILE_SHA,
    producer: "otr-source-pdf-qpdf-poppler/2",
    textSha256: digest("NZ5069"),
    textByteCount: 6,
  });
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.statements.at(-1)).toBe("COMMIT");
  expect(
    f.statements.some((s) => s.includes("public.trip_source_pdf_registration_")),
  ).toBe(false);
});
it("independently reseals exactly matching registered text with /2 proof hash domains", async () => {
  const f = fixture();
  const { verificationOperationId: _, verificationResultSha256: __, ...q } = f.request;
  const r = await f.authority.seal(f.accountId, f.tripId, q);
  expect(r.body).toMatchObject({
    derivativeVersion: 2,
    request: q,
    profileId: "OTR_PDF_QPDF_POPPLER_V2",
  });
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.statements.at(-1)).toBe("COMMIT");
});
it("rejects caller-selected Capture key before independent worker/read", async () => {
  const f = fixture();
  f.original.object_key = "capture/account/input";
  await expect(
    f.registration.registerDerived(f.accountId, f.tripId, f.request),
  ).rejects.toThrow("PDF_CUSTODY_UNSUPPORTED");
  expect(f.read).not.toHaveBeenCalled();
  expect(runSourcePdfV2LinuxWorker).not.toHaveBeenCalled();
  expect(f.statements.at(-1)).toBe("ROLLBACK");
});
it("refuses fresh registration if retained original changes after independent decode", async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce(bytes).mockResolvedValueOnce(new Uint8Array(2));
  await expect(
    f.registration.registerDerived(f.accountId, f.tripId, f.request),
  ).rejects.toThrow("PDF_V2_ORIGINAL_MISMATCH");
  expect(f.statements.some((s) => s.includes("registration_commit"))).toBe(false);
});
it.each(["registration", "seal"])(
  "rolls back corrupted %s receipts rather than reporting success",
  async (kind) => {
    const f = fixture();
    f.corrupt();
    const { verificationOperationId: _, verificationResultSha256: __, ...q } = f.request;
    await expect(
      kind === "registration"
        ? f.registration.registerDerived(f.accountId, f.tripId, f.request)
        : f.authority.seal(f.accountId, f.tripId, q),
    ).rejects.toThrow();
    expect(f.statements.at(-1)).toBe("ROLLBACK");
  },
);
it("closed owning SQL performs no custody or decoding", async () => {
  const f = fixture();
  f.close();
  await expect(
    f.registration.registerDerived(f.accountId, f.tripId, f.request),
  ).rejects.toThrow("PDF_AUTHORITY_CLOSED");
  expect(f.read).not.toHaveBeenCalled();
  expect(runSourcePdfV2LinuxWorker).not.toHaveBeenCalled();
});
it("replay validates exact receipt hash and identity without re-decoding", async () => {
  const f = fixture();
  const first = await f.registration.registerDerived(f.accountId, f.tripId, f.request);
  f.prior(first);
  f.read.mockClear();
  vi.mocked(runSourcePdfV2LinuxWorker).mockClear();
  expect(await f.registration.registerDerived(f.accountId, f.tripId, f.request)).toEqual(
    first,
  );
  expect(f.read).not.toHaveBeenCalled();
  expect(runSourcePdfV2LinuxWorker).not.toHaveBeenCalled();
});
it("retires a lease if rollback fails", async () => {
  const f = fixture();
  f.close();
  f.failRollback();
  await expect(
    f.registration.registerDerived(f.accountId, f.tripId, f.request),
  ).rejects.toThrow("PDF_AUTHORITY_CLOSED");
  expect(f.lease.retire).toHaveBeenCalledOnce();
});
it("v1 cannot parse a v2 request and caller text/profile claims cannot enter v2", () => {
  const f = fixture();
  expect(sourcePdfRegistrationRequestSchema.safeParse(f.request).success).toBe(false);
  expect(
    sourcePdfV2RegistrationRequestSchema.safeParse({
      ...f.request,
      producer: "client",
      text: "client text",
    }).success,
  ).toBe(false);
});

it.each([false, true])(
  "checks exact Source identity on owning VERIFY receipt (forged=%s)",
  async (forged) => {
    const f = fixture();
    if (forged) f.corrupt();
    const q = {
      contract_version: 1 as const,
      command: "VERIFY_REPRESENTATION" as const,
      operation_id: randomUUID(),
      operation_key: "verify-v2",
      actor_account_id: f.accountId,
      trip_id: f.tripId,
      source_id: f.request.sourceId,
      operation_sha256: "a".repeat(64),
      payload: {
        material_revision: 2,
        expected_source_row_revision: 3,
        expected_source_state: {
          lifecycle: "ACTIVE" as const,
          retention_state: "RETAINED" as const,
        },
        representation_id: f.request.originalRepresentationId,
        expected_representation_row_revision: 3,
        expected_representation_state: {
          remote_state: "PENDING" as const,
          retention_state: "RETAINED" as const,
        },
      },
    };
    const promise = f.registration.verifyOriginal(f.accountId, f.tripId, q);
    if (forged) await expect(promise).rejects.toThrow("REPLAY_UNAVAILABLE");
    else
      expect(await promise).toMatchObject({
        outcome: "APPLIED",
        source_id: q.source_id,
        result_remote_state: "VERIFIED",
      });
    expect(f.read).toHaveBeenCalledTimes(2);
  },
);

it.each(["register", "seal"] as const)(
  "continuous %s enters only on the same fresh Source lease, after prior receipt lookup",
  async (method) => {
    const f = fixture(true);
    const {
      verificationOperationId: _,
      verificationResultSha256: __,
      ...seal
    } = f.request;
    if (method === "register")
      await f.registration.registerDerived(f.accountId, f.tripId, f.request);
    else await f.authority.seal(f.accountId, f.tripId, seal);
    const enter = f.statements.findIndex((s) =>
      s.includes("trip_source_universal_pdf_enter"),
    );
    const lookup = f.statements.findIndex((s) =>
      s.includes(
        method === "register" ? "registration_lookup" : "trip_source_pdf_v2_lookup",
      ),
    );
    const context = f.statements.findIndex((s) =>
      s.includes(
        method === "register" ? "registration_context" : "trip_source_pdf_v2_context",
      ),
    );
    expect(enter).toBeGreaterThan(lookup);
    expect(context).toBeGreaterThan(enter);
    expect(f.statements.at(-1)).toBe("COMMIT");
  },
);
it("continuous registration reuses an accepted receipt without entering fresh execution scope", async () => {
  const f = fixture(true);
  const receipt = await f.registration.registerDerived(f.accountId, f.tripId, f.request);
  f.prior(receipt);
  f.statements.length = 0;
  expect(await f.registration.registerDerived(f.accountId, f.tripId, f.request)).toEqual(
    receipt,
  );
  expect(f.statements.some((s) => s.includes("trip_source_universal_pdf_enter"))).toBe(
    false,
  );
});
