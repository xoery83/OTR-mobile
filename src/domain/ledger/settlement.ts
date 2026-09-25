import { assertMoney } from "./money";
import type {
  ExpenseAggregate,
  ExpenseBusinessStatus,
  ExpenseSettlementParticipation,
  MemberBalance,
  Money,
  SettlementValuationSnapshot,
  SettlementTransferPlan,
} from "./types";

export const SETTLEMENT_ALGORITHM_VERSION = "ledger-settlement-greedy-v1";
export const SETTLEMENT_SOURCE_FINGERPRINT_POLICY = "SETTLEMENT_SOURCE_V1";

export type SettlementMemberSnapshot = {
  memberId: string;
  displayNameSnapshot: string;
};

export type SettlementExpenseCandidate = {
  id: string;
  revision: number;
  occurredAt: string;
  businessStatus: ExpenseBusinessStatus;
  settlementParticipation: ExpenseSettlementParticipation;
  hasOpenConflict: boolean;
  payerMemberId: string;
  original: Money;
  participants: {
    memberId: string;
    displayNameSnapshot: string;
  }[];
  splits: ExpenseAggregate["splits"];
  valuation:
    | (Omit<SettlementValuationSnapshot, "effectiveAt"> & {
        effectiveAt?: string | null;
      })
    | null;
};

export type SettlementInputSnapshot = {
  expenseId: string;
  expenseRevision: number;
  settlementParticipation: "INCLUDED";
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
  exclusions: {
    expenseId: string;
    reason: "DELETED" | "DRAFT" | "EXCLUDED_FROM_SETTLEMENT";
  }[];
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

export function replaceSettlementExpenseSource(
  input: SettlementPreviewInput,
  sourceExpenseId: string,
  successor: SettlementExpenseCandidate,
): SettlementPreviewInput {
  if (successor.id === sourceExpenseId)
    throw new Error("Correction successor must have a new identity.");
  if (!input.expenses.some((expense) => expense.id === sourceExpenseId))
    throw new Error("Correction source is stale.");
  if (input.expenses.some((expense) => expense.id === successor.id))
    throw new Error("Correction successor already exists.");
  return {
    ...input,
    expenses: input.expenses
      .filter((expense) => expense.id !== sourceExpenseId)
      .concat(successor)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export type SettlementAdjustmentDelta = {
  memberId: string;
  displayNameSnapshot: string;
  currency: string;
  scale: number;
  sealedMinor: number;
  currentMinor: number;
  deltaMinor: number;
};

export type SettlementAdjustmentVectorsInput = {
  currency: string;
  scale: number;
  rootBalances: Pick<
    SettlementMemberBalanceSnapshot,
    "memberId" | "displayNameSnapshot" | "netMinor"
  >[];
  priorDeltaVectors: {
    memberId: string;
    displayNameSnapshot: string;
    deltaMinor: number;
  }[][];
  currentBalances: Pick<
    SettlementMemberBalanceSnapshot,
    "memberId" | "displayNameSnapshot" | "netMinor"
  >[];
};

export type ConfirmedDischargeVectorInput = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
};

function stableIdCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Settlement total is unsafe.");
  return result;
}

export function balancesFromSettlementInputs(
  inputs: SettlementInputSnapshot[],
  members: SettlementMemberSnapshot[],
  currency: string,
  scale: number,
): SettlementMemberBalanceSnapshot[] {
  const names = new Map(
    members.map(({ memberId, displayNameSnapshot }) => [memberId, displayNameSnapshot]),
  );
  for (const input of inputs) {
    names.set(
      input.payer.memberId,
      names.get(input.payer.memberId) ?? input.payer.displayNameSnapshot,
    );
    for (const split of input.splits)
      names.set(
        split.member.memberId,
        names.get(split.member.memberId) ?? split.member.displayNameSnapshot,
      );
  }
  const paid = new Map([...names.keys()].map((id) => [id, 0]));
  const owed = new Map([...names.keys()].map((id) => [id, 0]));
  for (const input of inputs) {
    assertMoney(input.settlement, "Settlement input value");
    if (input.settlement.currency !== currency || input.settlement.scale !== scale)
      throw new Error("Settlement input currency does not match Journey.");
    paid.set(
      input.payer.memberId,
      safeAdd(paid.get(input.payer.memberId)!, input.settlement.minor),
    );
    for (const split of input.splits)
      owed.set(
        split.member.memberId,
        safeAdd(owed.get(split.member.memberId)!, split.settlementMinor),
      );
  }
  return [...names.entries()]
    .sort(([a], [b]) => stableIdCompare(a, b))
    .map(([memberId, displayNameSnapshot]) => ({
      memberId,
      displayNameSnapshot,
      currency,
      scale,
      paidMinor: paid.get(memberId)!,
      owedMinor: owed.get(memberId)!,
      transferredMinor: 0 as const,
      netMinor: safeAdd(paid.get(memberId)!, -owed.get(memberId)!),
    }));
}

export function calculateMemberBalances(
  expenses: ExpenseAggregate[],
  memberIds: string[],
  currency: string,
  scale: number,
): MemberBalance[] {
  const values = new Map(memberIds.map((memberId) => [memberId, 0]));
  for (const expense of expenses) {
    if (
      expense.status !== "ACCEPTED" ||
      expense.settlementParticipation !== "INCLUDED" ||
      !expense.valuation
    )
      continue;
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
    if (expense.settlementParticipation === "EXCLUDED") {
      exclusions.push({
        expenseId: expense.id,
        reason: "EXCLUDED_FROM_SETTLEMENT",
      });
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
      settlementParticipation: "INCLUDED",
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
        effectiveAt: valuation.effectiveAt ?? undefined,
        original: { ...valuation.original },
        settlement: { ...valuation.settlement },
      },
      paymentRecords: [],
      status: "ACCEPTED",
      settlementParticipation: "INCLUDED",
    });
  }

  const memberBalances = calculateMemberBalances(
    aggregates,
    members.map((member) => member.memberId),
    input.settlementCurrency,
    input.settlementScale,
  );
  const balances = balancesFromSettlementInputs(
    inputs,
    members,
    input.settlementCurrency,
    input.settlementScale,
  );
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

