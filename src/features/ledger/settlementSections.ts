import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { PersonalSettlementStatement } from "@/domain/ledger/personalSettlementReview";
import type { Stage7Finalized, Stage7Preview } from "@/hooks/useStage7Settlement";

export type SettlementMember = { id: string; label: string };

export type SettlementExpenseRow = LedgerReportListItem & {
  splitMethod: LedgerExpense["splits"][number]["method"] | null;
};

export type SettlementCategory = {
  key: string;
  label: string;
  totalMinor: number;
  rows: SettlementExpenseRow[];
};

export type SettlementTransferView = {
  id: string | null;
  fromMemberId: string;
  toMemberId: string;
  amount: { minor: number; currency: string; scale: number };
  currency: string;
  scale: number;
  legacyPaymentCount: number;
};

export type SettlementExpenseChange = {
  expenseId: string;
  change: "NEW" | "DELETED" | "CHANGED";
};

export type SettlementDisplayMode =
  "CURRENT_ONLY" | "CONFIRMED_ONLY" | "CONFIRMED_WITH_PENDING_UPDATE" | "HISTORY_VERSION";

export type SettlementProjectionFreshness =
  "CURRENT_SERVER" | "CURRENT_LOCAL_PENDING" | "CURRENT_CACHED";

export type SettlementComparison = {
  comparisonId: string;
  mode: SettlementDisplayMode;
  freshness: SettlementProjectionFreshness;
  projectionAsOf: string | null;
  currentDigest: string | null;
  confirmedHeadId: string | null;
  confirmedDigest: string | null;
  usesConfirmedSnapshot: boolean;
};

export function buildSettlementComparison(input: {
  currentDigest: string | null;
  currentFingerprint: string | null;
  currentFreshness: Exclude<SettlementProjectionFreshness, "CURRENT_LOCAL_PENDING">;
  projectionAsOf: string | null;
  confirmed: Stage7Finalized | null;
  hasPendingFinancialOperations: boolean;
  currentMatchesConfirmed?: boolean;
}): SettlementComparison {
  const confirmedDigest = input.confirmed?.inputDigest ?? null;
  const digestDiffers = Boolean(
    input.currentDigest && confirmedDigest && input.currentDigest !== confirmedDigest,
  );
  const hasCurrentChanges =
    input.hasPendingFinancialOperations ||
    input.currentMatchesConfirmed === false ||
    (input.currentMatchesConfirmed === undefined && digestDiffers);
  const mode: SettlementDisplayMode = !input.confirmed
    ? "CURRENT_ONLY"
    : hasCurrentChanges
      ? "CONFIRMED_WITH_PENDING_UPDATE"
      : "CONFIRMED_ONLY";
  const usesConfirmedSnapshot = mode === "CONFIRMED_ONLY";
  const freshness = input.hasPendingFinancialOperations
    ? "CURRENT_LOCAL_PENDING"
    : input.currentFreshness;
  const projectionAsOf = usesConfirmedSnapshot
    ? (input.confirmed?.finalizedAt ?? null)
    : input.projectionAsOf;
  const currentIdentity = input.currentDigest ?? input.currentFingerprint ?? "none";
  const confirmedIdentity = input.confirmed
    ? `${input.confirmed.id}:${input.confirmed.inputDigest}`
    : "none";

  return {
    comparisonId: [
      mode,
      freshness,
      projectionAsOf ?? "none",
      currentIdentity,
      confirmedIdentity,
    ].join(":"),
    mode,
    freshness,
    projectionAsOf,
    currentDigest: input.currentDigest,
    confirmedHeadId: input.confirmed?.id ?? null,
    confirmedDigest,
    usesConfirmedSnapshot,
  };
}

