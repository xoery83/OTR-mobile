import { randomUUID, createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { prepareDefaultUniversalCaptureSources } from "./defaultUniversalOriginalSource";
const f = vi.hoisted(() => ({
  database: { getFirstAsync: vi.fn() },
  bootstrap: vi.fn(),
  captures: { getForSourceHandoff: vi.fn() },
  submissions: {},
  source: vi.fn(),
  imports: vi.fn(),
  native: vi.fn(),
  plans: vi.fn(),
  run: vi.fn(),
  sourceTransport: vi.fn(),
  catalog: vi.fn(),
  pdf: vi.fn(),
  pdfTransport: vi.fn(),
  pdfVerifier: vi.fn(),
  photoConsent: vi.fn(),
}));
vi.mock("../db/database", () => ({ openDatabase: async () => f.database }));
vi.mock("../repositories/defaultLocalCaptureInboxRepository", () => ({
  getDefaultLocalCaptureInboxRepository: async () => f.captures,
  captureStorageDependencies: { sha256: vi.fn(), now: vi.fn(), newId: vi.fn() },
}));
vi.mock("./defaultCaptureSubmission", () => ({
  getDefaultCaptureSubmissionRepository: async () => f.submissions,
}));
vi.mock("../repositories/captureSourceAdmissionRepository", () => ({
  createCaptureSourceAdmissionRepository: f.source,
}));
vi.mock("../repositories/tripImportAdmissionRepository", () => ({
  createTripImportAdmissionRepository: f.imports,
}));
vi.mock("../api/universalOriginalSourceTransport", () => ({
  createUniversalOriginalSourceTransport: f.sourceTransport,
}));
vi.mock("../api/tripPublicationCatalogTransport", () => ({
  createTripPublicationCatalogTransport: f.catalog,
}));
vi.mock("@/native/publicationCatalogReceive", () => ({
  createPublicationCatalogNativeFetch: f.native,
}));
vi.mock("./universalOriginalBatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./universalOriginalBatch")>()),
  recoverUniversalOriginalPlans: f.plans,
  runUniversalOriginalBatch: f.run,
}));
vi.mock("../sync/ledgerReportingCoordinator", () => ({
  revalidateJourneyLedger: f.bootstrap,
}));
vi.mock("./universalPdfOriginalPreparation", () => ({
  prepareAdmittedPdfOriginal: f.pdf,
}));
vi.mock("../api/sourcePdfV4PreparationTransport", () => ({
  createSourcePdfV4PreparationTransport: f.pdfTransport,
}));
vi.mock("@/native/pendingPdfOriginal", () => ({
  createPendingPdfOriginalFormatVerifier: f.pdfVerifier,
}));
vi.mock("./defaultUniversalPhotoConsent", () => ({
  assertDefaultUniversalPhotoConsent: f.photoConsent,
}));
beforeEach(() => {
  vi.resetAllMocks();
  f.database.getFirstAsync.mockResolvedValue({ present: 1 });
});
it("constructs the existing concrete Source/capture/catalog composition only on explicit invocation", async () => {
  const account = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    job = randomUUID(),
    getAccountId = async () => account,
    context = await captureAccountRequestContext(trip, getAccountId),
    native = vi.fn(),
    plans = [{ inputId: randomUUID() }];
  const model = {
    batch: { batchId: batch, jobId: job },
    inputs: [{}],
  } as unknown as CaptureJobReadModel;
  f.native.mockResolvedValue(native);
  f.plans.mockResolvedValue(plans);
  f.run.mockResolvedValue({
    batchId: batch,
    unhandledInputIds: [],
    results: [{ state: "ADMITTED" }],
  });
  await prepareDefaultUniversalCaptureSources(context, model, {
    baseUrl: "https://api-dev.xoery.art",
    getAccountId,
    assertCurrent: () => {},
  });
  expect(f.source.mock.calls[0][2]).toMatchObject({
    handoff: f.captures.getForSourceHandoff,
    utf8FileProfile: "OTR_UTF8_TEXT_FILE_V1",
  });
  expect(f.catalog.mock.calls[0][1]).toEqual({
    baseUrl: "https://api-dev.xoery.art",
    fetchImplementation: native,
  });
  expect(f.run).toHaveBeenCalledWith(
    context,
    job,
    plans,
    expect.objectContaining({
      database: f.database,
      captures: f.captures,
      submissions: f.submissions,
      getAccountId,
    }),
  );
});
it("missing native receiving authority blocks before any Source intent or dispatch", async () => {
  const account = randomUUID(),
    getAccountId = async () => account,
    context = await captureAccountRequestContext(randomUUID(), getAccountId);
  f.native.mockRejectedValue(Error("PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE"));
  await expect(
    prepareDefaultUniversalCaptureSources(context, {} as unknown as CaptureJobReadModel, {
      baseUrl: "https://api-dev.xoery.art",
      getAccountId,
      assertCurrent: () => {},
    }),
  ).rejects.toThrow("UNAVAILABLE");
  expect(f.plans).not.toHaveBeenCalled();
  expect(f.run).not.toHaveBeenCalled();
});

