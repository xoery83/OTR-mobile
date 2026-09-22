import { describe, expect, it, vi } from "vitest";
import { pushReceiptOperation } from "./ledgerReceiptSyncWorker";

const asset = {
  id: "local-receipt",
  serverId: null,
  journeyId: "journey",
  expenseId: null,
  personalPaymentId: null,
  localUri: "file:///durable/receipt.jpg",
  mimeType: "image/jpeg" as const,
  sizeBytes: 3,
  sha256: "a".repeat(64),
  objectPath: null,
  uploadStatus: "PENDING" as const,
  ocrStatus: "PENDING" as const,
  ocrSuggestion: null,
  createdAt: "now",
  updatedAt: "now",
};

describe("receipt asset worker", () => {
  it("uploads and completes with stable identity without touching Expense mutation", async () => {
    let current = asset as typeof asset & {
      serverId: string | null;
      objectPath: string | null;
      uploadStatus: "PENDING" | "UPLOADED";
    };
    const receipts = {
      getReceipt: vi.fn(async () => current),
      markUploading: vi.fn(),
      markUploadFailed: vi.fn(),
      updateLocalUri: vi.fn(),
      reconcile: vi.fn(async (_id, entity) => {
        current = {
          ...current,
          serverId: entity.id,
          objectPath: entity.objectPath,
          uploadStatus: entity.uploadStatus,
        };
      }),
    };
    const expenses = { getExpense: vi.fn() };
    const entity = {
      ...asset,
      id: "40000000-0000-4000-8000-000000000001",
      journeyId: "10000000-0000-4000-8000-000000000001",
      expenseId: null,
      objectPath: "fixed/original",
      uploadStatus: "UPLOADED" as const,
      ocrStatus: "PENDING" as const,
    };
    const transport = {
      create: vi.fn(async () => ({
        entity: { ...entity, uploadStatus: "PENDING" as const },
        idempotentReplay: false,
      })),
      upload: vi.fn(async () => "file:///current/receipt.jpg"),
      complete: vi.fn(async () => ({ entity, idempotentReplay: false })),
      ocr: vi.fn(),
      link: vi.fn(),
    };
    await pushReceiptOperation(
      {
        id: "op",
        ownerUserId: "user-a",
        journeyId: "journey",
        assetId: asset.id,
        operationType: "UPLOAD_RECEIPT",
        idempotencyKey: "stable",
        status: "PENDING",
        attemptCount: 0,
        nextAttemptAt: null,
      },
      receipts as never,
      expenses as never,
      transport as never,
    );
    expect(transport.upload).toHaveBeenCalledWith(
      "journey",
      entity.id,
      asset.localUri,
      asset.mimeType,
    );
    expect(transport.complete).toHaveBeenCalledWith(
      "journey",
      entity.id,
      "stable:complete",
      { objectPath: "fixed/original", sizeBytes: 3, sha256: asset.sha256 },
    );
    expect(receipts.updateLocalUri).toHaveBeenCalledWith(
      asset.id,
      "file:///current/receipt.jpg",
    );
    expect(expenses.getExpense).not.toHaveBeenCalled();
  });

  it("does not run OCR before a durable upload completes", async () => {
    const receipts = { getReceipt: vi.fn(async () => asset) };
    const transport = { ocr: vi.fn() };
    await expect(
      pushReceiptOperation(
        {
          id: "ocr",
          ownerUserId: "user-a",
          journeyId: "journey",
          assetId: asset.id,
          operationType: "OCR_RECEIPT",
          idempotencyKey: "ocr",
          status: "PENDING",
          attemptCount: 0,
          nextAttemptAt: null,
        },
        receipts as never,
        { getExpense: vi.fn() } as never,
        transport as never,
      ),
    ).rejects.toThrow("upload must complete");
    expect(transport.ocr).not.toHaveBeenCalled();
  });

  it("links an uploaded asset to a Personal Payment without an Expense", async () => {
    const personal = {
      ...asset,
      serverId: "40000000-0000-4000-8000-000000000001",
      personalPaymentId: "50000000-0000-4000-8000-000000000001",
      uploadStatus: "UPLOADED" as const,
    };
    const receipts = { getReceipt: vi.fn(async () => personal) };
    const transport = {
      linkPersonalPayment: vi.fn(async () => ({ entity: personal })),
      link: vi.fn(),
    };

    await pushReceiptOperation(
      {
        id: "link-op",
        ownerUserId: "user-a",
        journeyId: "journey",
        assetId: asset.id,
        operationType: "LINK_RECEIPT",
        idempotencyKey: "stable-link",
        status: "PENDING",
        attemptCount: 0,
        nextAttemptAt: null,
      },
      receipts as never,
      { getExpense: vi.fn() } as never,
      transport as never,
    );

    expect(transport.linkPersonalPayment).toHaveBeenCalledWith(
      "journey",
      personal.serverId,
      personal.personalPaymentId,
      "stable-link",
    );
    expect(transport.link).not.toHaveBeenCalled();
  });
});
