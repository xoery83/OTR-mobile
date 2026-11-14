import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalV3Manifest } from "../api/universalV3Contracts";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { stageLocalFirstCapture } from "./universalV3Capture";

const mock = vi.hoisted(() => ({
  getForSourceHandoff: vi.fn(),
  retain: vi.fn(),
  read: vi.fn(),
  photoDecision: vi.fn(() => {
    throw Error("HISTORICAL_PHOTO_DECISION_MISSING");
  }),
}));
vi.mock("../repositories/defaultLocalCaptureInboxRepository", () => ({
  getDefaultLocalCaptureInboxRepository: async () => mock,
}));
vi.mock("../files/importOriginalFileStore", () => ({
  retainImportOriginal: mock.retain,
  readImportOriginal: mock.read,
}));
vi.mock("./defaultUniversalPhotoConsent", () => ({
  assertDefaultUniversalV3PhotoConsent: mock.photoDecision,
}));

it.each(["image/jpeg", "image/heic"] as const)(
  "stages the selected V3 batch through the existing file contract with %s",
  async (secondType) => {
    vi.clearAllMocks();
    const accountId = randomUUID(),
      tripId = randomUUID(),
      batchId = randomUUID();
    const getAccount = async () => accountId;
    const context = await captureAccountRequestContext(tripId, getAccount);
    const captures = ["image/png", secondType].map((declaredContentType, index) => {
      const bytes =
        declaredContentType === "image/png"
          ? Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 1)
          : declaredContentType === "image/jpeg"
            ? Uint8Array.of(255, 216, 255, 1)
            : Uint8Array.of(1, 2, 3);
      return {
        bytes,
        capture: {
          accountId,
          tripId,
          id: randomUUID(),
          payloadId: randomUUID(),
          kind: "IMAGE",
          declaredContentType,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          byteCount: bytes.length,
        },
      };
    });
    mock.getForSourceHandoff.mockImplementation(async (id) =>
      captures.find(({ capture }) => capture.id === id),
    );
    mock.read.mockImplementation(
      async (_accountId, sha) =>
        captures.find(({ capture }) => capture.sha256 === sha)?.bytes,
    );
    const inputs = captures.map(({ capture }) => ({
      id: randomUUID(),
      captureId: capture.id,
      payloadId: capture.payloadId,
      kind: "IMAGE",
      state: "ACCEPTED",
      contentSha256: capture.sha256,
      contentByteCount: capture.byteCount,
    }));
    const model = {
      batch: { accountId, batchId, context: { tripPrior: { id: tripId } } },
      inputs,
    } as unknown as CaptureJobReadModel;
    const startLocalFirst = vi.fn(
      async (_context, analysisId, manifest: UniversalV3Manifest) => ({
        analysisId,
        missingFiles: manifest.files.map(({ fileId }) => fileId),
      }),
    );
    const uploadLocalFirst = vi.fn(async () => {});
    const readLocalFirst = vi.fn(async () => ({ analysisId: batchId, missingFiles: [] }));
    const start = () =>
      stageLocalFirstCapture(context, model, {
        accountId: getAccount,
        assertCurrent() {},
        transport: { startLocalFirst, uploadLocalFirst, readLocalFirst },
      });

    if (secondType === "image/heic") {
      await expect(start()).rejects.toThrow();
      expect(startLocalFirst).not.toHaveBeenCalled();
      expect(uploadLocalFirst).not.toHaveBeenCalled();
    } else {
      await expect(start()).resolves.toEqual({ analysisId: batchId, missingFiles: [] });
      expect(startLocalFirst).toHaveBeenCalledOnce();
      expect(
        startLocalFirst.mock.calls[0][2].files.map(({ mediaType }) => mediaType),
      ).toEqual(["image/png", "image/jpeg"]);
      expect(uploadLocalFirst).toHaveBeenCalledTimes(2);
      for (const [index, { bytes }] of captures.entries())
        expect(uploadLocalFirst).toHaveBeenNthCalledWith(
          index + 1,
          context,
          batchId,
          inputs[index].id,
          bytes,
        );
    }
    expect(mock.photoDecision).not.toHaveBeenCalled();
  },
);
