import type {
  ExpenseConflictChainResponse,
  ExpenseConflictChainResolutionRequest,
  LedgerExpenseDto,
} from "@/data/repositories/ledgerExpenseConflictRepository";
import { formatLedgerMoney } from "./format";

export function conflictIntentLines(
  conflict: ExpenseConflictChainResponse["conflicts"][number],
  latest?: LedgerExpenseDto,
  memberNames: Record<string, string> = {},
) {
  const intent = conflict.submittedIntent;
  if (!intent)
    return ["This older change cannot be applied safely. You can use the latest value."];
  if (intent.type === "DELETE")
    return ["Delete this Expense. It will be excluded from current totals."];
  if (intent.type === "RESTORE")
    return [
      `Restore this Expense as ${intent.businessStatus.toLowerCase().replaceAll("_", " ")}.`,
    ];
  if (intent.type === "APPLY_VALUATION")
    return [
      `Use ${intent.valuation.policy.toLowerCase().replaceAll("_", " ")}: ${formatLedgerMoney(intent.valuation.previewSettlement.minor, intent.valuation.previewSettlement.currency, intent.valuation.previewSettlement.scale)}`,
    ];
  if (intent.type === "CREATE") return [intent.expense.title];
  const lines: string[] = [];
  const labels = {
    title: "Title",
    description: "Note",
    category: "Category",
    occurredAt: "Date",
  };
  for (const [key, value] of Object.entries(intent.patch.descriptive ?? {}))
    lines.push(`${labels[key as keyof typeof labels]}: ${value ?? "Remove note"}`);
  const financial = intent.patch.financial;
  if (financial?.original)
    lines.push(
      `Amount: ${formatLedgerMoney(financial.original.minor, financial.original.currency, financial.original.scale)}`,
    );
  if (financial?.economicDate !== undefined)
    lines.push(`Transaction date: ${financial.economicDate ?? "Not provided"}`);
  const participants =
    intent.patch.participantSplit?.participants ?? latest?.participants ?? [];
  if (financial?.payerMemberId)
    lines.push(
      `Payer: ${participants.find((p) => p.memberId === financial.payerMemberId)?.displayNameSnapshot ?? memberNames[financial.payerMemberId] ?? "Journey member"}`,
    );
  if (financial?.settlementParticipation)
    lines.push(
      `Group totals: ${financial.settlementParticipation === "INCLUDED" ? "Include" : "Exclude"}`,
    );
  for (const participant of intent.patch.participantSplit?.participants ?? [])
    lines.push(`Participant: ${participant.displayNameSnapshot}`);
  const money = financial?.original ?? latest?.original;
  for (const split of intent.patch.participantSplit?.splits ?? [])
    lines.push(
      `${participants.find((p) => p.memberId === split.memberId)?.displayNameSnapshot ?? memberNames[split.memberId] ?? "Participant"}'s share: ${money ? formatLedgerMoney(split.originalMinor, money.currency, money.scale) : "Changed"} (${split.method.toLowerCase().replaceAll("_", " ")}${split.percentageUnits === null ? "" : ` · ${split.percentageUnits / 10_000}%`}${split.weightUnits === null ? "" : ` · ${split.weightUnits} shares`})`,
    );
  return lines.length
    ? lines
    : ["These changes may already be reflected in the latest value."];
}
export function conflictChoices(
  conflict: ExpenseConflictChainResponse["conflicts"][number],
  latest?: LedgerExpenseDto,
) {
  const choices: {
    choice: ExpenseConflictChainResolutionRequest["choice"];
    label: string;
  }[] = [{ choice: "KEEP_SERVER", label: "Use latest value" }];
  const intent = conflict.submittedIntent;
  if (!intent) return conflict.commandType === "UPDATE" ? choices : [];
  if (latest?.businessStatus === "DELETED" && intent.type !== "RESTORE") return choices;
  if (intent.type === "DELETE")
    choices.push({ choice: "CONFIRM_DELETE", label: "Continue deletion" });
  if (intent.type === "RESTORE")
    choices.push({ choice: "CONFIRM_RESTORE", label: "Restore Expense" });
  if (intent.type === "APPLY_VALUATION")
    choices.push({ choice: "APPLY_VALUATION", label: "Use my value" });
  if (intent.type === "UPDATE" && conflict.reason === "VERIFIED_LEGACY_EQUIVALENT")
    return [{ choice: "ACCEPT_EQUIVALENT" as const, label: "Use latest value" }];
  if (intent.type === "UPDATE") {
    choices.push({ choice: "APPLY_PATCH", label: "Use my changes" });
    choices.push({ choice: "ACCEPT_EQUIVALENT", label: "These values match" });
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
    `Status: ${expense.businessStatus.toLowerCase().replaceAll("_", " ")}`,
    `Category: ${expense.category}`,
    `Payer: ${expense.participants.find((p) => p.memberId === expense.payerMemberId)?.displayNameSnapshot ?? memberNames[expense.payerMemberId] ?? "Journey member"}`,
    `Group totals: ${expense.settlementParticipation === "INCLUDED" ? "Included" : "Excluded"}`,
    `Transaction date: ${expense.economicDate ?? "Not provided"}`,
    ...(expense.description ? [expense.description] : []),
    ...(expense.valuation
      ? [
          `Group value: ${formatLedgerMoney(expense.valuation.settlement.minor, expense.valuation.settlement.currency, expense.valuation.settlement.scale)}`,
        ]
      : ["Group value is being updated"]),
    ...expense.participants.map((p) => `Participant: ${p.displayNameSnapshot}`),
    ...expense.splits.map(
      (split) =>
        `${expense.participants.find((p) => p.memberId === split.memberId)?.displayNameSnapshot ?? memberNames[split.memberId] ?? "Participant"}'s share: ${formatLedgerMoney(split.originalMinor, expense.original.currency, expense.original.scale)} (${split.method.toLowerCase().replaceAll("_", " ")}${split.percentageUnits === null ? "" : ` · ${split.percentageUnits / 10_000}%`}${split.weightUnits === null ? "" : ` · ${split.weightUnits} shares`})`,
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
  if (result.responseJson) return "Your decision is saved.";
  if (result.errorCode === "TRIP_WRITE_FORBIDDEN")
    return "Only the creator or Journey organizer can make this decision.";
  if (result.errorCode === "SETTLEMENT_INPUT_STALE")
    return "This Expense is part of a confirmed Settlement. Review a correction with the organizer.";
  if (result.status === "CONFLICT")
    return "This Expense changed while you were reviewing it. Check the latest value before choosing again.";
  if (result.status === "FAILED")
    return "This decision could not be applied. Your saved changes remain available.";
  if (result.status === "RETRYABLE")
    return "Your decision is saved here. It will finish when a connection is available.";
  return "Your decision is saved here. Finishing this change…";
}
