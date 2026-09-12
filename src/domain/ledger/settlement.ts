import { assertMoney } from "./money";
import type {
  ExpenseAggregate,
  ExpenseBusinessStatus,
  MemberBalance,
  Money,
  SettlementValuationSnapshot,
  SettlementTransferPlan,
} from "./types";

export const SETTLEMENT_ALGORITHM_VERSION = "ledger-settlement-greedy-v1";

export type SettlementMemberSnapshot = {
  memberId: string;
  displayNameSnapshot: string;
};

export type SettlementExpenseCandidate = {
  id: string;
  revision: number;
  occurredAt: string;
  businessStatus: ExpenseBusinessStatus;
  hasOpenConflict: boolean;
  payerMemberId: string;
  original: Money;
  participants: {
    memberId: string;
    displayNameSnapshot: string;
  }[];
  splits: ExpenseAggregate["splits"];
  valuation: SettlementValuationSnapshot | null;
};

export type SettlementInputSnapshot = {
  expenseId: string;
  expenseRevision: number;
  payer: SettlementMemberSnapshot;
  original: Money;
  settlement: Money;
  valuation: {
    id: string;
    policy: SettlementValuationSnapshot["policy"];
    rateSnapshotId: string | null;
    paymentRecordId: string | null;
    decimalRate: string | null;
    roundingMode: "HALF_UP";
  };
  splits: {
    member: SettlementMemberSnapshot;
    originalMinor: number;
    settlementMinor: number;
    roundingAdjustmentMinor: number;
  }[];
};

export type SettlementMemberBalanceSnapshot = {
  memberId: string;
  currency: string;
  scale: number;
  displayNameSnapshot: string;
  paidMinor: number;
  owedMinor: number;
  transferredMinor: 0;
  netMinor: number;
};

export type SettlementPreview = {
  state: "PREVIEW_BLOCKED" | "PREVIEW_READY";
  journeyId: string;
  throughTimestamp: string;
  settlementCurrency: string;
  settlementScale: number;
  settingsRevision: number;
  algorithmVersion: typeof SETTLEMENT_ALGORITHM_VERSION;
  members: SettlementMemberSnapshot[];
  inputs: SettlementInputSnapshot[];
  blockers: {
    expenseId: string;
    reason: "OPEN_CONFLICT" | "RATE_REQUIRED";
  }[];
  exclusions: { expenseId: string; reason: "DELETED" | "DRAFT" }[];
  balances: SettlementMemberBalanceSnapshot[];
  transfers: SettlementTransferPlan[];
};

export type SettlementPreviewInput = {
  journeyId: string;
  throughTimestamp: string;
  settlementCurrency: string;
  settlementScale: number;
  settingsRevision: number;
  members: SettlementMemberSnapshot[];
  expenses: SettlementExpenseCandidate[];
};

function stableIdCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Settlement total is unsafe.");
  return result;
}

export function calculateMemberBalances(
  expenses: ExpenseAggregate[],
  memberIds: string[],
  currency: string,
  scale: number,
): MemberBalance[] {
  const values = new Map(memberIds.map((memberId) => [memberId, 0]));
  for (const expense of expenses) {
    if (expense.status !== "ACCEPTED" || !expense.valuation) continue;
    const settlement = expense.valuation.settlement;
    assertMoney(settlement, "Settlement valuation");
    if (settlement.currency !== currency || settlement.scale !== scale) {
      throw new Error("Expense settlement currency does not match Journey.");
    }
    if (!values.has(expense.payerMemberId))
      throw new Error("Payer is not in settlement.");
    values.set(
      expense.payerMemberId,
      safeAdd(values.get(expense.payerMemberId)!, settlement.minor),
    );
    for (const split of expense.splits) {
      if (!values.has(split.memberId))
        throw new Error("Participant is not in settlement.");
      if (split.settlementMinor === null)
        throw new Error("Settlement split is unresolved.");
      values.set(
        split.memberId,
        safeAdd(values.get(split.memberId)!, -split.settlementMinor),
      );
    }
  }
  const balances = memberIds.map((memberId) => ({
    memberId,
    minor: values.get(memberId) ?? 0,
    currency,
    scale,
  }));
  if (balances.reduce((sum, balance) => sum + balance.minor, 0) !== 0) {
    throw new Error("Settlement balances do not net to zero.");
  }
  return balances;
}