it("receiver diagnostics expose fixed stage metadata only and retain the failure", async () => {
  vi.stubGlobal("__DEV__", true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const failure = Error("private content must never be logged");
  const account = randomUUID(),
    getAccountId = async () => account;
  const context = await captureAccountRequestContext(randomUUID(), getAccountId);
  f.native.mockRejectedValue(failure);
  try {
    await expect(
      prepareDefaultUniversalCaptureSources(context, {} as CaptureJobReadModel, {
        baseUrl: "https://api-dev.xoery.art",
        getAccountId,
        assertCurrent() {},
      }),
    ).rejects.toBe(failure);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "universal_source_native_receiver",
        state: "UNAVAILABLE",
      }),
    );
    expect(f.plans).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("supplies Task preparation only with owning admitted Source pins after all originals settle", async () => {
  const account = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    job = randomUUID(),
    inputId = randomUUID(),
    bindingId = randomUUID();
  const getAccountId = async () => account,
    context = await captureAccountRequestContext(trip, getAccountId),
    pin = { id: inputId, source_id: randomUUID() };
  const readAdmittedInputPin = vi.fn(async () => pin),
    prepareTask = vi.fn(async () => {});
  f.native.mockResolvedValue(vi.fn());
  f.source.mockReturnValue({ readAdmittedInputPin });
  f.plans.mockResolvedValue([]);
  f.run.mockResolvedValue({
    batchId: batch,
    submissionSha256: "a".repeat(64),
    unhandledInputIds: [],
    inputs: [{ inputId, bindingId }],
    results: [{ state: "ADMITTED" }],
  });
  await prepareDefaultUniversalCaptureSources(
    context,
    {
      batch: { batchId: batch, jobId: job },
      inputs: [{}],
    } as unknown as CaptureJobReadModel,
    {
      baseUrl: "https://api-dev.xoery.art",
      getAccountId,
      assertCurrent() {},
      prepareTask,
    },
  );
  expect(readAdmittedInputPin).toHaveBeenCalledExactlyOnceWith(
    context,
    bindingId,
    inputId,
  );
  expect(prepareTask).toHaveBeenCalledExactlyOnceWith({
    tripId: trip,
    batchId: batch,
    submissionSha256: "a".repeat(64),
    inputs: [pin],
  });
});

for (const mode of ["restored", "rejected", "missing", "stale"] as const) {
  it(`missing Actor uses owning bootstrap and fences Source preparation: ${mode}`, async () => {
    const account = randomUUID(),
      trip = randomUUID(),
      batch = randomUUID();
    const getAccountId = async () => account;
    const context = await captureAccountRequestContext(trip, getAccountId);
    const model = {
      batch: { batchId: batch, jobId: randomUUID() },
      inputs: [{}],
    } as unknown as CaptureJobReadModel;
    f.native.mockResolvedValue(vi.fn());
    f.database.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValue(mode === "missing" ? null : { present: 1 });
    f.bootstrap.mockImplementation(async () => {
      if (mode === "rejected") throw Error("FORBIDDEN");
    });
    f.plans.mockResolvedValue([]);
    f.run.mockResolvedValue({
      batchId: batch,
      unhandledInputIds: [],
      results: [{ state: "ADMITTED" }],
    });
    const work = prepareDefaultUniversalCaptureSources(context, model, {
      baseUrl: "https://api-dev.xoery.art",
      getAccountId,
      assertCurrent() {
        if (mode === "stale" && f.bootstrap.mock.calls.length) throw Error("STALE");
      },
    });
    if (mode === "restored") {
      await work;
      expect(f.plans).toHaveBeenCalledOnce();
      expect(f.bootstrap.mock.invocationCallOrder[0]).toBeLessThan(
        f.plans.mock.invocationCallOrder[0],
      );
    } else {
      await expect(work).rejects.toThrow();
      expect(f.plans).not.toHaveBeenCalled();
      expect(f.run).not.toHaveBeenCalled();
    }
    expect(f.bootstrap).toHaveBeenCalledExactlyOnceWith(trip);
  });
}

it("prepares the Task only from admitted text while matching exactly the retained unsupported IDs", async () => {
  const account = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    job = randomUUID();
  const getAccountId = async () => account;
  const context = await captureAccountRequestContext(trip, getAccountId);
  const supported = randomUUID(),
    retained = randomUUID(),
    binding = randomUUID();
  const model = {
    batch: { batchId: batch, jobId: job },
    inputs: [
      { id: supported, kind: "TEXT", declaredContentType: null },
      { id: retained, kind: "FILE", declaredContentType: "application/pdf" },
    ],
  } as unknown as CaptureJobReadModel;
  const pin = { id: supported },
    readAdmittedInputPin = vi.fn(async () => pin);
  f.source.mockReturnValue({ readAdmittedInputPin });
  f.native.mockResolvedValue(vi.fn());
  f.plans.mockResolvedValue([{ inputId: supported }]);
  const response = {
    batchId: batch,
    submissionSha256: "a".repeat(64),
    unhandledInputIds: [retained],
    inputs: [{ inputId: supported, bindingId: binding }],
    results: [{ state: "ADMITTED" }],
  };
  f.run.mockResolvedValue(response);
  const prepareTask = vi.fn();
  await prepareDefaultUniversalCaptureSources(context, model, {
    baseUrl: "https://api-dev.xoery.art",
    getAccountId,
    assertCurrent: () => {},
    prepareTask,
  });
  expect(prepareTask).toHaveBeenCalledExactlyOnceWith({
    tripId: trip,
    batchId: batch,
    submissionSha256: "a".repeat(64),
    inputs: [pin],
  });
  expect(readAdmittedInputPin).toHaveBeenCalledExactlyOnceWith(
    context,
    binding,
    supported,
  );
  prepareTask.mockClear();
  f.run.mockResolvedValue({ ...response, unhandledInputIds: [supported] });
  await expect(
    prepareDefaultUniversalCaptureSources(context, model, {
      baseUrl: "https://api-dev.xoery.art",
      getAccountId,
      assertCurrent: () => {},
      prepareTask,
    }),
  ).rejects.toThrow("UNIVERSAL_SOURCE_PREPARATION_BLOCKED");
  expect(prepareTask).not.toHaveBeenCalled();
});

it.each([false, true])(
  "single PDF waits for actual seal before preparing a Task (unresolved=%s)",
  async (unresolved) => {
    const actor = randomUUID(),
      trip = randomUUID(),
      getAccountId = async () => actor;
    const context = await captureAccountRequestContext(trip, getAccountId);
    const input = {
      id: randomUUID(),
      captureId: randomUUID(),
      payloadId: randomUUID(),
      revision: 1,
      kind: "FILE",
      declaredContentType: "application/pdf",
      contentSha256: "b".repeat(64),
      contentByteCount: 7,
    };
    const model = {
      batch: { batchId: randomUUID(), jobId: randomUUID() },
      inputs: [input],
    } as unknown as CaptureJobReadModel;
    const prepared = {
      inputId: input.id,
      bindingId: randomUUID(),
      sourceCommand: { command: "ACQUIRE_SOURCE" },
    };
    const pin = { inputId: input.id, representationId: randomUUID() };
    const readPin = vi.fn(async () => pin),
      apply = vi.fn(),
      read = vi.fn(async () => ({}));
    f.source.mockReturnValue({ readAdmittedInputPin: readPin });
    f.imports.mockReturnValue({ applyUniversalCatalogs: apply });
    f.catalog.mockReturnValue({ readUniversal: read });
    f.sourceTransport.mockReturnValue({
      lookup: vi.fn(async () => '{"outcome":"APPLIED"}'),
    });
    f.native.mockResolvedValue(vi.fn());
    f.captures.getForSourceHandoff.mockResolvedValue({
      capture: {
        id: input.captureId,
        payloadId: input.payloadId,
        accountId: actor,
        tripId: trip,
        revision: 2,
        sha256: input.contentSha256,
        byteCount: input.contentByteCount,
      },
      bytes: new Uint8Array(7),
    });
    f.plans.mockResolvedValue([]);
    f.run.mockResolvedValue({
      batchId: model.batch.batchId,
      submissionSha256: "a".repeat(64),
      inputs: [prepared],
      unhandledInputIds: [],
      results: [{ state: "ADMITTED" }],
    });
    f.pdf.mockImplementation(async () => {
      if (unresolved) throw Error("PDF_UPLOAD_OUTCOME_UNRESOLVED");
    });
    const prepareTask = vi.fn(),
      pdfVerifier = vi.fn();
    f.pdfVerifier.mockReturnValue(pdfVerifier);
    const work = prepareDefaultUniversalCaptureSources(context, model, {
      baseUrl: "https://api-dev.xoery.art",
      getAccountId,
      assertCurrent() {},
      pendingPdfProfile: "OTR_PDF_CAPTURE_ORIGINAL_V1",
      pendingPngProfile: "OTR_PNG_CAPTURE_ORIGINAL_V1",
      prepareTask,
    });
    if (unresolved) {
      await expect(work).rejects.toThrow("PDF_UPLOAD_OUTCOME_UNRESOLVED");
      expect(prepareTask).not.toHaveBeenCalled();
      expect(readPin).not.toHaveBeenCalled();
    } else {
      await work;
      expect(prepareTask).toHaveBeenCalledWith(
        expect.objectContaining({ inputs: [pin] }),
      );
      expect(f.pdf.mock.invocationCallOrder[0]).toBeLessThan(
        read.mock.invocationCallOrder[0],
      );
      expect(apply.mock.invocationCallOrder[0]).toBeLessThan(
        readPin.mock.invocationCallOrder[0],
      );
    }
    expect(f.source.mock.calls[0][2].verifyBinary).toBe(pdfVerifier);
    expect(f.photoConsent).not.toHaveBeenCalled();
    expect(f.pdf).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        acquisition: prepared.sourceCommand,
        binding: expect.objectContaining({ captureRevision: 2, inputId: input.id }),
      }),
      expect.anything(),
    );
  },
);

