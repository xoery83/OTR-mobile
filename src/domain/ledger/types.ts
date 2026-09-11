export type CurrencyCode = string;

export type Money = {
  minor: number;
  currency: CurrencyCode;
  scale: number;
};

export type ExpenseBusinessStatus = "DRAFT" | "ACCEPTED" | "RATE_REQUIRED" | "DELETED";
export type ExpenseSplitMethod =
  "EQUAL_PERSON" | "EQUAL_HOUSEHOLD" | "HOUSEHOLD_SHARES" | "EXACT" | "PERCENTAGE";
export type ValuationPolicy =
  | "REFERENCE_RATE"
  | "ACTUAL_PAYER_COST"
  | "MANUAL_AGREED"
  | "SAME_CURRENCY"
  | "LEGACY_IMPORTED";

export type ExpenseParticipant = {
  memberId: string;
  displayNameSnapshot: string;
  householdIdSnapshot: string | null;
};

export type ExpenseSplit = {
  memberId: string;
  originalMinor: number;
  settlementMinor: number | null;
  method: ExpenseSplitMethod;
  weightUnits: number | null;
  percentageUnits: number | null;
  roundingAdjustmentMinor: number;
};

export type ExchangeRateSnapshot = {
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  decimalRate: string;
  effectiveDate: string;
  source: string;
};

export type PaymentRecord = {
  id: string;
  instrumentLabel: string | null;
  authorization: Money | null;
  posted: Money | null;
  postedAt: string | null;
  fee: Money | null;
  supersedesPaymentRecordId: string | null;
};

export type SettlementValuationSnapshot = {
  id: string;
  policy: ValuationPolicy;
  original: Money;
  settlement: Money;
  rateSnapshotId: string | null;
  paymentRecordId: string | null;
  reason: string | null;
};

export type ExpenseAggregate = {
  id: string;
  journeyId: string;
  revision: number;
  title: string;
  category: string;
  payerMemberId: string;
  original: Money;
  participants: ExpenseParticipant[];
  splits: ExpenseSplit[];
  valuation: SettlementValuationSnapshot | null;
  paymentRecords: PaymentRecord[];
  status: ExpenseBusinessStatus;
};

export type LedgerConflictField =
  "amount" | "payer" | "currency" | "participants" | "splits" | "valuation";

export type MemberBalance = {
  memberId: string;
  minor: number;
  currency: CurrencyCode;
  scale: number;
};

export type SettlementTransferPlan = {
  fromMemberId: string;
  toMemberId: string;
  amount: Money;
};
