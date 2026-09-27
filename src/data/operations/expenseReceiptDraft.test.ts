import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  discardExpenseReceiptDraft,
  saveExpenseWithReceiptDraft,
  selectExpenseReceiptDraft,
  restoreExpenseReceiptDrafts,
} from "./expenseReceiptDraft";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  prepare: vi.fn(),
  remove: vi.fn(),
  createExpense: vi.fn(),
  activeUser: vi.fn(),
  list: vi.fn(),
  getReceipt: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/data/files/receiptFileStore", () => ({
  createTemporaryReceiptDraft: mocks.create,
  prepareReceiptDraft: mocks.prepare,
  deleteTemporaryReceiptDraft: mocks.remove,
  listRecoverableReceiptDrafts: mocks.list,
  recordTemporaryReceiptDraft: mocks.record,
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: mocks.activeUser }));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: async () => ({ createExpense: mocks.createExpense }),
}));
vi.mock("@/data/repositories/defaultLedgerReceiptRepository", () => ({
  getDefaultLedgerReceiptRepository: async () => ({ getReceipt: mocks.getReceipt }),
}));

const draft = {
  id: "receipt-draft-1",
  ownerUserId: "user-a",
  localUri: "file:///draft/receipt.jpg",
  mimeType: "image/jpeg" as const,
  sizeBytes: 3,
  sha256: "a".repeat(64),
};
const prepared = { ...draft, localUri: "file:///durable/receipt.jpg" };

describe("New Expense receipt draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeUser.mockResolvedValue("user-a");
    mocks.create.mockResolvedValue(draft);
    mocks.prepare.mockResolvedValue(prepared);
    mocks.createExpense.mockResolvedValue({ id: "expense-1" });
    mocks.list.mockResolvedValue([]);
    mocks.getReceipt.mockResolvedValue(null);
  });

  it("selects only a temporary file and cancel makes no durable work", async () => {
    expect(
      await selectExpenseReceiptDraft("file:///picker/receipt.jpg", "image/jpeg"),
    ).toEqual(draft);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "user-a",
        sourceUri: "file:///picker/receipt.jpg",
      }),
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
    discardExpenseReceiptDraft(draft);
    expect(mocks.remove).toHaveBeenCalledWith(draft);
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("saves offline with the prepared receipt and deletes the draft only after commit", async () => {
    mocks.createExpense.mockImplementation(async () => {
      expect(mocks.remove).not.toHaveBeenCalled();
      return { id: "expense-1" };
    });
    expect(await saveExpenseWithReceiptDraft({} as never, [draft])).toEqual({
      id: "expense-1",
    });
    expect(mocks.createExpense).toHaveBeenCalledWith({}, [prepared], undefined);
    expect(mocks.remove).toHaveBeenCalledWith(draft);
  });

  it("preserves the temporary source when preparation or SQLite Save fails", async () => {
    mocks.createExpense.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveExpenseWithReceiptDraft({} as never, [draft])).rejects.toThrow(
      "disk full",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.prepare.mockRejectedValueOnce(new Error("copy failed"));
    await expect(saveExpenseWithReceiptDraft({} as never, [draft])).rejects.toThrow(
      "copy failed",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects the new-draft path for an existing Expense", async () => {
    await expect(
      selectExpenseReceiptDraft("file:///picker/receipt.jpg", "image/jpeg", "expense-1"),
    ).rejects.toThrow("only for New Expense");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not save a draft under a different account", async () => {
    mocks.activeUser.mockResolvedValue("user-b");
    await expect(saveExpenseWithReceiptDraft({} as never, [draft])).rejects.toThrow(
      "another account",
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("records a New Expense draft and excludes committed IDs during restart recovery", async () => {
    await selectExpenseReceiptDraft(
      "file:///picker/receipt.jpg",
      "image/jpeg",
      undefined,
      0,
      "receipt.jpg",
      "journey-a",
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: "journey-a" }),
    );
    mocks.list.mockResolvedValue([draft, { ...draft, id: "receipt-draft-2" }]);
    mocks.getReceipt.mockImplementation(async (id) => (id === draft.id ? { id } : null));
    expect(await restoreExpenseReceiptDrafts("journey-a")).toEqual([
      { ...draft, id: "receipt-draft-2" },
    ]);
  });

  it("prepares all three before Save and preserves all sources if preparation fails", async () => {
    const drafts = Array.from({ length: 3 }, (_, index) => ({
      ...draft,
      id: `draft-${index}`,
    }));
    mocks.prepare.mockImplementation(async (item) => {
      if (item.id === "draft-1") throw new Error("copy failed");
      return { ...prepared, id: item.id };
    });
    await expect(saveExpenseWithReceiptDraft({} as never, drafts)).rejects.toThrow(
      "copy failed",
    );
    expect(mocks.createExpense).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.prepare.mockImplementation(async (item) => ({ ...prepared, id: item.id }));
    await saveExpenseWithReceiptDraft({} as never, drafts, "expense-draft");
    expect(mocks.createExpense).toHaveBeenCalledWith(
      {},
      drafts.map((item) => ({ ...prepared, id: item.id })),
      "expense-draft",
    );
    expect(mocks.remove).toHaveBeenCalledTimes(3);
  });

  it("saves only remaining drafts and refuses a fourth before copy", async () => {
    const drafts = Array.from({ length: 4 }, (_, index) => ({
      ...draft,
      id: `draft-${index}`,
    }));
    await expect(saveExpenseWithReceiptDraft({} as never, drafts)).rejects.toThrow(
      "Maximum 3",
    );
    await expect(
      selectExpenseReceiptDraft("file:///fourth", "image/jpeg", undefined, 3),
    ).rejects.toThrow("Maximum 3");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.prepare.mockImplementation(async (item) => ({ ...prepared, id: item.id }));
    await saveExpenseWithReceiptDraft({} as never, [drafts[0], drafts[2]]);
    expect(mocks.createExpense).toHaveBeenCalledWith(
      {},
      [
        { ...prepared, id: drafts[0].id },
        { ...prepared, id: drafts[2].id },
      ],
      undefined,
    );
  });
});
