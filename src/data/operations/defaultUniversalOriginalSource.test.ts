import { randomUUID } from "node:crypto";
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
vi.mock("./universalOriginalBatch", () => ({
  recoverUniversalOriginalPlans: f.plans,
  runUniversalOriginalBatch: f.run,
}));
vi.mock("../sync/ledgerReportingCoordinator", () => ({
  revalidateJourneyLedger: f.bootstrap,
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
