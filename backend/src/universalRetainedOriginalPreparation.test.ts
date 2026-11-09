import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUniversalMaterialIntake } from "./universalMaterialIntake";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { universalBoundary } from "./universalImport";
import { createHash, randomUUID } from "node:crypto";
import { setImmediate as nextTick } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import {
  pdfPreparationFixture,
  pdfProtocolHash as hash,
} from "../../src/data/operations/__fixtures__/pdfOriginalPreparation";
import {
  createPendingPdfCommandProposals,
  createPdfDerivativeRequests,
} from "../../src/domain/trip/sourcePdfPreparationCommands";
import { createPendingPngCommandProposals } from "../../src/domain/trip/sourcePngPreparationCommands";
import {
  OriginalBytesRequired,
  prepareUniversalRetainedOriginals,
  universalRetainedOriginalPrepareSchema,
} from "./universalRetainedOriginalPreparation";

import { sourceBinaryOriginalReceiptSchema } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import type { SourcePngPreparationPort } from "./sourcePngPreparationHttp";
import {
  prepareUniversalQueuedRuntime,
  universalPrepareBoundary,
} from "./universalPrepareHttp";

type Deps = Parameters<typeof prepareUniversalRetainedOriginals>[3];

async function fixture() {
  const f = await pdfPreparationFixture([]);
  const controller = new AbortController();
  const scope = {
    actorId: f.context.accountId,
    tripId: f.context.tripId,
    signal: controller.signal,
  };
  const pdf = f.input.acquisition;
  const png = structuredClone(pdf);
  Object.assign(png, {
    source_id: randomUUID(),
    operation_id: randomUUID(),
    operation_key: "png-acquire",
  });
  const pngBytes = Buffer.from([1, 2, 3]);
  Object.assign(png.payload.original, {
    id: randomUUID(),
    mime_type: "image/png",
    payload_sha256: createHash("sha256").update(pngBytes).digest("hex"),
    byte_count: pngBytes.length,
  });
  function envelope(acquisition: typeof pdf, format: "PDF" | "PNG") {
    return {
      ...acquisition,
      payload: {
        ...acquisition.payload,
        acquisition_key: acquisition.operation_key,
        acquisition_sha256: "e".repeat(64),
        source_input: {
          source_kind: format === "PNG" ? "IMAGE" : "FILE",
          acquisition_channel: "FILES",
          captured_at: null,
          capture_time_basis: "UNKNOWN",
        },
        capture: { completeness: "AS_SUPPLIED", capture_sha256: "f".repeat(64) },
        original: {
          ...acquisition.payload.original,
          original_filename: format === "PNG" ? "Fixture.png" : "Fixture.pdf",
          encoding: null,
          part_key: null,
          text_content: null,
          locator_uri: null,
        },
      },
    };
  }
  const originals = [envelope(pdf, "PDF"), envelope(png, "PNG")].map((acquisition) => ({
    inputId: randomUUID(),
    acquisition,
  }));
  const {
    tripId: _,
    retainedOriginals,
    ...batch
  } = universalRetainedOriginalPrepareSchema.parse({
    tripId: scope.tripId,
    batchId: f.input.binding.batchId,
    submissionSha256: "a".repeat(64),
    retainedOriginals: originals,
    inputs: originals.map(({ inputId, acquisition }) => ({
      id: inputId,
      source_id: acquisition.source_id,
      representation_id: acquisition.payload.original.id,
      payload_sha256: acquisition.payload.original.payload_sha256,
      byte_count: acquisition.payload.original.byte_count,
      material_revision: 1,
      observed_source_row_revision: 1,
      historical_selection: false,
    })),
  });
  async function receipt(command: Parameters<Deps["lookupOperation"]>[0]) {
    if (command.command === "VERIFY_REPRESENTATION")
      return sourceBinaryOriginalReceiptSchema.parse(
        await f.transport.verifyOriginal(f.context, command),
      );
    return uploadReceipt(command);
  }
  async function uploadReceipt(command: unknown) {
    const result = await f.transport.finish(f.context, {}, command);
    if (!("receipt" in result)) throw Error("FIXTURE_RECEIPT_MISSING");
    return sourceBinaryOriginalReceiptSchema.parse(result.receipt);
  }
  const pngAcquired = await uploadReceipt({
    ...png,
    payload: { representation_id: png.payload.original.id },
  });
  const acquired = new Map<string, unknown>([
    [pdf.source_id, f.input.acquisitionReceipt],
    [png.source_id, pngAcquired],
  ]);
  const pdfPlan = await createPendingPdfCommandProposals(
    scope,
    pdf,
    acquired.get(pdf.source_id),
    hash,
  );
  const pngPlan = await createPendingPngCommandProposals(
    scope,
    png,
    acquired.get(png.source_id),
    hash,
  );
  const journal = new Map<string, unknown>([
    [pdfPlan.upload.operation_id, await receipt(pdfPlan.upload)],
    [pngPlan.upload.operation_id, await receipt(pngPlan.upload)],
  ]);
  const operations: string[] = [];
  const verifyPdf = vi.fn<
    Awaited<ReturnType<NonNullable<Deps["openPdf"]>>>["port"]["verifyOriginal"]
  >(async (_actor, _trip, command) => {
    operations.push("PDF Verify");
    const result = await receipt(command);
    journal.set(command.operation_id, result);
    return result as never;
  });
  const register = vi.fn(async () => {
    operations.push("PDF Register");
  });
  const seal = vi.fn(async () => {
    operations.push("PDF Seal");
  });
  const verifyPng = vi.fn(
    async (_scope: typeof scope, command: typeof pngPlan.verify) => {
      operations.push("PNG Verify");
      const result = await receipt(command);
      journal.set(command.operation_id, result);
      return result;
    },
  );
  const pngPort: SourcePngPreparationPort = {
    execute: (s, command, bytes) => {
      if (command.command !== "VERIFY_REPRESENTATION" || bytes !== undefined)
        throw Error("UNEXPECTED_PNG_MUTATION");
      return verifyPng(s, command);
    },
    lookup: async (_, command) => journal.get(command.operation_id) ?? null,
    reconcile: vi.fn(async () => {
      throw Error("REPLAY_FORBIDDEN");
    }),
  };
  const deps: Deps = {
    hash,
    assertCurrent: vi.fn(async () => {}),
    lookupAcquisition: vi.fn(async (command) => acquired.get(command.source_id)),
    lookupOperation: vi.fn(async (command) => journal.get(command.operation_id) ?? null),
    openPdf: vi.fn(async () => ({
      port: {
        verifyOriginal: verifyPdf,
        registerDerived: register as never,
        seal: seal as never,
      },
      close: vi.fn(),
    })),
    openPng: vi.fn(async () => ({
      port: pngPort,
      close: vi.fn(),
    })),
  };
  const complete = () =>
    prepareUniversalRetainedOriginals(scope, batch, retainedOriginals, deps);
  return {
    batch,
    scope,
    retainedOriginals,
    controller,
    deps,
    pdfPlan,
    pngPlan,
    journal,
    operations,
    complete,
    verifyPdf,
    register,
    seal,
    verifyPng,
    receipt,
    pngBytes,
    pngPort,
  };
}

