import { describe, expect, it, vi } from "vitest";
import { SyncDependencyError } from "./syncEngine";
import { pushReceiptOperation } from "./ledgerReceiptSyncWorker";
import { verifyReceiptFile } from "@/data/files/receiptFileStore";
vi.mock("@/data/files/receiptFileStore", () => ({
  verifyReceiptFile: vi.fn(async () => {}),
}));

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
  it("does not create remote metadata when the local file fails integrity verification", async () => {
    vi.mocked(verifyReceiptFile).mockRejectedValueOnce(
      new Error("receipt bytes changed"),
    );
    const receipts = {
      getReceipt: vi.fn(async () => asset),
      markUploading: vi.fn(),
      markUploadFailed: vi.fn(),
    };
    const transport = { create: vi.fn(), upload: vi.fn() };
    await expect(
      pushReceiptOperation(
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
        {} as never,
        transport as never,
      ),
    ).rejects.toThrow("receipt bytes changed");
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
    expect(receipts.markUploadFailed).toHaveBeenCalledWith(asset.id);
  });

  it("does not upload or relink a locally deleted Expense attachment", async () => {
    const receipts = { getReceipt: vi.fn(async () => ({ ...asset, deletedAt: "now" })) };
    const transport = { create: vi.fn(), upload: vi.fn(), link: vi.fn() };
    for (const operationType of ["UPLOAD_RECEIPT", "LINK_RECEIPT"] as const)
      await pushReceiptOperation(
        {
          id: "op",
          ownerUserId: "user-a",
          journeyId: "journey",
          assetId: asset.id,
          operationType,
          idempotencyKey: "stable",
          status: "PENDING",
          attemptCount: 0,
          nextAttemptAt: null,
        },
        receipts as never,
        {} as never,
        transport as never,
      );
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
    expect(transport.link).not.toHaveBeenCalled();
  });

  it("retries deletion until an in-flight upload settles, then tombstones remotely", async () => {
    let processing = true;
    const receipts = {
      getReceipt: vi.fn(async () => ({
        ...asset,
        deletedAt: "now",
        serverId: null as string | null,
      })),
      isUploadProcessing: vi.fn(async () => processing),
      reconcileDeletion: vi.fn(),
    };
    const transport = {
      deleteExpenseReceipt: vi.fn(async () => ({ entity: { deletedAt: "now" } })),
    };
    const operation = {
      id: "delete",
      ownerUserId: "user-a",
      journeyId: "journey",
      assetId: asset.id,
      operationType: "DELETE_RECEIPT" as const,
      idempotencyKey: "stable",
      status: "PENDING" as const,
      attemptCount: 0,
      nextAttemptAt: null,
    };
    await expect(
      pushReceiptOperation(operation, receipts as never, {} as never, transport as never),
    ).rejects.toThrow("in progress");
    processing = false;
    vi.mocked(receipts.getReceipt).mockResolvedValue({
      ...asset,
      deletedAt: "now",
      serverId: "server-receipt",
    });
    await pushReceiptOperation(
      operation,
      receipts as never,
      {} as never,
      transport as never,
    );
    expect(transport.deleteExpenseReceipt).toHaveBeenCalledWith(
      "journey",
      "server-receipt",
      "stable",
    );
  });
  it("waits for the server Expense before creating an attached remote object", async () => {
    const attached = { ...asset, expenseId: "local-expense" };
    const receipts = {
      getReceipt: vi.fn(async () => attached),
      hasPendingExpenseDeletion: vi.fn(async () => false),
      markUploading: vi.fn(),
      markUploadFailed: vi.fn(),
    };
    const expenses = { getExpense: vi.fn(async () => ({ serverId: null })) };
    const transport = { create: vi.fn(), upload: vi.fn() };
    await expect(
      pushReceiptOperation(
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
      ),
    ).rejects.toThrow("sync before receipt upload");
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
  });

  it("waits for a tombstone before uploading a replacement third attachment", async () => {
    const receipts = {
      getReceipt: vi.fn(async () => ({ ...asset, expenseId: "local-expense" })),
      hasPendingExpenseDeletion: vi.fn(async () => true),
      markUploading: vi.fn(),
    };
    const transport = { create: vi.fn(), upload: vi.fn() };
    await expect(
      pushReceiptOperation(
        {
          id: "replacement",
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
        {} as never,
        transport as never,
      ),
    ).rejects.toThrow("deletion must sync");
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
  });

  it("claims the Expense slot in metadata creation before binary upload", async () => {
    const attached = {
      ...asset,
      expenseId: "local-expense",
      originalMimeType: "image/heic",
      originalSizeBytes: 930_000,
    };
    let current = {
      ...attached,
      serverId: null as string | null,
      objectPath: null as string | null,
    };
    const receipts = {
      getReceipt: vi.fn(async () => current),
      hasPendingExpenseDeletion: vi.fn(async () => false),
      markUploading: vi.fn(),
      markUploadFailed: vi.fn(),
      reconcile: vi.fn(async () => {
        current = { ...current, serverId: "remote-receipt", objectPath: "path" };
      }),
      updateLocalUri: vi.fn(),
    };
    const expenses = { getExpense: vi.fn(async () => ({ serverId: "remote-expense" })) };
    const entity = {
      ...asset,
      id: "remote-receipt",
      expenseId: "remote-expense",
      objectPath: "path",
    };
    const transport = {
      create: vi.fn(async () => ({ entity })),
      upload: vi.fn(async () => asset.localUri),
      complete: vi.fn(async () => ({ entity })),
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
    expect(transport.create).toHaveBeenCalledWith("journey", "stable", {
      localId: asset.id,
      expenseId: "remote-expense",
      mimeType: "image/jpeg",
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
    });
    expect(transport.upload).toHaveBeenCalledTimes(1);
  });
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

  it("reports a LINK upload prerequisite as dependency wait rather than retry failure", async () => {
    const receipts = { getReceipt: vi.fn(async () => asset) };
    const transport = { link: vi.fn() };
    await expect(
      pushReceiptOperation(
        {
          id: "link",
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
        {} as never,
        transport as never,
      ),
    ).rejects.toBeInstanceOf(SyncDependencyError);
    expect(transport.link).not.toHaveBeenCalled();
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