export function canonicalSettlementSourceJson(source: SettlementPreviewInput) {
  return JSON.stringify(
    source.expenses
      .filter(
        (expense) =>
          expense.occurredAt <= source.throughTimestamp &&
          expense.businessStatus === "ACCEPTED" &&
          expense.settlementParticipation === "INCLUDED" &&
          !expense.hasOpenConflict &&
          expense.valuation,
      )
      .sort((left, right) => stableIdCompare(left.id, right.id))
      .map((expense) => ({
        id: expense.id,
        revision: Number(expense.revision),
        occurredAt: new Date(expense.occurredAt).toISOString(),
        businessStatus: expense.businessStatus,
        settlementParticipation: expense.settlementParticipation,
        payerMemberId: expense.payerMemberId,
        original: {
          minor: Number(expense.original.minor),
          currency: expense.original.currency,
          scale: Number(expense.original.scale),
        },
        valuation: expense.valuation
          ? {
              id: expense.valuation.id,
              policy: expense.valuation.policy,
              original: {
                minor: Number(expense.valuation.original.minor),
                currency: expense.valuation.original.currency,
                scale: Number(expense.valuation.original.scale),
              },
              settlement: {
                minor: Number(expense.valuation.settlement.minor),
                currency: expense.valuation.settlement.currency,
                scale: Number(expense.valuation.settlement.scale),
              },
              rateSnapshotId: expense.valuation.rateSnapshotId,
              paymentRecordId: expense.valuation.paymentRecordId,
              reason: expense.valuation.reason,
              decimalRate: expense.valuation.decimalRate ?? null,
              roundingMode: expense.valuation.roundingMode ?? null,
              effectiveAt: expense.valuation.effectiveAt
                ? new Date(expense.valuation.effectiveAt).toISOString()
                : null,
              supersedesValuationId: expense.valuation.supersedesValuationId ?? null,
            }
          : null,
        participants: [...expense.participants]
          .sort((left, right) => stableIdCompare(left.memberId, right.memberId))
          .map((participant) => ({
            memberId: participant.memberId,
            displayNameSnapshot: participant.displayNameSnapshot,
          })),
        splits: [...expense.splits]
          .sort((left, right) => stableIdCompare(left.memberId, right.memberId))
          .map((split) => ({
            memberId: split.memberId,
            method: split.method,
            originalMinor: Number(split.originalMinor),
            settlementMinor:
              split.settlementMinor === null ? null : Number(split.settlementMinor),
            weightUnits: split.weightUnits === null ? null : Number(split.weightUnits),
            percentageUnits:
              split.percentageUnits === null ? null : Number(split.percentageUnits),
            roundingAdjustmentMinor: Number(split.roundingAdjustmentMinor),
          })),
      })),
  );
}

