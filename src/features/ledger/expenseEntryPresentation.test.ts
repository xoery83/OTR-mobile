import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";
import type {
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
} from "@/domain/ledger/types";
import {
  applyExpenseSharing,
  compactExpenseDate,
  exactSharingAllocation,
  expenseDraftAttachmentLabel,
  expenseSettlementLabel,
  expenseSharingSummary,
  GROUP_SETTLEMENT_EXPLANATION,
  remainingExpenseAttachmentCapacity,
} from "./expenseEntryPresentation";

const members = [
  { id: "me", displayName: "Synthetic Owner", householdId: null, shareUnits: null },
  { id: "a", displayName: "Alex", householdId: null, shareUnits: null },
  { id: "b", displayName: "Bo", householdId: null, shareUnits: null },
];
const base = {
  payerId: "me",
  participantIds: ["me"],
  splitMode: "EQUAL_PERSON" as const,
  settlementParticipation: "INCLUDED" as const,
};

describe("New Expense compact presentation", () => {
  it("uses local compact dates without changing the stored key", () => {
    expect(compactExpenseDate("2026-09-28", new Date(2026, 0, 1))).not.toContain("2026");
    expect(compactExpenseDate("2025-09-28", new Date(2026, 0, 1))).toContain("2025");
    expect(compactExpenseDate("2026-09-28", new Date(2026, 0, 1))).not.toBe("2026-09-28");
  });

  it("shows You and only applicable sharing details", () => {
    expect(expenseSharingSummary(base, members, "me")).toEqual(["Just you"]);
    expect(
      expenseSharingSummary({ ...base, participantIds: ["me", "a"] }, members, "me"),
    ).toEqual(["You paid · 2 people", "Split equally"]);
    expect(
      expenseSharingSummary(
        {
          ...base,
          participantIds: ["me", "a", "b"],
          splitMode: "EXACT",
          settlementParticipation: "EXCLUDED",
        },
        members,
        "me",
      ),
    ).toEqual(["You paid · 3 people", "Custom split"]);
    expect(
      expenseSharingSummary(
        { ...base, payerId: "a", participantIds: ["me"] },
        members,
        "me",
      ),
    ).toEqual(["Alex paid · You"]);
    expect(
      expenseSharingSummary(
        { ...base, payerId: "a", participantIds: ["a", "b"] },
        members,
        "me",
      ),
    ).toEqual(["Alex paid · 2 people", "Split equally"]);
    expect(expenseSettlementLabel(base)).toBeNull();
    expect(expenseSettlementLabel({ ...base, participantIds: ["me", "a"] })).toBe(
      "Included in settlement",
    );
    expect(
      expenseSettlementLabel({
        ...base,
        participantIds: ["me", "a"],
        settlementParticipation: "EXCLUDED",
      }),
    ).toBe("Excluded from settlement");
    expect(GROUP_SETTLEMENT_EXPLANATION).toMatch(/who owes whom/);
  });

  it("applies staged Sharing only on Done and preserves unrelated Expense fields", () => {
    const draft = {
      ...base,
      splitMode: base.splitMode as ExpenseSplitMethod,
      settlementParticipation:
        base.settlementParticipation as ExpenseSettlementParticipation,
      exact: {},
      percentages: {},
      amount: "234.50",
      title: "Lunch",
    };
    const staged = {
      ...draft,
      payerId: "a",
      participantIds: ["me", "a"],
      splitMode: "EXACT" as const,
      exact: { me: "100", a: "134.50" },
      settlementParticipation: "EXCLUDED" as const,
    };
    expect(draft.payerId).toBe("me"); // Cancel leaves the original draft untouched.
    const applied = applyExpenseSharing(draft, staged);
    expect(applied).toMatchObject({
      payerId: "a",
      participantIds: ["me", "a"],
      splitMode: "EXACT",
      settlementParticipation: "EXCLUDED",
      amount: "234.50",
      title: "Lunch",
    });
    expect(expenseSharingSummary(applied, members, "me")).toEqual([
      "Alex paid · 2 people",
      "Custom split",
    ]);
  });

  it("shows exact total, assigned and remaining with the accepted allocation gate", () => {
    expect(
      exactSharingAllocation(23_400, 2, ["me", "a"], { me: "120", a: "114" }),
    ).toEqual({ assignedMinor: 23_400, remainingMinor: 0, valid: true });
    expect(
      exactSharingAllocation(23_400, 2, ["me", "a"], { me: "120", a: "50" }),
    ).toEqual({ assignedMinor: 17_000, remainingMinor: 6_400, valid: false });
    expect(
      exactSharingAllocation(23_400, 2, ["me", "a"], { me: "120", a: "200" }),
    ).toEqual({ assignedMinor: 32_000, remainingMinor: -8_600, valid: false });
    expect(exactSharingAllocation(null, 2, ["me", "a"], {})).toEqual({
      assignedMinor: 0,
      remainingMinor: null,
      valid: false,
    });
    expect(
      exactSharingAllocation(234, 0, ["me", "a"], { me: "100", a: "134" }).valid,
    ).toBe(true);
  });

  it("uses filename, receipt fallback, PDF type and local image thumbnail", () => {
    const image = {
      mimeType: "image/jpeg" as const,
      originalFilename: "Tokyo lunch.jpg",
      localUri: "file:///draft/one.jpg",
    };
    expect(expenseDraftAttachmentLabel(image, 1)).toEqual({
      title: "Tokyo lunch.jpg",
      type: "JPEG",
      thumbnailUri: image.localUri,
    });
    expect(
      expenseDraftAttachmentLabel({ ...image, originalFilename: "IMG_1234.HEIC" }, 2),
    ).toMatchObject({ title: "Receipt 2", thumbnailUri: image.localUri });
    expect(
      expenseDraftAttachmentLabel(
        {
          mimeType: "application/pdf",
          originalFilename: "Hotel invoice.pdf",
          localUri: "file:///draft/file.pdf",
        },
        3,
      ),
    ).toEqual({ title: "Hotel invoice.pdf", type: "PDF", thumbnailUri: null });
    for (const count of [1, 2, 3]) {
      const rows = Array.from({ length: count }, (_, index) =>
        expenseDraftAttachmentLabel(
          { ...image, originalFilename: "IMG_1234.HEIC" },
          index + 1,
        ),
      );
      expect(rows.map((row) => row.title)).toEqual(
        Array.from({ length: count }, (_, index) => `Receipt ${index + 1}`),
      );
    }
    expect(MAX_EXPENSE_ATTACHMENTS).toBe(3);
    expect(
      [0, 1, 2, 3].map((count) => remainingExpenseAttachmentCapacity(count)),
    ).toEqual([3, 2, 1, 0]);
    expect(remainingExpenseAttachmentCapacity(1, 1)).toBe(1);
  });

  it("keeps the compact controls connected to existing entry flows", () => {
    const source = readFileSync(
      new URL("./LedgerExpenseEntryScreen.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("More Details");
    expect(source).toMatch(/label="Category"[\s\S]*?setCategorySheet\(true\)/);
    expect(source).toMatch(/label="Date"[\s\S]*?setDatePicker\(true\)/);
    expect(source).toContain("setSharingSheet(true)");
    expect(source).toContain("setSharingDraft({ ...sharingEdit, payerId: member.id })");
    expect(source).toContain("setSharingDraft({ ...sharingEdit, participantIds: ids })");
    expect(source).toContain("setSharingDraft({ ...sharingEdit, splitMode: mode })");
    expect(source).toContain(
      "setSharingDraft({ ...sharingEdit, settlementParticipation: value })",
    );
    expect(source).toContain("setDraft(applyExpenseSharing(draft, sharingEdit))");
    expect(source).toContain("onPress={() => chooseReceipt(false)}");
    expect(source).toContain('accessibilityLabel="Add attachment"');
    expect(source).toContain("!receiptCapacityFull || existing ? (");
    expect(source).toContain("discardExpenseReceiptDraft(receiptDraft)");
    expect(source).toContain("previewReceiptDraftPdf(receiptDraft.localUri)");
    expect(source).toContain("setPreviewDraft(receiptDraft)");
    expect(source).toContain(
      "accessibilityLabel={`Preview ${display.title}, ${display.type}`}",
    );
    expect(source).toContain("setReceiptDrafts([...receiptDrafts, ...transferred])");
    expect(source).toContain("onPress={() => setNotesExpanded(true)}");
    expect(source).toContain("value={draft.notes}");
    expect(source).toContain("onPress={() => void save()}");
    expect(source).toContain("discardPendingScan();");
    expect(source).toContain('animationType="none"');
    expect(source).toContain("opacity: dateBackdropOpacity");
    expect(source).toContain("translateY: dateSheetOffset");
    expect(source).toContain("allowsMultipleSelection: !existing");
    expect(source).toContain("multiple: !existing");
    expect(source).toContain("selectionLimit: !existing ? remaining : 1");
    expect(source).toContain("selectExpenseReceiptDraftBatch(");
    expect(source).toContain(
      "Scan one receipt, or add multiple parts of a long receipt.",
    );
    expect(source).toContain("Take one photo");
    expect(source).toContain("Select one or multiple photos");
    expect(source).toContain("Select receipt images");
    expect(source).toContain('...(scan ? [] : ["application/pdf"])');
    expect(source).toContain("scanOcrQueue.current.push(next.id)");
    expect(source).toContain("onScanAnother={() => chooseReceipt(true, true)}");
    expect(source).not.toContain("scrollToEnd");
    expect(source).not.toContain("KeyboardAvoidingView");
    expect(source).toContain("setPreviewDraft(next)");
    expect(source).toContain("rightDisabled={");
    expect(source).toContain("styles.chipList");
    const attachmentSection = source.slice(
      source.indexOf("Attachments{selectedReceiptCount"),
      source.indexOf("<Text style={styles.rowLabel}>Notes</Text>"),
    );
    expect(attachmentSection).not.toContain("· Preview");
    expect(attachmentSection).not.toContain("ocrSession.start(receiptDraft)");
    expect(attachmentSection).not.toContain("sizeBytes");
    expect(attachmentSection).not.toContain(
      "Maximum {MAX_EXPENSE_ATTACHMENTS} attachments selected",
    );
  });
});
