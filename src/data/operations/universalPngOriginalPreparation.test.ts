import { sourceBinaryOriginalReceiptSchema } from "@/domain/trip/sourceBinaryOriginalCommands";
// Synthetic existing-Source replies only; no server, Storage, decoder or authority claim.
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "./__fixtures__/pdfOriginalPreparation";
import { createPendingPngCommandProposals } from "@/domain/trip/sourcePngPreparationCommands";
import {
  prepareAdmittedPngOriginal,
  type PngOriginalCommand,
  type PngOriginalPreparationPort,
} from "./universalPngOriginalPreparation";
import type { CaptureMaterialBinding } from "@/domain/capture/captureCustody";

async function fixture(files = false) {
  const f = await pdfPreparationFixture([]),
    bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
  const hash = await pdfProtocolHash(bytes),
    acquisition = structuredClone(f.input.acquisition);
  Object.assign(acquisition.payload.original, {
    mime_type: "image/png",
    payload_sha256: hash,
    byte_count: bytes.length,
  });
  const input = {
    acquisition,
    acquisitionReceipt: f.input.acquisitionReceipt,
    binding: {
      ...f.input.binding,
      version: 2,
      mediaType: "image/png",
      sha256: hash,
      byteCount: bytes.length,
      kind: files ? "FILE" : "IMAGE",
      acquisitionSource: files ? "files" : "photos",
      originalFilename: files ? "qa.png" : null,
    } as CaptureMaterialBinding,
    bytes,
  };
  const proposals = await createPendingPngCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    acquisition,
    input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const records = new Map<string, unknown>();
  const final = async (q: PngOriginalCommand) => {
    if (q.command === "VERIFY_REPRESENTATION")
      return sourceBinaryOriginalReceiptSchema.parse(
        await f.transport.verifyOriginal(f.context, q),
      );
    const observed = await f.transport.prepare(f.context, {}, q);
    if (!("receipt" in observed)) throw Error("FIXTURE_RECEIPT_MISSING");
    return sourceBinaryOriginalReceiptSchema.parse(observed.receipt);
  };
  const port = {
    lookup: vi.fn(
      async (_context, q: PngOriginalCommand) => records.get(q.operation_id) ?? null,
    ),
    execute: vi.fn<PngOriginalPreparationPort["execute"]>(
      async (_context, q: PngOriginalCommand, _material?: unknown) => {
        const r = await final(q);
        records.set(q.operation_id, r);
        return r;
      },
    ),
    reconcile: vi.fn<PngOriginalPreparationPort["reconcile"]>(
      async (_context, q: PngOriginalCommand) => records.get(q.operation_id),
    ),
  } satisfies PngOriginalPreparationPort;
  const deps = { getAccountId: f.deps.getAccountId, hash: pdfProtocolHash, port };
  const run = (overrides: Partial<typeof deps> = {}) =>
    prepareAdmittedPngOriginal(f.context, input, { ...deps, ...overrides });
  return { f, input, port, deps, run, records, proposals, final };
}
it("is closed without a server port and cannot create a receipt or IO", async () => {
  const x = await fixture();
  await expect(x.run({ port: undefined })).rejects.toThrow("PNG_PREPARATION_UNAVAILABLE");
  expect(x.port.lookup).not.toHaveBeenCalled();
  expect(x.port.execute).not.toHaveBeenCalled();
});
it.each([false, true])(
  "uses exact bytes/provenance and same receipts; Files PNG=%s",
  async (files) => {
    const x = await fixture(files);
    const receipt = await x.run();
    expect(receipt).toMatchObject({
      command: "VERIFY_REPRESENTATION",
      outcome: "APPLIED",
      result_remote_state: "VERIFIED",
    });
    expect(x.port.execute.mock.calls.map(([, q]) => q.command)).toEqual([
      "PREPARE_REPRESENTATION",
      "UPLOAD_ORIGINAL",
      "VERIFY_REPRESENTATION",
    ]);
    expect(x.port.execute.mock.calls[1][2]).toEqual({
      binding: x.input.binding,
      bytes: x.input.bytes,
    });
    expect(await x.run()).toEqual(receipt);
    expect(x.port.execute).toHaveBeenCalledTimes(3);
    expect(x.port.reconcile).not.toHaveBeenCalled();
  },
);
it("UNKNOWN keeps the same operation and only reconciles; it never re-sends upload", async () => {
  const x = await fixture();
  const pending = {
    contract_version: 1,
    operation_id: x.proposals.upload.operation_id,
    operation_key: x.proposals.upload.operation_key,
    operation_sha256: x.proposals.upload.operation_sha256,
    phase: "IO_UNKNOWN",
    attempt_generation: 1,
  };
  x.port.execute.mockImplementation(async (_context, q) => {
    const r = q.command === "UPLOAD_ORIGINAL" ? pending : await x.final(q);
    x.records.set(q.operation_id, r);
    return r;
  });
  await expect(x.run()).rejects.toThrow("PNG_UPLOAD_OUTCOME_UNRESOLVED");
  await expect(x.run()).rejects.toThrow("PNG_UPLOAD_OUTCOME_UNRESOLVED");
  expect(x.port.execute).toHaveBeenCalledTimes(2);
  expect(x.port.reconcile).toHaveBeenCalledExactlyOnceWith(
    x.f.context,
    x.proposals.upload,
  );
  x.port.reconcile.mockImplementation(async (_context, q) => {
    const r = await x.final(q);
    x.records.set(q.operation_id, r);
    return r;
  });
  await x.run();
  expect(x.port.execute.mock.calls.map(([, q]) => q.operation_id)).toEqual([
    x.proposals.prepare.operation_id,
    x.proposals.upload.operation_id,
    x.proposals.verify.operation_id,
  ]);
});
it("does not return verified when the final owning readback is unavailable", async () => {
  const x = await fixture();
  const lookup = x.port.lookup.getMockImplementation()!;
  x.port.lookup.mockImplementation(async (context, q) =>
    q.command === "VERIFY_REPRESENTATION" ? null : lookup(context, q),
  );
  await expect(x.run()).rejects.toThrow("PNG_SOURCE_PREPARATION_UNCONFIRMED");
});
it.each(["receipt", "pending"])(
  "rejects another operation's %s without execution",
  async (kind) => {
    const x = await fixture(),
      q = x.proposals.prepare;
    const raw =
      kind === "receipt"
        ? { ...(await x.final(q)), operation_id: randomUUID() }
        : {
            contract_version: 1,
            operation_id: randomUUID(),
            operation_key: q.operation_key,
            operation_sha256: q.operation_sha256,
            phase: "IO_UNKNOWN",
            attempt_generation: 1,
          };
    x.records.set(q.operation_id, raw);
    await expect(x.run()).rejects.toThrow("PNG_SOURCE_RECEIPT_MISMATCH");
    expect(x.port.execute).not.toHaveBeenCalled();
    expect(x.port.reconcile).not.toHaveBeenCalled();
  },
);
it("rejects late cancellation and invalid original bytes before dispatch", async () => {
  const x = await fixture(),
    controller = new AbortController();
  x.port.lookup.mockImplementationOnce(async () => {
    controller.abort();
    return null;
  });
  await expect(
    prepareAdmittedPngOriginal(x.f.context, x.input, {
      ...x.deps,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(x.port.execute).not.toHaveBeenCalled();
  const bytes = Uint8Array.from(x.input.bytes);
  bytes[8] = 1;
  await expect(
    prepareAdmittedPngOriginal(x.f.context, { ...x.input, bytes }, x.deps),
  ).rejects.toThrow("CAPTURE_CUSTODY_BYTES_INVALID");
  expect(x.port.execute).not.toHaveBeenCalled();
});

it("reconciles existing ADMITTED generation 0 without execute or a new upload", async () => {
  const x = await fixture();
  x.records.set(x.proposals.prepare.operation_id, await x.final(x.proposals.prepare));
  x.records.set(x.proposals.upload.operation_id, {
    contract_version: 1,
    operation_id: x.proposals.upload.operation_id,
    operation_key: x.proposals.upload.operation_key,
    operation_sha256: x.proposals.upload.operation_sha256,
    phase: "ADMITTED",
    attempt_generation: 0,
  });
  await expect(x.run()).rejects.toThrow("PNG_UPLOAD_OUTCOME_UNRESOLVED");
  expect(x.port.reconcile).toHaveBeenCalledExactlyOnceWith(
    x.f.context,
    x.proposals.upload,
  );
  expect(x.port.execute).not.toHaveBeenCalled();
});
it.each(["IO_ACTIVE", "IO_UNKNOWN", "IO_QUIESCENT"])(
  "rejects illegal %s generation 0 without execution",
  async (phase) => {
    const x = await fixture();
    x.records.set(x.proposals.prepare.operation_id, await x.final(x.proposals.prepare));
    x.records.set(x.proposals.upload.operation_id, {
      contract_version: 1,
      operation_id: x.proposals.upload.operation_id,
      operation_key: x.proposals.upload.operation_key,
      operation_sha256: x.proposals.upload.operation_sha256,
      phase,
      attempt_generation: 0,
    });
    await expect(x.run()).rejects.toThrow();
    expect(x.port.reconcile).not.toHaveBeenCalled();
    expect(x.port.execute).not.toHaveBeenCalled();
  },
);