export function personalStatementMatchesFinal(
  statement: PersonalSettlementStatement,
  confirmed: Stage7Finalized,
  memberId: string,
) {
  const balance = personalBalanceFromFinal(confirmed, memberId);
  if (
    statement.currency !== balance.currency ||
    statement.scale !== balance.scale ||
    statement.paidMinor !== balance.paidMinor ||
    statement.shareMinor !== balance.owedMinor ||
    statement.balanceMinor !== balance.netMinor
  )
    return false;

  return personalStatementChangesFromFinal(statement, confirmed, memberId).length === 0;
}

export function personalBalanceFromFinal(confirmed: Stage7Finalized, memberId: string) {
  const paidMinor = confirmed.inputs.reduce(
    (sum, item) => sum + (item.payer.memberId === memberId ? item.settlement.minor : 0),
    0,
  );
  const shareMinor = confirmed.inputs.reduce(
    (sum, item) =>
      sum +
      (item.splits.find((split) => split.member.memberId === memberId)?.settlementMinor ??
        0),
    0,
  );
  return {
    memberId,
    paidMinor,
    owedMinor: shareMinor,
    netMinor: paidMinor - shareMinor,
    currency: confirmed.settlementCurrency,
    scale: confirmed.settlementScale,
  };
}

export function personalStatementChangesFromFinal(
  statement: PersonalSettlementStatement,
  confirmed: Stage7Finalized,
  memberId: string,
) {
  const finalContributions = new Map(
    confirmed.inputs.flatMap((item) => {
      const payerCreditMinor =
        item.payer.memberId === memberId ? item.settlement.minor : 0;
      const share = item.splits.find((split) => split.member.memberId === memberId);
      if (!payerCreditMinor && !share?.settlementMinor) return [];
      return [
        [
          item.expenseId,
          [
            item.expenseId,
            item.expenseRevision,
            item.valuation.id,
            item.payer.memberId,
            item.settlement.minor,
            payerCreditMinor,
            share?.settlementMinor ?? 0,
          ].join(":"),
        ] as const,
      ];
    }),
  );
  const currentContributions = new Map(
    statement.contributions.map((item) => [
      item.expenseId,
      [
        item.expenseId,
        item.sourceRevision,
        item.valuationSnapshotId,
        item.payerMemberId,
        item.expenseSettlementMinor,
        item.payerCreditMinor,
        item.shareMinor,
      ].join(":"),
    ]),
  );
  return [...new Set([...finalContributions.keys(), ...currentContributions.keys()])]
    .sort()
    .flatMap((expenseId) => {
      const before = finalContributions.get(expenseId);
      const after = currentContributions.get(expenseId);
      if (before === after) return [];
      return [
        {
          expenseId,
          change: !before
            ? ("NEW" as const)
            : !after
              ? ("DELETED" as const)
              : ("CHANGED" as const),
        },
      ];
    });
}

export function summarizeSettlementChanges(changes: SettlementExpenseChange[]) {
  return {
    removedCount: changes.filter((item) => item.change === "DELETED").length,
    visible: changes.filter((item) => item.change !== "DELETED").slice(0, 3),
  };
}

export function localExpensesChangesFromFinal(
  expenses: LedgerExpense[],
  confirmed: Stage7Finalized,
) {
  const finalById = new Map(
    confirmed.inputs.map((item) => [item.expenseId, finalInputFingerprint(item)]),
  );
  const currentById = new Map(
    expenses
      .filter(
        (expense) =>
          expense.status !== "DELETED" &&
          expense.status !== "DRAFT" &&
          expense.settlementParticipation === "INCLUDED",
      )
      .map((expense) => [
        expense.serverId ?? expense.id,
        localExpenseFingerprint(expense),
      ]),
  );
  return [...new Set([...finalById.keys(), ...currentById.keys()])]
    .sort()
    .flatMap((expenseId) => {
      const before = finalById.get(expenseId);
      const after = currentById.get(expenseId);
      if (before === after) return [];
      return [
        {
          expenseId,
          change: !before
            ? ("NEW" as const)
            : !after
              ? ("DELETED" as const)
              : ("CHANGED" as const),
        },
      ];
    });
}