export function canonicalSettlementInputsJson(inputs: SettlementInputSnapshot[]) {
  return JSON.stringify(
    sortJson(
      [...inputs]
        .sort((left, right) => stableIdCompare(left.expenseId, right.expenseId))
        .map(({ expenseRevision: _revision, ...input }) => ({
          ...input,
          valuation: { ...input.valuation, id: undefined },
          payer: { memberId: input.payer.memberId },
          splits: input.splits.map((split) => ({
            ...split,
            member: { memberId: split.member.memberId },
          })),
        })),
    ),
  );
}

export function buildSettlementConfirmationDiff(
  confirmed: SettlementInputSnapshot[],
  current: SettlementInputSnapshot[],
) {
  const previousById = new Map(
    confirmed.map((item) => [item.expenseId, canonicalSettlementInputsJson([item])]),
  );
  const currentById = new Map(
    current.map((item) => [item.expenseId, canonicalSettlementInputsJson([item])]),
  );
  return [...new Set([...previousById.keys(), ...currentById.keys()])]
    .sort(stableIdCompare)
    .flatMap<{ expenseId: string; change: "ADDED" | "CHANGED" | "REMOVED" }>(
      (expenseId) => {
        const before = previousById.get(expenseId);
        const after = currentById.get(expenseId);
        if (before === after) return [];
        return [
          {
            expenseId,
            change: !before ? "ADDED" : !after ? "REMOVED" : "CHANGED",
          },
        ];
      },
    );
}

export function canonicalAdjustmentInputJson(input: {
  rootSettlementId: string;
  journeyId: string;
  throughTimestamp: string;
  settlementCurrency: string;
  settlementScale: number;
  eligibilityVersion: string;
  algorithmVersion: string;
  inputs: SettlementInputSnapshot[];
}) {
  return JSON.stringify(
    sortJson({
      rootSettlementId: input.rootSettlementId,
      journeyId: input.journeyId,
      throughTimestamp: input.throughTimestamp,
      settlementCurrency: input.settlementCurrency,
      settlementScale: input.settlementScale,
      eligibilityVersion: input.eligibilityVersion,
      algorithmVersion: input.algorithmVersion,
      inputs: input.inputs.map(({ expenseRevision: _revision, ...expense }) => {
        const { id: _valuationId, ...valuation } = expense.valuation;
        return {
          ...expense,
          valuation,
          payer: { memberId: expense.payer.memberId },
          splits: expense.splits.map((split) => ({
            ...split,
            member: { memberId: split.member.memberId },
          })),
        };
      }),
    }),
  );
}