export function buildTransferPlan(balances: MemberBalance[]): SettlementTransferPlan[] {
  if (balances.length === 0) return [];
  const currency = balances[0].currency;
  const scale = balances[0].scale;
  if (
    balances.some((balance) => balance.currency !== currency || balance.scale !== scale)
  ) {
    throw new Error("All balances must use one settlement currency.");
  }
  if (balances.reduce((sum, balance) => sum + balance.minor, 0) !== 0) {
    throw new Error("Settlement balances do not net to zero.");
  }
  const debtors = balances
    .filter((balance) => balance.minor < 0)
    .map((balance) => ({ memberId: balance.memberId, minor: -balance.minor }))
    .sort((a, b) => b.minor - a.minor || stableIdCompare(a.memberId, b.memberId));
  const creditors = balances
    .filter((balance) => balance.minor > 0)
    .map((balance) => ({ memberId: balance.memberId, minor: balance.minor }))
    .sort((a, b) => b.minor - a.minor || stableIdCompare(a.memberId, b.memberId));
  const transfers: SettlementTransferPlan[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const minor = Math.min(debtor.minor, creditor.minor);
    const amount: Money = { minor, currency, scale };
    transfers.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amount,
    });
    debtor.minor -= minor;
    creditor.minor -= minor;
    if (debtor.minor === 0) debtorIndex += 1;
    if (creditor.minor === 0) creditorIndex += 1;
  }
  return transfers;
}

