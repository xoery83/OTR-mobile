import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { prepareDefaultUniversalCaptureSources } from "./defaultUniversalOriginalSource";
const f = vi.hoisted(() => ({
  database: {},
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
beforeEach(() => vi.resetAllMocks());
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