export function buildSettlementAdjustmentVectors(
  input: SettlementAdjustmentVectorsInput,
) {
  const names = new Map<string, string>();
  const root = new Map<string, number>();
  const current = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const balance of input.rootBalances) {
    names.set(balance.memberId, balance.displayNameSnapshot);
    root.set(balance.memberId, balance.netMinor);
  }
  for (const vector of input.priorDeltaVectors) {
    assertZeroSum(
      vector.map(({ memberId, deltaMinor }) => ({ memberId, minor: deltaMinor })),
      "Adjustment delta",
    );
    for (const delta of vector) {
      names.set(delta.memberId, delta.displayNameSnapshot);
      prior.set(
        delta.memberId,
        safeAdd(prior.get(delta.memberId) ?? 0, delta.deltaMinor),
      );
    }
  }
  for (const balance of input.currentBalances) {
    names.set(balance.memberId, balance.displayNameSnapshot);
    current.set(balance.memberId, balance.netMinor);
  }

  assertZeroSum(
    input.rootBalances.map(({ memberId, netMinor }) => ({ memberId, minor: netMinor })),
    "Root balance",
  );
  assertZeroSum(
    input.currentBalances.map(({ memberId, netMinor }) => ({
      memberId,
      minor: netMinor,
    })),
    "Current balance",
  );

  const balances = [...new Set([...root.keys(), ...prior.keys(), ...current.keys()])]
    .sort(stableIdCompare)
    .map((memberId): SettlementAdjustmentDelta => {
      const sealedMinor = safeAdd(root.get(memberId) ?? 0, prior.get(memberId) ?? 0);
      const currentMinor = current.get(memberId) ?? 0;
      return {
        memberId,
        displayNameSnapshot: names.get(memberId) ?? memberId,
        currency: input.currency,
        scale: input.scale,
        sealedMinor,
        currentMinor,
        deltaMinor: safeAdd(currentMinor, -sealedMinor),
      };
    });

  assertZeroSum(
    balances.map(({ memberId, sealedMinor }) => ({ memberId, minor: sealedMinor })),
    "Sealed balance",
  );
  assertZeroSum(
    balances.map(({ memberId, deltaMinor }) => ({ memberId, minor: deltaMinor })),
    "Adjustment delta",
  );

  return {
    balances,
    transfers: buildTransferPlan(
      balances.map(({ memberId, deltaMinor }) => ({
        memberId,
        minor: deltaMinor,
        currency: input.currency,
        scale: input.scale,
      })),
    ),
  };
}

export function buildOutstandingBalanceVector(
  sealed: Pick<SettlementAdjustmentDelta, "memberId" | "sealedMinor">[],
  discharges: ConfirmedDischargeVectorInput[],
) {
  const outstanding = new Map(sealed.map((item) => [item.memberId, item.sealedMinor]));
  for (const discharge of discharges) {
    if (!Number.isSafeInteger(discharge.amountMinor) || discharge.amountMinor <= 0) {
      throw new Error("Confirmed discharge amount is invalid.");
    }
    outstanding.set(
      discharge.fromMemberId,
      safeAdd(outstanding.get(discharge.fromMemberId) ?? 0, discharge.amountMinor),
    );
    outstanding.set(
      discharge.toMemberId,
      safeAdd(outstanding.get(discharge.toMemberId) ?? 0, -discharge.amountMinor),
    );
  }
  const result = [...outstanding]
    .map(([memberId, minor]) => ({ memberId, minor }))
    .sort((left, right) => stableIdCompare(left.memberId, right.memberId));
  assertZeroSum(result, "Outstanding balance");
  return result;
}

function assertZeroSum(balances: { memberId: string; minor: number }[], label: string) {
  const total = balances.reduce((sum, balance) => {
    if (!Number.isSafeInteger(balance.minor)) throw new Error(`${label} is unsafe.`);
    return safeAdd(sum, balance.minor);
  }, 0);
  if (total !== 0) throw new Error(`${label} vector does not net to zero.`);
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
