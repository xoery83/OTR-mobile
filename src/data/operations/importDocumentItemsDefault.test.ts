import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { ImportDocument } from "../repositories/importDocumentsRepository";
import { readDefaultImportDocumentItems } from "./importDocumentItems";
const ports = vi.hoisted(() => ({
  account: "",
  read: vi.fn(),
  links: vi.fn(),
  reopen: vi.fn(),
  context: vi.fn(),
  result: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: async () => ports.account,
}));
vi.mock("./defaultImportDocuments", () => ({
  getDefaultImportDocumentsRepository: async () => ({
    read: ports.read,
    sourceLinks: ports.links,
  }),
}));
vi.mock("./defaultCaptureSubmission", () => ({ reopenDefaultCaptureJob: ports.reopen }));
vi.mock("../api/universalImportTransport", () => ({
  createUniversalImportTransport: () => ({
    context: ports.context,
    result: ports.result,
  }),
}));
vi.mock("../api/tripCoreV2Transport", () => ({ createCoreV2Transport: vi.fn() }));
vi.mock("../repositories/tripCoreSha256", () => ({ tripCoreSha256Hex: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://dev.example.invalid");
});
async function setup() {
  ports.account = randomUUID();
  const tripId = randomUUID();
  const context = await captureAccountRequestContext("", async () => ports.account);
  const doc = {
    accountId: ports.account,
    tripId: null,
    captureId: randomUUID(),
    jobId: randomUUID(),
    batchId: randomUUID(),
  } as ImportDocument;
  ports.read.mockResolvedValue(doc);
  ports.links.mockResolvedValue([{ sourceId: randomUUID(), sourceRevision: 1, tripId }]);
  ports.reopen.mockResolvedValue({ batch: { context: { tripPrior: { id: tripId } } } });
  ports.context.mockResolvedValue({});
  ports.result.mockRejectedValue(Error("STOP_AFTER_CONTEXT_PROBE"));
  return { tripId, context, doc };
}
it("uses the admitted Source Trip for normal Backend authorization while keeping private document scope", async () => {
  const f = await setup();
  await expect(
    readDefaultImportDocumentItems(f.context, "PERSONAL_INBOX", f.doc, () => true),
  ).rejects.toThrow("STOP_AFTER_CONTEXT_PROBE");
  expect(ports.context).toHaveBeenCalledExactlyOnceWith(
    { ...f.context, tripId: f.tripId },
    f.doc.batchId,
  );
  expect(ports.read).toHaveBeenCalledWith(f.context, "PERSONAL_INBOX", f.doc.captureId);
  expect(f.doc.tripId).toBeNull();
});
it("a Batch Trip prior with no matching admitted Source never starts a Backend read", async () => {
  const f = await setup();
  ports.links.mockResolvedValue([
    { sourceId: randomUUID(), sourceRevision: 1, tripId: randomUUID() },
  ]);
  expect(
    await readDefaultImportDocumentItems(f.context, "PERSONAL_INBOX", f.doc, () => true),
  ).toBeNull();
  expect(ports.context).not.toHaveBeenCalled();
});
it("an Account transition during local Batch lookup stops before Source Trip authorization", async () => {
  const f = await setup();
  ports.reopen.mockImplementation(async () => {
    advanceAccountGeneration();
    return { batch: { context: { tripPrior: { id: f.tripId } } } };
  });
  await expect(
    readDefaultImportDocumentItems(f.context, "PERSONAL_INBOX", f.doc, () => true),
  ).rejects.toThrow();
  expect(ports.context).not.toHaveBeenCalled();
});