it("binds the retained uploads to exact PDF and PNG operations and reads PNG Verify back", async () => {
  const f = await fixture();
  await f.complete();
  expect(f.operations).toEqual(
    expect.arrayContaining(["PDF Verify", "PDF Register", "PDF Seal", "PNG Verify"]),
  );
  expect(f.verifyPdf).toHaveBeenCalledExactlyOnceWith(
    f.scope.actorId,
    f.scope.tripId,
    f.pdfPlan.verify,
  );
  const derived = await createPdfDerivativeRequests(
    f.pdfPlan,
    await f.receipt(f.pdfPlan.verify),
    hash,
  );
  expect(f.register).toHaveBeenCalledExactlyOnceWith(
    f.scope.actorId,
    f.scope.tripId,
    derived.registration,
  );
  expect(f.seal).toHaveBeenCalledExactlyOnceWith(
    f.scope.actorId,
    f.scope.tripId,
    derived.seal,
  );
  expect(f.verifyPng).toHaveBeenCalledExactlyOnceWith(f.scope, f.pngPlan.verify);
});

it.each(["missing", "IO_UNKNOWN", "IO_ACTIVE", "IO_QUIESCENT"])(
  "requests missing PNG before PDF work and handles %s without starting a Run",
  async (state) => {
    const f = await fixture();
    const q = f.pngPlan.upload;
    f.journal.set(
      q.operation_id,
      state === "missing"
        ? null
        : {
            contract_version: 1,
            operation_id: q.operation_id,
            operation_key: q.operation_key,
            operation_sha256: q.operation_sha256,
            phase: state,
            attempt_generation: 1,
          },
    );
    await expect(f.complete()).rejects.toThrow(
      state === "missing" ? "UNIVERSAL_ORIGINAL_BYTES_REQUIRED" : "REPLAY_FORBIDDEN",
    );
    expect(f.operations).toEqual(
      state === "missing" ? [] : ["PDF Verify", "PDF Register", "PDF Seal"],
    );
    expect(f.deps.openPng).toHaveBeenCalledOnce();
  },
);

