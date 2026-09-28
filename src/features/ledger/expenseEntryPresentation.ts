import type {
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
} from "@/domain/ledger/types";
import {
  buildDraftSplits,
  parseCurrencyAmount,
  shouldShowGroupSettlement,
  type DraftMember,
} from "./expenseDraft";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

export function remainingExpenseAttachmentCapacity(selected: number, scanning = 0) {
  return Math.max(0, MAX_EXPENSE_ATTACHMENTS - selected - scanning);
}

const splitSummary: Record<ExpenseSplitMethod, string> = {
  EQUAL_PERSON: "Split equally",
  EQUAL_HOUSEHOLD: "Equal per household",
  HOUSEHOLD_SHARES: "Household shares",
  EXACT: "Custom split",
  PERCENTAGE: "Percentage split",
};

export function compactExpenseDate(key: string, today = new Date()): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(new Date(year, month - 1, day));
}

export function expenseSharingSummary(
  draft: {
    payerId: string;
    participantIds: string[];
    splitMode: ExpenseSplitMethod;
    settlementParticipation: ExpenseSettlementParticipation;
  },
  members: DraftMember[],
  actorId: string,
): string[] {
  const name = (id: string) =>
    id === actorId
      ? "You"
      : (members.find((member) => member.id === id)?.displayName ?? "Traveller");
  const participants = draft.participantIds;
  if (
    participants.length === 1 &&
    participants[0] === actorId &&
    draft.payerId === actorId
  )
    return ["Just you"];
  const first = `${name(draft.payerId)} paid · ${participants.length === 1 ? name(participants[0]) : `${participants.length} people`}`;
  const details = [...(participants.length > 1 ? [splitSummary[draft.splitMode]] : [])];
  return details.length ? [first, details.join(" · ")] : [first];
}

export function expenseSettlementLabel(
  draft: Pick<
    Parameters<typeof expenseSharingSummary>[0],
    "payerId" | "participantIds" | "settlementParticipation"
  >,
) {
  if (!shouldShowGroupSettlement(draft.participantIds, draft.payerId)) return null;
  return draft.settlementParticipation === "INCLUDED"
    ? "Included in settlement"
    : "Excluded from settlement";
}

export const GROUP_SETTLEMENT_EXPLANATION =
  "When included, this expense helps calculate who owes whom in this trip.";

export function exactSharingAllocation(
  totalMinor: number | null,
  scale: number,
  memberIds: string[],
  exact: Record<string, string>,
) {
  const amounts = memberIds.map((id) =>
    parseCurrencyAmount(exact[id] ?? "", scale, true),
  );
  const assignedMinor = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const remainingMinor = totalMinor === null ? null : totalMinor - assignedMinor;
  let valid = false;
  if (totalMinor !== null && amounts.every((amount) => amount !== null)) {
    try {
      buildDraftSplits({
        mode: "EXACT",
        originalMinor: totalMinor,
        settlementMinor: null,
        members: memberIds.map((id) => ({
          id,
          displayName: "",
          householdId: null,
          shareUnits: null,
        })),
        exactMinor: Object.fromEntries(
          memberIds.map((id, index) => [id, amounts[index]!]),
        ),
      });
      valid = true;
    } catch {
      // The accepted Ledger allocator is the completion gate.
    }
  }
  return { assignedMinor, remainingMinor, valid };
}

export function expenseDraftAttachmentLabel(
  draft: Pick<TemporaryReceiptDraft, "mimeType" | "originalFilename" | "localUri">,
  position: number,
) {
  const image = draft.mimeType.startsWith("image/");
  const filename = draft.originalFilename?.trim().split(/[\\/]/).pop() ?? "";
  const generated =
    /^(?:img|image|photo|dsc|pxl)[-_ ]?\d[\w-]*\.[a-z0-9]+$/i.test(filename) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}\.[a-z0-9]+$/i.test(filename) ||
    /^receipt-draft[-_]/i.test(filename);
  const title =
    filename && !generated
      ? filename
      : image
        ? `Receipt ${position}`
        : `Document ${position}.pdf`;
  const type =
    draft.mimeType === "application/pdf"
      ? "PDF"
      : draft.mimeType.split("/")[1].toUpperCase();
  return { title, type, thumbnailUri: image ? draft.localUri : null };
}

export function applyExpenseSharing<
  T extends {
    payerId: string;
    participantIds: string[];
    splitMode: ExpenseSplitMethod;
    exact: Record<string, string>;
    percentages: Record<string, string>;
    settlementParticipation: ExpenseSettlementParticipation;
  },
>(draft: T, staged: T): T {
  return {
    ...draft,
    payerId: staged.payerId,
    participantIds: staged.participantIds,
    splitMode: staged.splitMode,
    exact: staged.exact,
    percentages: staged.percentages,
    settlementParticipation: staged.settlementParticipation,
  };
}
