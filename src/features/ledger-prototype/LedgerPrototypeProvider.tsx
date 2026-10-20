import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  initialPrototypeDraft,
  prototypeExpenses,
  prototypeJourneys,
  prototypeMembers,
  prototypeTransfers,
} from "./fixtures";
import type {
  PrototypeDraft,
  PrototypeExpense,
  PrototypeJourneyContext,
  PrototypeSettlementTransfer,
  PrototypeSplit,
} from "./types";

type LedgerPrototypeContextValue = {
  draft: PrototypeDraft;
  expenses: PrototypeExpense[];
  transfers: PrototypeSettlementTransfer[];
  journeys: PrototypeJourneyContext[];
  selectedJourney: PrototypeJourneyContext;
  settlementFinalized: boolean;
  updateDraft: (patch: Partial<PrototypeDraft>) => void;
  resetDraft: () => void;
  applyReceiptFixture: () => void;
  saveDraft: () => PrototypeExpense | null;
  duplicateExpense: (expenseId: string) => void;
  updateExpenseTitle: (expenseId: string, title: string) => void;
  resolveConflict: (expenseId: string) => void;
  selectJourney: (journeyId: string) => void;
  recordTransferPayment: (
    transferId: string,
    paymentMinor: number,
    paymentCurrency: string,
    dischargedMinor: number,
  ) => void;
  confirmTransferPayment: (transferId: string, paymentId: string) => void;
  finalizeSettlement: () => void;
};

const LedgerPrototypeContext = createContext<LedgerPrototypeContextValue | null>(null);

function allocate(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (total * weight) / weightTotal);
  const result = raw.map(Math.floor);
  let remaining = total - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let index = 0; index < remaining; index += 1) {
    result[order[index].index] += 1;
  }
  return result;
}

function amountToMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return minor > 0 ? minor : null;
}

export function createPrototypeSplits(
  draft: PrototypeDraft,
  merchantMinor: number,
  settlementMinor: number,
) {
  const participants = prototypeMembers.filter((member) =>
    draft.participantIds.includes(member.id),
  );
  if (draft.splitMode === "EQUAL_HOUSEHOLD") {
    const householdIds = [...new Set(participants.map((member) => member.householdId))];
    const merchantHouseholds = allocate(
      merchantMinor,
      householdIds.map(() => 1),
    );
    const settlementHouseholds = allocate(
      settlementMinor,
      householdIds.map(() => 1),
    );

    return participants.map<PrototypeSplit>((member) => {
      const householdIndex = householdIds.indexOf(member.householdId);
      const householdMembers = participants.filter(
        (participant) => participant.householdId === member.householdId,
      );
      const memberIndex = householdMembers.findIndex(
        (participant) => participant.id === member.id,
      );
      return {
        memberId: member.id,
        merchantMinor: allocate(
          merchantHouseholds[householdIndex],
          householdMembers.map(() => 1),
        )[memberIndex],
        settlementMinor: allocate(
          settlementHouseholds[householdIndex],
          householdMembers.map(() => 1),
        )[memberIndex],
      };
    });
  }
  const weights = participants.map((member) =>
    draft.splitMode === "HOUSEHOLD_SHARES" ? member.memberShare : 1,
  );
  const merchantShares = allocate(merchantMinor, weights);
  const settlementShares = allocate(settlementMinor, weights);

  return participants.map<PrototypeSplit>((member, index) => ({
    memberId: member.id,
    merchantMinor: merchantShares[index],
    settlementMinor: settlementShares[index],
  }));
}

function splitLabelForDraft(draft: PrototypeDraft) {
  const count = draft.participantIds.length;
  switch (draft.splitMode) {
    case "EQUAL_HOUSEHOLD":
      return "Equal per household";
    case "HOUSEHOLD_SHARES":
      return "Family shares · adults 1, child 0.5";
    case "EXACT":
      return `Exact amounts · ${count} people`;
    case "PERCENTAGE":
      return `Percentages · ${count} people`;
    default:
      return `${count} people equally`;
  }
}

