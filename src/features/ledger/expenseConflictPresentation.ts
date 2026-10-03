import { splitMethodLabel } from "./expenseEntryPresentation";
import { t } from "@/ui/locale";
import { categoryLabel, domainLabel } from "@/ui/domainLabels";
import type {
  ExpenseConflictChainResponse,
  ExpenseConflictChainResolutionRequest,
  LedgerExpenseDto,
} from "@/data/repositories/ledgerExpenseConflictRepository";
import { formatLedgerDate, formatLedgerMoney, formatValuationPolicy } from "./format";

export function conflictIntentLines(
  conflict: ExpenseConflictChainResponse["conflicts"][number],
  latest?: LedgerExpenseDto,
  memberNames: Record<string, string> = {},
) {
  const intent = conflict.submittedIntent;
  if (!intent) return [t("ledgerMigration.copy55")];
  if (intent.type === "DELETE") return [t("ledgerMigration.copy56")];
  if (intent.type === "RESTORE")
    return [t("conflict.restoreStatus", { status: domainLabel(intent.businessStatus) })];
  if (intent.type === "APPLY_VALUATION")
    return [
      t("conflict.useValuation", {
        policy: formatValuationPolicy(intent.valuation.policy),
        amount: formatLedgerMoney(
          intent.valuation.previewSettlement.minor,
          intent.valuation.previewSettlement.currency,
          intent.valuation.previewSettlement.scale,
        ),
      }),
    ];
  if (intent.type === "CREATE") return [intent.expense.title];
  const lines: string[] = [];
  const labels = {
    title: t("domain.label10"),
    description: t("ui.note"),
    category: t("ui.category"),
    occurredAt: t("ui.date"),
  };
  for (const [key, value] of Object.entries(intent.patch.descriptive ?? {}))
    lines.push(
      t("conflict.field", {
        label: labels[key as keyof typeof labels],
        value:
          value === null
            ? t("ledgerMigration.copy57")
            : key === "category"
              ? categoryLabel(String(value))
              : key === "occurredAt"
                ? formatLedgerDate(String(value))
                : value,
      }),
    );
  const financial = intent.patch.financial;
  if (financial?.original)
    lines.push(
      t("conflict.field", {
        label: t("ui.amount"),
        value: formatLedgerMoney(
          financial.original.minor,
          financial.original.currency,
          financial.original.scale,
        ),
      }),
    );
  if (financial?.economicDate !== undefined)
    lines.push(
      t("conflict.field", {
        label: t("ui.transactionDate"),
        value: financial.economicDate
          ? formatLedgerDate(financial.economicDate)
          : t("ledgerMigration.copy58"),
      }),
    );
  const participants =
    intent.patch.participantSplit?.participants ?? latest?.participants ?? [];
  if (financial?.payerMemberId)
    lines.push(
      t("conflict.field", {
        label: t("conflict.payer"),
        value:
          participants.find((p) => p.memberId === financial.payerMemberId)
            ?.displayNameSnapshot ??
          memberNames[financial.payerMemberId] ??
          t("ledgerMigration.copy59"),
      }),
    );
  if (financial?.settlementParticipation)
    lines.push(
      t("conflict.field", {
        label: t("conflict.groupTotals"),
        value:
          financial.settlementParticipation === "INCLUDED"
            ? t("ui.include")
            : t("ui.exclude"),
      }),
    );
  for (const participant of intent.patch.participantSplit?.participants ?? [])
    lines.push(
      t("conflict.field", {
        label: t("search.participant"),
        value: participant.displayNameSnapshot,
      }),
    );
  const money = financial?.original ?? latest?.original;
  for (const split of intent.patch.participantSplit?.splits ?? [])
    lines.push(
      splitLine(
        participants.find((p) => p.memberId === split.memberId)?.displayNameSnapshot ??
          memberNames[split.memberId] ??
          t("search.participant"),
        money
          ? formatLedgerMoney(split.originalMinor, money.currency, money.scale)
          : t("reviewFlow.copy58"),
        split,
      ),
    );
  return lines.length ? lines : [t("ledgerMigration.copy60")];
}
export function conflictChoices(
  conflict: ExpenseConflictChainResponse["conflicts"][number],
  latest?: LedgerExpenseDto,
) {
  const choices: {
    choice: ExpenseConflictChainResolutionRequest["choice"];
    label: string;
  }[] = [{ choice: "KEEP_SERVER", label: t("ledgerMigration.copy61") }];
  const intent = conflict.submittedIntent;
  if (!intent) return conflict.commandType === "UPDATE" ? choices : [];
  if (latest?.businessStatus === "DELETED" && intent.type !== "RESTORE") return choices;
  if (intent.type === "DELETE")
    choices.push({ choice: "CONFIRM_DELETE", label: t("ledgerMigration.copy62") });
  if (intent.type === "RESTORE")
    choices.push({ choice: "CONFIRM_RESTORE", label: t("ledgerMigration.copy63") });
  if (intent.type === "APPLY_VALUATION")
    choices.push({ choice: "APPLY_VALUATION", label: t("ledgerMigration.copy64") });
  if (intent.type === "UPDATE" && conflict.reason === "VERIFIED_LEGACY_EQUIVALENT")
    return [{ choice: "ACCEPT_EQUIVALENT" as const, label: t("ledgerMigration.copy61") }];
  if (intent.type === "UPDATE") {
    choices.push({ choice: "APPLY_PATCH", label: t("ledgerMigration.copy65") });
    choices.push({ choice: "ACCEPT_EQUIVALENT", label: t("ledgerMigration.copy66") });
  }
  return choices;
}
export function canonicalConflictLines(
  expense: LedgerExpenseDto,
  memberNames: Record<string, string> = {},
) {
  return [
    expense.title,
    formatLedgerMoney(
      expense.original.minor,
      expense.original.currency,
      expense.original.scale,
    ),
    t("conflict.field", {
      label: t("conflict.status"),
      value: domainLabel(expense.businessStatus),
    }),
    t("conflict.field", {
      label: t("ui.category"),
      value: categoryLabel(expense.category),
    }),
    t("conflict.field", {
      label: t("conflict.payer"),
      value:
        expense.participants.find((p) => p.memberId === expense.payerMemberId)
          ?.displayNameSnapshot ??
        memberNames[expense.payerMemberId] ??
        t("ledgerMigration.copy59"),
    }),
    t("conflict.field", {
      label: t("conflict.groupTotals"),
      value:
        expense.settlementParticipation === "INCLUDED"
          ? t("ledgerMigration.copy67")
          : t("ledgerMigration.copy68"),
    }),
    t("conflict.field", {
      label: t("ui.transactionDate"),
      value: expense.economicDate
        ? formatLedgerDate(expense.economicDate)
        : t("ledgerMigration.copy58"),
    }),
    ...(expense.description ? [expense.description] : []),
    ...(expense.valuation
      ? [
          t("conflict.field", {
            label: t("conflict.groupValue"),
            value: formatLedgerMoney(
              expense.valuation.settlement.minor,
              expense.valuation.settlement.currency,
              expense.valuation.settlement.scale,
            ),
          }),
        ]
      : [t("ledgerMigration.copy69")]),
    ...expense.participants.map((p) =>
      t("conflict.field", {
        label: t("search.participant"),
        value: p.displayNameSnapshot,
      }),
    ),
    ...expense.splits.map((split) =>
      splitLine(
        expense.participants.find((p) => p.memberId === split.memberId)
          ?.displayNameSnapshot ??
          memberNames[split.memberId] ??
          t("search.participant"),
        formatLedgerMoney(
          split.originalMinor,
          expense.original.currency,
          expense.original.scale,
        ),
        split,
      ),
    ),
  ];
}
export function resolutionStatus(
  result: {
    status: string;
    responseJson: string | null;
    errorCode: string | null;
  } | null,
) {
  if (!result) return null;
  if (result.responseJson) return t("ledgerMigration.copy70");
  if (result.errorCode === "TRIP_WRITE_FORBIDDEN") return t("ledgerMigration.copy71");
  if (result.errorCode === "SETTLEMENT_INPUT_STALE") return t("ledgerMigration.copy72");
  if (result.status === "CONFLICT") return t("ledgerMigration.copy73");
  if (result.status === "FAILED") return t("ledgerMigration.copy74");
  if (result.status === "RETRYABLE") return t("ledgerMigration.copy75");
  return t("ledgerMigration.copy76");
}

// Display-only composition: preserve exact amounts, names and saved split facts.
function splitLine(
  name: string,
  amount: string,
  split: Pick<
    LedgerExpenseDto["splits"][number],
    "method" | "percentageUnits" | "weightUnits"
  >,
) {
  return t("conflict.share", {
    name,
    amount,
    method: splitMethodLabel(split.method),
    percentage:
      split.percentageUnits === null
        ? ""
        : t("conflict.splitPercentage", { value: split.percentageUnits / 10_000 }),
    weight:
      split.weightUnits === null
        ? ""
        : t("conflict.splitWeight", { value: split.weightUnits }),
  });
}