export function buildSettlementPreview(input: SettlementPreviewInput): SettlementPreview {
  if (!Number.isInteger(input.settingsRevision) || input.settingsRevision < 1)
    throw new Error("Settlement settings revision is invalid.");
  if (!Number.isFinite(Date.parse(input.throughTimestamp)))
    throw new Error("Settlement cutoff is invalid.");

  const members = [...input.members].sort((a, b) =>
    stableIdCompare(a.memberId, b.memberId),
  );
  const memberNames = new Map(
    members.map((member) => [member.memberId, member.displayNameSnapshot]),
  );
  if (memberNames.size !== members.length) throw new Error("Settlement members repeat.");

  const blockers: SettlementPreview["blockers"] = [];
  const exclusions: SettlementPreview["exclusions"] = [];
  const inputs: SettlementInputSnapshot[] = [];
  const aggregates: ExpenseAggregate[] = [];

  for (const expense of [...input.expenses].sort((a, b) => stableIdCompare(a.id, b.id))) {
    if (expense.occurredAt > input.throughTimestamp) continue;
    if (expense.businessStatus === "DELETED") {
      exclusions.push({ expenseId: expense.id, reason: "DELETED" });
      continue;
    }
    if (expense.businessStatus === "DRAFT") {
      exclusions.push({ expenseId: expense.id, reason: "DRAFT" });
      continue;
    }
    if (expense.hasOpenConflict)
      blockers.push({ expenseId: expense.id, reason: "OPEN_CONFLICT" });
    if (expense.businessStatus === "RATE_REQUIRED" || !expense.valuation)
      blockers.push({ expenseId: expense.id, reason: "RATE_REQUIRED" });
    if (expense.hasOpenConflict || !expense.valuation) continue;

    const valuation = expense.valuation;
    assertMoney(expense.original, "Settlement input original");
    assertMoney(valuation.settlement, "Settlement input valuation");
    if (
      valuation.settlement.currency !== input.settlementCurrency ||
      valuation.settlement.scale !== input.settlementScale
    ) {
      throw new Error("Expense settlement currency does not match Journey.");
    }
    const payerName = memberNames.get(expense.payerMemberId);
    if (!payerName) throw new Error("Settlement payer is not a Journey member.");

    const participantNames = new Map(
      expense.participants.map((participant) => [
        participant.memberId,
        participant.displayNameSnapshot,
      ]),
    );
    const splits = [...expense.splits]
      .sort((a, b) => stableIdCompare(a.memberId, b.memberId))
      .map((split) => {
        const name =
          participantNames.get(split.memberId) ?? memberNames.get(split.memberId);
        if (!name) throw new Error("Settlement participant is not a Journey member.");
        if (split.settlementMinor === null)
          throw new Error("Settlement split is unresolved.");
        return {
          member: { memberId: split.memberId, displayNameSnapshot: name },
          originalMinor: split.originalMinor,
          settlementMinor: split.settlementMinor,
          roundingAdjustmentMinor: split.roundingAdjustmentMinor,
        };
      });
    if (
      splits.reduce((sum, split) => safeAdd(sum, split.settlementMinor), 0) !==
      valuation.settlement.minor
    ) {
      throw new Error("Settlement input splits do not reconcile.");
    }

    inputs.push({
      expenseId: expense.id,
      expenseRevision: expense.revision,
      payer: {
        memberId: expense.payerMemberId,
        displayNameSnapshot: payerName,
      },
      original: { ...expense.original },
      settlement: { ...valuation.settlement },
      valuation: {
        id: valuation.id,
        policy: valuation.policy,
        rateSnapshotId: valuation.rateSnapshotId,
        paymentRecordId: valuation.paymentRecordId,
        decimalRate: valuation.decimalRate ?? null,
        roundingMode: valuation.roundingMode ?? "HALF_UP",
      },
      splits,
    });
    aggregates.push({
      id: expense.id,
      journeyId: input.journeyId,
      revision: expense.revision,
      title: "",
      category: "",
      payerMemberId: expense.payerMemberId,
      original: { ...expense.original },
      participants: expense.participants.map((participant) => ({
        ...participant,
        householdIdSnapshot: null,
      })),
      splits: expense.splits.map((split) => ({ ...split })),
      valuation: {
        ...valuation,
        original: { ...valuation.original },
        settlement: { ...valuation.settlement },
      },
      paymentRecords: [],
      status: "ACCEPTED",
    });
  }

  const memberBalances = calculateMemberBalances(
    aggregates,
    members.map((member) => member.memberId),
    input.settlementCurrency,
    input.settlementScale,
  );
  const paid = new Map(members.map((member) => [member.memberId, 0]));
  const owed = new Map(members.map((member) => [member.memberId, 0]));
  for (const settlementInput of inputs) {
    paid.set(
      settlementInput.payer.memberId,
      safeAdd(
        paid.get(settlementInput.payer.memberId)!,
        settlementInput.settlement.minor,
      ),
    );
    for (const split of settlementInput.splits) {
      owed.set(
        split.member.memberId,
        safeAdd(owed.get(split.member.memberId)!, split.settlementMinor),
      );
    }
  }
  const balances = memberBalances.map((balance) => ({
    memberId: balance.memberId,
    currency: balance.currency,
    scale: balance.scale,
    displayNameSnapshot: memberNames.get(balance.memberId)!,
    paidMinor: paid.get(balance.memberId)!,
    owedMinor: owed.get(balance.memberId)!,
    transferredMinor: 0 as const,
    netMinor: balance.minor,
  }));
  return {
    state: blockers.length ? "PREVIEW_BLOCKED" : "PREVIEW_READY",
    journeyId: input.journeyId,
    throughTimestamp: input.throughTimestamp,
    settlementCurrency: input.settlementCurrency,
    settlementScale: input.settlementScale,
    settingsRevision: input.settingsRevision,
    algorithmVersion: SETTLEMENT_ALGORITHM_VERSION,
    members,
    inputs,
    blockers,
    exclusions,
    balances,
    transfers: buildTransferPlan(memberBalances),
  };
}

export function canonicalSettlementJson(preview: SettlementPreview) {
  return JSON.stringify(sortJson(preview));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => stableIdCompare(left, right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}
