import { t, getFormatLocale, type MessageKey } from "@/ui/locale";
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

const splitSummary: Record<ExpenseSplitMethod, MessageKey> = {
  EQUAL_PERSON: "expense.splitEqual",
  EQUAL_HOUSEHOLD: "expense.splitHousehold",
  HOUSEHOLD_SHARES: "expense.householdShares",
  EXACT: "expense.exactSplit",
  PERCENTAGE: "expense.percentageSplit",
};

export function splitMethodLabel(method: ExpenseSplitMethod) {
  return t(splitSummary[method]);
}

export function compactExpenseDate(key: string, today = new Date()): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(getFormatLocale(), {
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
      ? t("common.you")
      : (members.find((member) => member.id === id)?.displayName ??
        t("common.traveller"));
  const participants = draft.participantIds;
  if (
    participants.length === 1 &&
    participants[0] === actorId &&
    draft.payerId === actorId
  )
    return [t("expense.justYou")];
  const first = t("expense.sharingSummary", {
    payer: name(draft.payerId),
    participants:
      participants.length === 1
        ? name(participants[0])
        : t("expense.people", { count: participants.length }),
  });
  const details = [
    ...(participants.length > 1 ? [splitMethodLabel(draft.splitMode)] : []),
  ];
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
    ? t("expense.includedSettlement")
    : t("expense.excludedSettlement");
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
        ? t("expense.receiptNumber", { position })
        : t("expense.documentNumber", { position });
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