function finalInputFingerprint(input: Stage7Finalized["inputs"][number]) {
  return JSON.stringify({
    revision: input.expenseRevision,
    payer: input.payer.memberId,
    original: input.original,
    settlement: input.settlement,
    valuation: input.valuation.id,
    splits: input.splits.map((split) => ({
      memberId: split.member.memberId,
      originalMinor: split.originalMinor,
      settlementMinor: split.settlementMinor,
    })),
  });
}

function localExpenseFingerprint(expense: LedgerExpense) {
  return JSON.stringify({
    revision: expense.revision,
    payer: expense.payerMemberId,
    original: expense.original,
    settlement: expense.valuation?.settlement ?? null,
    valuation: expense.valuation?.id ?? null,
    splits: expense.splits.map((split) => ({
      memberId: split.memberId,
      originalMinor: split.originalMinor,
      settlementMinor: split.settlementMinor,
    })),
  });
}

export function buildSettlementCategories(
  rows: LedgerReportListItem[],
  expenses: LedgerExpense[],
  memberId: string | null,
): SettlementCategory[] {
  const raw = new Map(expenses.map((expense) => [expense.id, expense]));
  const grouped = new Map<string, SettlementCategory>();
  for (const row of rows) {
    if (row.componentMinor === null) continue;
    const category = grouped.get(row.category) ?? {
      key: row.category,
      label: row.category,
      totalMinor: 0,
      rows: [],
    };
    category.totalMinor += row.componentMinor;
    category.rows.push({
      ...row,
      splitMethod:
        raw.get(row.id)?.splits.find((split) => split.memberId === memberId)?.method ??
        raw.get(row.id)?.splits[0]?.method ??
        null,
    });
    grouped.set(row.category, category);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      right.totalMinor - left.totalMinor || left.label.localeCompare(right.label),
  );
}

export function buildFinalizedSettlementCategories(
  inputs: Stage7Finalized["inputs"],
  expenses: LedgerExpense[],
  memberId: string | null,
  kind: "SPENDING" | "SHARES",
) {
  const expensesById = new Map(
    expenses.flatMap((expense) => [
      [expense.id, expense] as const,
      ...(expense.serverId ? ([[expense.serverId, expense]] as const) : []),
    ]),
  );
  const rows = inputs.flatMap<LedgerReportListItem>((input) => {
    const expense = expensesById.get(input.expenseId);
    const split = input.splits.find((item) => item.member.memberId === memberId);
    const componentMinor =
      kind === "SPENDING"
        ? input.payer.memberId === memberId
          ? input.settlement.minor
          : null
        : (split?.settlementMinor ?? null);
    if (componentMinor === null) return [];
    return [
      {
        id: expense?.id ?? input.expenseId,
        title: expense?.title ?? "Expense",
        category: expense?.category ?? "other",
        occurredAt: expense?.occurredAt ?? "",
        payerMemberId: input.payer.memberId,
        payerName: input.payer.displayNameSnapshot,
        originalMinor: input.original.minor,
        originalComponentMinor:
          kind === "SPENDING" ? input.original.minor : (split?.originalMinor ?? null),
        originalCurrency: input.original.currency,
        originalScale: input.original.scale,
        settlementMinor: input.settlement.minor,
        settlementCurrency: input.settlement.currency,
        settlementScale: input.settlement.scale,
        componentMinor,
        participantCount: input.splits.length,
        businessStatus: "ACCEPTED",
        settlementParticipation: "INCLUDED",
        syncStatus: "SYNCED",
        hasReceipt: false,
        hasOpenConflict: false,
        isAuthoritative: true,
      },
    ];
  });
  return buildSettlementCategories(rows, expenses, memberId);
}