it("single PNG checks fresh consent after Source assignment and before Task, retaining pending provenance", async () => {
  const account = randomUUID(),
    trip = randomUUID(),
    job = randomUUID(),
    batch = randomUUID(),
    inputId = randomUUID(),
    captureId = randomUUID(),
    payloadId = randomUUID(),
    bindingId = randomUUID();
  const getAccountId = async () => account,
    context = await captureAccountRequestContext(trip, getAccountId);
  const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
  const hash = createHash("sha256").update(bytes).digest("hex");
  f.photoConsent.mockResolvedValue({ captureRevision: 2 });
  const input = {
    id: inputId,
    kind: "IMAGE",
    state: "ACCEPTED",
    declaredContentType: "image/png",
    acquisitionSource: "photos",
    captureId,
    payloadId,
    revision: 2,
    contentSha256: hash,
    contentByteCount: bytes.length,
    originalFilename: null,
  };
  const model = {
    batch: { accountId: account, batchId: batch, jobId: job },
    inputs: [input],
  } as unknown as CaptureJobReadModel;
  const prepared = {
    inputId,
    bindingId,
    sourceId: randomUUID(),
    representationId: randomUUID(),
    sourceCommand: { original: "pending PNG" },
  };
  f.native.mockResolvedValue(vi.fn());
  f.plans.mockResolvedValue([]);
  f.run.mockResolvedValue({
    batchId: batch,
    submissionSha256: "b".repeat(64),
    unhandledInputIds: [],
    inputs: [prepared],
    results: [{ state: "ADMITTED" }],
  });
  f.source.mockReturnValue({
    readAdmittedInputPin: vi.fn(async () => ({ id: inputId })),
  });
  f.captures.getForSourceHandoff.mockResolvedValue({
    capture: {
      id: captureId,
      payloadId,
      accountId: account,
      tripId: trip,
      revision: 2,
      sha256: hash,
      byteCount: bytes.length,
    },
    bytes,
  });
  f.sourceTransport.mockReturnValue({
    lookup: vi.fn(async () => ({ receipt: "owning" })),
  });
  f.catalog.mockReturnValue({
    readUniversal: vi.fn(async () => ({ catalog: "owning" })),
  });
  f.imports.mockReturnValue({ applyUniversalCatalogs: vi.fn() });
  const preparePngOriginal = vi.fn(),
    prepareTask = vi.fn();
  const options = {
    baseUrl: "https://api-dev.xoery.art",
    getAccountId,
    assertCurrent() {},
    pendingPngProfile: "OTR_PNG_CAPTURE_ORIGINAL_V1" as const,
    preparePngOriginal,
    prepareTask,
  };
  f.photoConsent.mockRejectedValueOnce(Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED"));
  await expect(
    prepareDefaultUniversalCaptureSources(context, model, options),
  ).rejects.toThrow("PHOTO_REVIEW_REQUIRED");
  expect(preparePngOriginal).not.toHaveBeenCalled();
  expect(prepareTask).not.toHaveBeenCalled();
  await prepareDefaultUniversalCaptureSources(context, model, options);
  expect(preparePngOriginal).toHaveBeenCalledExactlyOnceWith(
    context,
    expect.objectContaining({
      acquisition: prepared.sourceCommand,
      acquisitionReceipt: { receipt: "owning" },
      binding: expect.objectContaining({
        captureRevision: 2,
        acquisitionSource: "photos",
        kind: "IMAGE",
        mediaType: "image/png",
      }),
      bytes,
    }),
  );
  expect(prepareTask).toHaveBeenCalledOnce();
  expect(f.photoConsent).toHaveBeenCalledTimes(3);
  expect(f.photoConsent.mock.invocationCallOrder.at(-1)).toBeLessThan(
    prepareTask.mock.invocationCallOrder[0],
  );
  prepareTask.mockClear();
  await expect(
    prepareDefaultUniversalCaptureSources(context, model, {
      ...options,
      preparePngOriginal: undefined,
    }),
  ).rejects.toThrow("PNG_PREPARATION_UNAVAILABLE");
  expect(prepareTask).not.toHaveBeenCalled();
});
