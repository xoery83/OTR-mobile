export type PrototypeMoney = {
  minor: number;
  currency: string;
};

export type PrototypeMember = {
  id: string;
  name: string;
  shortName: string;
  householdId: string;
  memberShare: number;
  color: string;
};

export type PrototypeJourneyContext = {
  id: string;
  title: string;
  dates: string;
  status: "ACTIVE" | "UPCOMING" | "PAST";
  memberCount: number;
  settlementCurrency: string;
  mySpendMinor: number;
  groupSpendMinor: number;
  outstandingMinor: number;
};

export type PrototypeSplit = {
  memberId: string;
  merchantMinor: number;
  settlementMinor: number;
};

export type PrototypeAuditEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type PrototypeExpenseStatus = "SYNCED" | "PENDING" | "CONFLICT";

export type PrototypePaymentRecord = {
  instrumentLabel: string;
  posted: PrototypeMoney;
  postedDate: string;
  fee?: PrototypeMoney;
};

export type PrototypeExpense = {
  id: string;
  title: string;
  category: string;
  occurredAt: string;
  payerMemberId: string;
  merchant: PrototypeMoney;
  settlement: PrototypeMoney;
  valuationPolicy: "REFERENCE_RATE" | "ACTUAL_PAYER_COST" | "SAME_CURRENCY";
  rateLabel: string;
  splitLabel: string;
  splits: PrototypeSplit[];
  excludedMemberNames?: string[];
  paymentRecord?: PrototypePaymentRecord;
  receiptAttached?: boolean;
  location?: string;
  notes?: string;
  status: PrototypeExpenseStatus;
  settlementParticipation?: "INCLUDED" | "EXCLUDED";
  audit: PrototypeAuditEvent[];
};

export type PrototypeSettlementTransfer = {
  id: string;
  from: string;
  to: string;
  amount: PrototypeMoney;
  status: "OPEN" | "PARTIALLY_PAID" | "AWAITING_CONFIRMATION" | "SETTLED" | "DISPUTED";
  payments: PrototypeSettlementPayment[];
};

export type PrototypeSettlementPayment = {
  id: string;
  paymentAmount: PrototypeMoney;
  dischargedAmount: PrototypeMoney;
  reportedBy: string;
  paidAt: string;
  status: "AWAITING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
  confirmedBy?: string;
  confirmedAt?: string;
};

export type PrototypeMemberBalance = {
  memberId: string;
  name: string;
  amountMinor: number;
};

export type PrototypeDraftSplitMode =
  "EQUAL_PERSON" | "EQUAL_HOUSEHOLD" | "HOUSEHOLD_SHARES" | "EXACT" | "PERCENTAGE";

export type PrototypeDraft = {
  amount: string;
  currency: string;
  title: string;
  payerMemberId: string;
  participantIds: string[];
  splitMode: PrototypeDraftSplitMode;
  valuationPolicy: "REFERENCE_RATE" | "ACTUAL_PAYER_COST" | "SAME_CURRENCY";
  receiptAttached: boolean;
  settlementParticipation: "INCLUDED" | "EXCLUDED";
};