export function buildEstimatedSettlementCategories(
  inputs: {
    expense: LedgerExpense;
    settlement: { minor: number; currency: string; scale: number };
    splits: LedgerExpense["splits"];
  }[],
  members: SettlementMember[],
  memberId: string | null,
  kind: "SPENDING" | "SHARES",
) {
  const names = new Map(members.map((member) => [member.id, member.label]));
  const rows = inputs.flatMap<LedgerReportListItem>((input) => {
    const split = input.splits.find((item) => item.memberId === memberId);
    const componentMinor =
      kind === "SPENDING"
        ? input.expense.payerMemberId === memberId
          ? input.settlement.minor
          : null
        : (split?.settlementMinor ?? null);
    if (componentMinor === null) return [];
    return [
      {
        id: input.expense.id,
        title: input.expense.title,
        category: input.expense.category,
        occurredAt: input.expense.occurredAt,
        payerMemberId: input.expense.payerMemberId,
        payerName: names.get(input.expense.payerMemberId) ?? "Traveller",
        originalMinor: input.expense.original.minor,
        originalComponentMinor:
          kind === "SPENDING"
            ? input.expense.original.minor
            : (split?.originalMinor ?? null),
        originalCurrency: input.expense.original.currency,
        originalScale: input.expense.original.scale,
        settlementMinor: input.settlement.minor,
        settlementCurrency: input.settlement.currency,
        settlementScale: input.settlement.scale,
        componentMinor,
        participantCount: input.splits.length,
        businessStatus: input.expense.status,
        settlementParticipation: "INCLUDED",
        syncStatus: input.expense.syncStatus,
        hasReceipt: false,
        hasOpenConflict: false,
        isAuthoritative: input.expense.status === "ACCEPTED",
      },
    ];
  });
  return buildSettlementCategories(
    rows,
    inputs.map((input) => input.expense),
    memberId,
  );
}

export function currentSettlementTransfers(
  finalized: Stage7Finalized | null,
  preview: Stage7Preview | null,
  display?: {
    transfers: {
      fromMemberId: string;
      toMemberId: string;
      amount: { minor: number; currency: string; scale: number };
    }[];
  } | null,
): SettlementTransferView[] {
  if (finalized)
    return finalized.transfers.map((transfer) => ({
      id: transfer.id,
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      amount: transfer.amount,
      currency: finalized.settlementCurrency,
      scale: finalized.settlementScale,
      legacyPaymentCount: transfer.payments.length,
    }));
  const source =
    preview?.state === "PREVIEW_READY" ? preview.transfers : display?.transfers;
  if (!source) return [];
  return source.map((transfer) => ({
    ...transfer,
    id: null,
    currency: transfer.amount.currency,
    scale: transfer.amount.scale,
    legacyPaymentCount: 0,
  }));
}

export function visibleSettlementTransfers<
  T extends { fromMemberId: string; toMemberId: string },
>(transfers: T[], actorMemberId: string | null, everyone: boolean, isOrganizer: boolean) {
  return everyone && isOrganizer
    ? transfers
    : transfers.filter(
        (transfer) =>
          transfer.fromMemberId === actorMemberId ||
          transfer.toMemberId === actorMemberId,
      );
}

export function visiblePersonalPayments(
  records: LocalPersonalPayment[],
  actorMemberId: string | null,
  everyone: boolean,
  isOrganizer: boolean,
) {
  return everyone && isOrganizer
    ? records
    : records.filter(
        (record) =>
          record.ownerMemberId === actorMemberId ||
          record.counterpartyMemberId === actorMemberId,
      );
}

export function memberName(members: SettlementMember[], id: string | null) {
  return members.find((member) => member.id === id)?.label ?? "Traveller";
}

export function settlementCacheMessage(online: boolean, content: "data" | "details") {
  return online
    ? `Settlement refresh unavailable · showing saved ${content}`
    : `Offline · showing cached Settlement ${content}`;
}

export function membersWithActorFirst(
  members: SettlementMember[],
  actorMemberId: string | null,
) {
  return [
    ...members.filter((member) => member.id === actorMemberId),
    ...members.filter((member) => member.id !== actorMemberId),
  ];
}

export function splitLabel(method: SettlementExpenseRow["splitMethod"]) {
  return method?.startsWith("EQUAL") ? "Equal split" : method ? "Custom split" : "Split";
}