it("preserves an UNKNOWN Verify and rejects a tampered receipt", async () => {
  const f = await fixture();
  const q = f.pdfPlan.verify;
  f.journal.set(q.operation_id, {
    contract_version: 1,
    operation_id: q.operation_id,
    operation_key: q.operation_key,
    operation_sha256: q.operation_sha256,
    phase: "IO_UNKNOWN",
    attempt_generation: 1,
  });
  await expect(f.complete()).rejects.toThrow("UNIVERSAL_RETAINED_VERIFY_UNCONFIRMED");
  f.journal.delete(q.operation_id);
  f.journal.set(f.pdfPlan.upload.operation_id, {
    ...(await f.receipt(f.pdfPlan.upload)),
    result_sha256: "0".repeat(64),
  });
  await expect(f.complete()).rejects.toThrow("SOURCE_RECEIPT_MISMATCH");
  expect(f.operations).toEqual(["PNG Verify"]);
});

it("stops after a lost Verify acknowledgement and uses the same final receipt on the next authorized request", async () => {
  const f = await fixture();
  f.verifyPdf.mockImplementationOnce(async (_actor, _trip, command) => {
    f.journal.set(command.operation_id, await f.receipt(command));
    throw Error("VERIFY_ACK_LOST");
  });
  await expect(f.complete()).rejects.toThrow("VERIFY_ACK_LOST");
  expect(f.register).not.toHaveBeenCalled();
  expect(f.verifyPng).toHaveBeenCalledTimes(1);
  await f.complete();
  expect(f.verifyPdf).toHaveBeenCalledTimes(1);
  expect(f.verifyPng).toHaveBeenCalledTimes(1);
  expect(f.operations).toEqual(
    expect.arrayContaining(["PNG Verify", "PDF Register", "PDF Seal"]),
  );
});

it("checks all input scopes before operation lookups and fences cancellation between owning phases", async () => {
  const f = await fixture();
  const acquisition = f.retainedOriginals[1].acquisition;
  const trip = acquisition.trip_id;
  acquisition.trip_id = randomUUID();
  await expect(f.complete()).rejects.toThrow("UNIVERSAL_RETAINED_SOURCE_SCOPE");
  expect(f.deps.lookupOperation).not.toHaveBeenCalled();
  acquisition.trip_id = trip;
  f.verifyPdf.mockImplementationOnce(async (_actor, _trip, command) => {
    f.controller.abort(Error("FENCE_CLOSED"));
    return (await f.receipt(command)) as never;
  });
  await expect(f.complete()).rejects.toThrow("FENCE_CLOSED");
  expect(f.register).not.toHaveBeenCalled();
});

it("keeps Verify durable and leaves Seal untouched when registration fails", async () => {
  const f = await fixture();
  f.register.mockRejectedValueOnce(Error("REGISTER_REPLY_LOST"));
  await expect(f.complete()).rejects.toThrow("REGISTER_REPLY_LOST");
  expect(f.seal).not.toHaveBeenCalled();
  expect(f.verifyPng).toHaveBeenCalledTimes(1);
  await f.complete();
  expect(f.verifyPdf).toHaveBeenCalledTimes(1);
  expect(f.register.mock.calls[0]).toEqual(f.register.mock.calls[1]);
  expect(f.seal).toHaveBeenCalledTimes(1);
});