export function LedgerPrototypeProvider({ children }: PropsWithChildren) {
  const [expenses, setExpenses] = useState<PrototypeExpense[]>(prototypeExpenses);
  const [draft, setDraft] = useState<PrototypeDraft>(initialPrototypeDraft);
  const [transfers, setTransfers] =
    useState<PrototypeSettlementTransfer[]>(prototypeTransfers);
  const [selectedJourneyId, setSelectedJourneyId] = useState("europe-2026");
  const [settlementFinalized, setSettlementFinalized] = useState(false);

  const value = useMemo<LedgerPrototypeContextValue>(
    () => ({
      draft,
      expenses,
      journeys: prototypeJourneys,
      selectedJourney:
        prototypeJourneys.find((journey) => journey.id === selectedJourneyId) ??
        prototypeJourneys[0],
      transfers,
      settlementFinalized,
      updateDraft: (patch) => setDraft((current) => ({ ...current, ...patch })),
      resetDraft: () => setDraft(initialPrototypeDraft),
      applyReceiptFixture: () =>
        setDraft((current) => ({
          ...current,
          amount: "86.40",
          currency: "EUR",
          title: "Cafe Oberkampf",
          receiptAttached: true,
          valuationPolicy: "REFERENCE_RATE",
        })),
      saveDraft: () => {
        const merchantMinor = amountToMinor(draft.amount);
        if (!merchantMinor || !draft.title.trim() || draft.participantIds.length === 0) {
          return null;
        }

        const rate =
          draft.currency === "NZD"
            ? 1
            : draft.valuationPolicy === "ACTUAL_PAYER_COST"
              ? 1.9943
              : 1.978;
        const settlementMinor = Math.round(merchantMinor * rate);
        const expense: PrototypeExpense = {
          id: `prototype-${Date.now()}`,
          title: draft.title.trim(),
          category: "Other",
          occurredAt: "Just now",
          payerMemberId: draft.payerMemberId,
          merchant: { minor: merchantMinor, currency: draft.currency },
          settlement: { minor: settlementMinor, currency: "NZD" },
          valuationPolicy:
            draft.currency === "NZD" ? "SAME_CURRENCY" : draft.valuationPolicy,
          rateLabel:
            draft.currency === "NZD"
              ? "Same currency · no conversion"
              : draft.valuationPolicy === "ACTUAL_PAYER_COST"
                ? "Payer posted-cost policy · sample evidence"
                : "1 EUR = 1.9780 NZD · Journey reference",
          splitLabel: splitLabelForDraft(draft),
          splits: createPrototypeSplits(draft, merchantMinor, settlementMinor),
          receiptAttached: draft.receiptAttached,
          status: "PENDING",
          settlementParticipation: draft.settlementParticipation,
          audit: [
            {
              id: `audit-${Date.now()}`,
              title: "Saved on this iPhone",
              detail: "Prototype fixture · no backend mutation",
              at: "Just now",
            },
          ],
        };
        setExpenses((current) => [expense, ...current]);
        setDraft(initialPrototypeDraft);
        return expense;
      },
      duplicateExpense: (expenseId) =>
        setExpenses((current) => {
          const source = current.find((expense) => expense.id === expenseId);
          if (!source) return current;
          return [
            {
              ...source,
              id: `prototype-copy-${Date.now()}`,
              title: `${source.title} copy`,
              occurredAt: "Just now",
              status: "PENDING",
              audit: [
                {
                  id: `audit-copy-${Date.now()}`,
                  title: "Duplicated locally",
                  detail: "Prototype action · review before real use",
                  at: "Just now",
                },
              ],
            },
            ...current,
          ];
        }),
      updateExpenseTitle: (expenseId, title) =>
        setExpenses((current) =>
          current.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  title,
                  status: "PENDING",
                  audit: [
                    {
                      id: `audit-edit-${Date.now()}`,
                      title: "Title edited",
                      detail: "Leon · saved locally",
                      at: "Just now",
                    },
                    ...expense.audit,
                  ],
                }
              : expense,
          ),
        ),
      resolveConflict: (expenseId) =>
        setExpenses((current) =>
          current.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  status: "PENDING",
                  splitLabel: "4 people equally · resolved locally",
                  audit: [
                    {
                      id: `audit-resolve-${Date.now()}`,
                      title: "Conflict resolved",
                      detail: "Kept Journey amount · reason recorded",
                      at: "Just now",
                    },
                    ...expense.audit,
                  ],
                }
              : expense,
          ),
        ),
      selectJourney: setSelectedJourneyId,
      recordTransferPayment: (
        transferId,
        paymentMinor,
        paymentCurrency,
        dischargedMinor,
      ) =>
        setTransfers((current) =>
          current.map((transfer) => {
            if (transfer.id !== transferId) return transfer;
            const reservedMinor = transfer.payments
              .filter((payment) => payment.status !== "REJECTED")
              .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
            if (
              paymentMinor <= 0 ||
              dischargedMinor <= 0 ||
              reservedMinor + dischargedMinor > transfer.amount.minor
            ) {
              return transfer;
            }
            return {
              ...transfer,
              status: "AWAITING_CONFIRMATION",
              payments: [
                ...transfer.payments,
                {
                  id: `payment-${Date.now()}`,
                  paymentAmount: { minor: paymentMinor, currency: paymentCurrency },
                  dischargedAmount: {
                    minor: dischargedMinor,
                    currency: transfer.amount.currency,
                  },
                  reportedBy: transfer.from,
                  paidAt: "Just now",
                  status: "AWAITING_CONFIRMATION",
                },
              ],
            };
          }),
        ),
      confirmTransferPayment: (transferId, paymentId) =>
        setTransfers((current) =>
          current.map((transfer) => {
            if (transfer.id !== transferId) return transfer;
            const payments = transfer.payments.map((payment) =>
              payment.id === paymentId
                ? {
                    ...payment,
                    status: "CONFIRMED" as const,
                    confirmedBy: transfer.to,
                    confirmedAt: "Just now",
                  }
                : payment,
            );
            const confirmedMinor = payments
              .filter((payment) => payment.status === "CONFIRMED")
              .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
            const hasAwaiting = payments.some(
              (payment) => payment.status === "AWAITING_CONFIRMATION",
            );
            return {
              ...transfer,
              payments,
              status:
                confirmedMinor >= transfer.amount.minor
                  ? "SETTLED"
                  : hasAwaiting
                    ? "AWAITING_CONFIRMATION"
                    : "PARTIALLY_PAID",
            };
          }),
        ),
      finalizeSettlement: () => setSettlementFinalized(true),
    }),
    [draft, expenses, selectedJourneyId, settlementFinalized, transfers],
  );

  return (
    <LedgerPrototypeContext.Provider value={value}>
      {children}
    </LedgerPrototypeContext.Provider>
  );
}

export function useLedgerPrototype() {
  const value = useContext(LedgerPrototypeContext);
  if (!value) throw new Error("Ledger prototype context is unavailable.");
  return value;
}
