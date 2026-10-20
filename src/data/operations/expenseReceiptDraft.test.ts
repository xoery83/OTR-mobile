import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  discardExpenseReceiptDraft,
  saveExpenseWithReceiptDraft,
  saveExpenseEditWithReceiptDrafts,
  selectExpenseReceiptDraft,
  selectExpenseReceiptDraftBatch,
  restoreExpenseReceiptDrafts,
  transferConfirmedReceiptDrafts,
} from "./expenseReceiptDraft";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  prepare: vi.fn(),
  remove: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  activeUser: vi.fn(),
  list: vi.fn(),
  getReceipt: vi.fn(),
  record: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/data/files/receiptFileStore", () => ({
  createTemporaryReceiptDraft: mocks.create,
  prepareReceiptDraft: mocks.prepare,
  deleteTemporaryReceiptDraft: mocks.remove,
  listRecoverableReceiptDrafts: mocks.list,
  recordTemporaryReceiptDraft: mocks.record,
  updateTemporaryReceiptDraftRecord: mocks.update,
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: mocks.activeUser }));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: async () => ({
    createExpense: mocks.createExpense,
    updateExpense: mocks.updateExpense,
  }),
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

  it("keeps earlier validated drafts when a later multi-import item fails", async () => {
    mocks.create
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error("Invalid second file"));
    const result = await selectExpenseReceiptDraftBatch(
      [
        { uri: "file:///picker/one.jpg", mimeType: "image/jpeg", name: "one.jpg" },
        { uri: "file:///picker/two.pdf", mimeType: "application/pdf", name: "two.pdf" },
      ],
      0,
      "journey-a",
    );
    expect(result.drafts).toEqual([expect.objectContaining({ id: draft.id })]);
    expect(result.error?.message).toBe("Invalid second file");
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    await expect(
      selectExpenseReceiptDraftBatch(
        [
          { uri: "file:///picker/one.jpg", mimeType: "image/jpeg" },
          { uri: "file:///picker/two.jpg", mimeType: "image/jpeg" },
        ],
        2,
        "journey-a",
      ),
    ).rejects.toThrow();
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

  it("records stable scan session order for verified restart recovery", async () => {
    const selected = await selectExpenseReceiptDraft(
      "file:///picker/part.jpg",
      "image/jpeg",
      undefined,
      1,
      "part.jpg",
      "journey-a",
      { sessionId: "scan-1", order: 2 },
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: selected.id,
        journeyId: "journey-a",
        scanSessionId: "scan-1",
        scanOrder: 2,
      }),
    );
    mocks.list.mockResolvedValue([
      { ...selected, scanSessionId: "scan-1", scanOrder: 2 },
    ]);
    expect(await restoreExpenseReceiptDrafts("journey-a")).toEqual([
      expect.objectContaining({ scanSessionId: "scan-1", scanOrder: 2 }),
    ]);
  });

  it("reclassifies confirmed scan records without copying or saving, and rolls back failure", () => {
    const parts = [
      { ...draft, id: "part-1", scanSessionId: "scan", scanOrder: 0 },
      { ...draft, id: "part-2", scanSessionId: "scan", scanOrder: 1 },
    ];
    const transferred = transferConfirmedReceiptDrafts(parts);
    expect(transferred.map((item) => item.scanSessionId)).toEqual([undefined, undefined]);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
    mocks.update.mockReset();
    mocks.update
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("record write failed");
      });
    expect(() => transferConfirmedReceiptDrafts(parts)).toThrow("record write failed");
    expect(mocks.update).toHaveBeenLastCalledWith(parts[0]);
  });

  it("cancels a confirmed but unsaved form without durable receipt work", () => {
    const confirmed = transferConfirmedReceiptDrafts([
      { ...draft, scanSessionId: "scan", scanOrder: 0 },
    ]);
    discardExpenseReceiptDraft(confirmed[0]);
    expect(mocks.remove).toHaveBeenCalledWith(confirmed[0]);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("saves confirmed parts through the existing expense attachment operation", async () => {
    const confirmed = transferConfirmedReceiptDrafts([
      { ...draft, id: "part-a", scanSessionId: "scan", scanOrder: 0 },
      { ...draft, id: "part-b", scanSessionId: "scan", scanOrder: 1 },
    ]);
    mocks.prepare.mockImplementation(async (item) => ({ ...prepared, id: item.id }));
    await saveExpenseWithReceiptDraft({} as never, confirmed, "expense-draft");
    expect(mocks.createExpense).toHaveBeenCalledOnce();
    expect(mocks.createExpense).toHaveBeenCalledWith(
      {},
      confirmed.map((item) => ({ ...prepared, id: item.id })),
      "expense-draft",
    );
    expect(mocks.remove).toHaveBeenCalledTimes(2);
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

describe("Edit Expense temporary attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeUser.mockResolvedValue("user-a");
    mocks.prepare.mockResolvedValue(prepared);
  });
  it("prepares bytes then submits the entire edit atomically and cleans only after success", async () => {
    mocks.updateExpense.mockResolvedValue({ id: "expense" });
    const command = {} as Parameters<typeof saveExpenseEditWithReceiptDrafts>[1];
    await saveExpenseEditWithReceiptDrafts(
      { id: "expense", revision: 4 },
      command,
      [draft],
      ["removed"],
      ["retained", "removed"],
    );
    expect(mocks.updateExpense).toHaveBeenCalledWith(
      "expense",
      command,
      "Edited Expense.",
      {
        added: [prepared],
        removedIds: ["removed"],
        expectedIds: ["retained", "removed"],
        expectedRevision: 4,
      },
    );
    expect(mocks.remove).toHaveBeenCalledWith(draft);
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });
  it("retains the unsaved draft on rejected Save and refuses another account's bytes", async () => {
    mocks.updateExpense.mockRejectedValue(new Error("Attachments changed"));
    const command = {} as Parameters<typeof saveExpenseEditWithReceiptDrafts>[1];
    await expect(
      saveExpenseEditWithReceiptDrafts(
        { id: "expense", revision: 4 },
        command,
        [draft],
        [],
        [],
      ),
    ).rejects.toThrow("Attachments changed");
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.activeUser.mockResolvedValue("other-user");
    mocks.prepare.mockClear();
    await expect(
      saveExpenseEditWithReceiptDrafts(
        { id: "expense", revision: 4 },
        command,
        [draft],
        [],
        [],
      ),
    ).rejects.toThrow("another account");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