it("accepts exact retained metadata at Prepare and wakes only when the original batch is complete", async () => {
  const f = await fixture();
  const { actorId, tripId } = f.scope;
  const batchId = f.batch.batchId;
  const taskId = randomUUID();
  f.journal.set(f.pdfPlan.verify.operation_id, await f.receipt(f.pdfPlan.verify));
  f.journal.delete(f.pngPlan.upload.operation_id);
  const input = { ...f.batch, tripId, retainedOriginals: f.retainedOriginals };
  const drainTargeted = vi.fn(async () => {});
  const start = () =>
    universalPrepareBoundary(
      new Request(`https://local/v2/import-batches/${batchId}/interpretations/prepare`, {
        method: "POST",
        headers: { "Idempotency-Key": batchId },
        body: JSON.stringify(input),
      }),
      actorId,
      async () => true,
      (trip, raw) =>
        prepareUniversalQueuedRuntime(actorId, trip, raw, {
          drainTargeted,
          resume: async () => {
            throw Error("UNEXPECTED_RESUME");
          },
          prepare: async (requestedTrip, posted) => {
            expect(requestedTrip).toBe(tripId);
            expect(posted).toEqual(input);
            await f.complete();
            return {
              status: "QUEUED",
              context: {
                version: "otr.backend.universal-context/1",
                actorId,
                accountId: actorId,
                tripId,
                batchId,
                taskId,
              },
            };
          },
        }),
    );
  expect((await start()).status).toBe(409);
  expect(f.operations).toEqual([]);
  expect(drainTargeted).not.toHaveBeenCalled();
  f.journal.set(f.pngPlan.upload.operation_id, await f.receipt(f.pngPlan.upload));
  expect((await start()).status).toBe(202);
  await nextTick();
  expect(f.verifyPdf).not.toHaveBeenCalled();
  expect(f.verifyPng).toHaveBeenCalledTimes(1);
  expect(drainTargeted).toHaveBeenCalledExactlyOnceWith(batchId, taskId);
});

it("requests only the missing PNG, rejects changed bytes and reuses the completed upload", async () => {
  const f = await fixture();
  f.journal.delete(f.pngPlan.upload.operation_id);
  const inputId = f.retainedOriginals[1].inputId;
  const writes: string[] = [];
  f.pngPort.execute = async (scope, command, bytes) => {
    writes.push(command.command);
    if (command.command === "VERIFY_REPRESENTATION") return f.verifyPng(scope, command);
    if (command.command === "UPLOAD_ORIGINAL") expect(bytes).toEqual(f.pngBytes);
    else expect(bytes).toBeUndefined();
    const result = await f.receipt(command);
    f.journal.set(command.operation_id, result);
    return result;
  };
  await expect(f.complete()).rejects.toMatchObject({
    message: "UNIVERSAL_ORIGINAL_BYTES_REQUIRED",
    inputId,
  });
  expect(writes).toEqual([]);
  f.deps.originalUpload = { inputId, base64: Buffer.from([0, 0, 0]).toString("base64") };
  await expect(f.complete()).rejects.toThrow("SOURCE_INTEGRITY_FAILURE");
  expect(writes).toEqual([]);
  f.deps.originalUpload.base64 = f.pngBytes.toString("base64");
  await f.complete();
  delete f.deps.originalUpload;
  await f.complete();
  expect(writes).toEqual([
    "PREPARE_REPRESENTATION",
    "UPLOAD_ORIGINAL",
    "VERIFY_REPRESENTATION",
  ]);
});

it("commits batch acceptance before material work and resumes the exact challenge after SQLite reopen", async () => {
  const f = await fixture();
  const { actorId, tripId } = f.scope;
  const { batchId } = f.batch;
  const root = await mkdtemp(join(tmpdir(), "otr-material-intake-"));
  const path = join(root, "task.sqlite");
  let sql = new DatabaseSync(path);
  const missing = f.retainedOriginals[1].inputId;
  const manifest = { ...f.batch, tripId, deferMaterials: true, retainedOriginals: f.retainedOriginals };
  const supplement = { ...manifest, originalUpload: { inputId: missing, base64: f.pngBytes.toString("base64") } };
  const context = {
    version: "otr.backend.universal-context/1" as const,
    accountId: actorId, actorId, tripId, batchId, taskId: randomUUID(),
  };
  const checking = Promise.withResolvers<void>();
  const worker = Promise.withResolvers<void>();
  const drain = vi.fn(async () => {});
  const continuation = vi.fn(async (_input: unknown, onStaged: () => void) => {
    await checking.promise;
    if (continuation.mock.calls.length === 1) throw new OriginalBytesRequired(missing);
    onStaged();
    await worker.promise;
    return prepareUniversalQueuedRuntime(actorId, tripId, f.batch, {
      resume: async () => context,
      prepare: async () => ({ status: "QUEUED", context }),
      drainTargeted: drain,
    });
  });
  try {
    let intake = createUniversalMaterialIntake(initializeUniversalTaskDatabase(sql));
    const start = (value: unknown, actor = actorId) => universalPrepareBoundary(
      new Request(`https://local/v2/import-batches/${batchId}/interpretations/prepare`, {
        method: "POST", headers: { "Idempotency-Key": batchId }, body: JSON.stringify(value),
      }),
      actor, async () => true,
      (trip, raw) => intake.start(actor, trip, raw, continuation),
    );
    const status = (actor = actorId) => universalBoundary(
      new Request(`https://local/v2/import-batches/${batchId}/interpretations?tripId=${tripId}&materialIntake=1`),
      actor, async () => true,
      {
        execute: async () => { throw Error("unexpected execution"); },
        read: async () => null,
        readMaterialIntake: async (a, b, t) => {
          const receipt = await intake.read(a, t, b);
          return receipt === "READY" ? { status: "EXISTING", context } : receipt;
        },
      },
    );
    const first = await start(manifest);
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ status: "WAITING_MATERIALS", material: { state: "PREPARING" } });
    expect(await (await start(manifest)).json()).toMatchObject({ material: { state: "PREPARING" } });
    expect((await start({ ...manifest, submissionSha256: "b".repeat(64) })).status).toBe(503);
    expect((await status(randomUUID())).status).toBe(404);
    expect(drain).not.toHaveBeenCalled();

    checking.resolve();
    await vi.waitFor(async () => {
      expect(await (await status()).json()).toMatchObject({ material: { state: "NEEDS_BYTES", inputId: missing } });
    });
    sql.close();
    sql = new DatabaseSync(path);
    intake = createUniversalMaterialIntake(initializeUniversalTaskDatabase(sql));
    expect(await (await status()).json()).toMatchObject({ material: { state: "NEEDS_BYTES", inputId: missing } });
    const upload = await start(supplement);
    expect(upload.status).toBe(202);
    expect(await upload.json()).toMatchObject({ material: { state: "PREPARING" } });
    expect(await (await start(supplement)).json()).toMatchObject({ material: { state: "PREPARING" } });
    expect(drain).not.toHaveBeenCalled();

    worker.resolve();
    await vi.waitFor(async () => {
      expect(await (await status()).json()).toEqual({ status: "EXISTING", context });
    });
    expect(drain).toHaveBeenCalledExactlyOnceWith(batchId, context.taskId);
    expect(continuation).toHaveBeenCalledTimes(2);
    expect(sql.prepare("SELECT count(*) AS count FROM universal_material_intake").get()).toEqual({ count: 1 });
    expect(await (await start(supplement)).json()).toMatchObject({ material: { state: "RESUME_REQUIRED" } });
    expect(continuation).toHaveBeenCalledTimes(2);
  } finally {
    checking.resolve();
    worker.resolve();
    sql.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps an uncertain supplement from replay and reopens only from a manifest-only Start", async () => {
  const f = await fixture();
  const { actorId, tripId } = f.scope;
  const { batchId } = f.batch;
  const manifest = { ...f.batch, tripId, deferMaterials: true, retainedOriginals: f.retainedOriginals };
  const missing = f.retainedOriginals[1].inputId;
  const supplement = { ...manifest, originalUpload: { inputId: missing, base64: f.pngBytes.toString("base64") } };
  const sql = new DatabaseSync(":memory:");
  try {
    const db = initializeUniversalTaskDatabase(sql);
    let intake = createUniversalMaterialIntake(db);
    const challenge = async () => { throw new OriginalBytesRequired(missing); };
    await intake.start(actorId, tripId, manifest, challenge);
    await vi.waitFor(async () => expect(await intake.read(actorId, tripId, batchId))
      .toMatchObject({ material: { state: "NEEDS_BYTES" } }));
    await expect(intake.start(actorId, tripId, supplement, async () => {
      throw Error("UNKNOWN_WRITE");
    })).rejects.toThrow("UNKNOWN_WRITE");

    intake = createUniversalMaterialIntake(db);
    const recover = vi.fn(async (_input: unknown) => challenge());
    expect(await intake.start(actorId, tripId, supplement, recover))
      .toMatchObject({ material: { state: "RESUME_REQUIRED" } });
    expect(recover).not.toHaveBeenCalled();
    await intake.start(actorId, tripId, manifest, recover);
    await vi.waitFor(async () => expect(await intake.read(actorId, tripId, batchId))
      .toMatchObject({ material: { state: "NEEDS_BYTES" } }));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover.mock.lastCall?.[0]).not.toHaveProperty("originalUpload");
  } finally {
    sql.close();
  }
});
