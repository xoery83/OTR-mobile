export type CurrencyCode = string;

export type Money = {
  minor: number;
  currency: CurrencyCode;
  scale: number;
};

export type ExpenseBusinessStatus = "DRAFT" | "ACCEPTED" | "RATE_REQUIRED" | "DELETED";
export type ExpenseSettlementParticipation = "INCLUDED" | "EXCLUDED";
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
  observedAt?: string;
  providerReference?: string | null;
  manualReason?: string | null;
  stalenessState?: "FRESH" | "STALE_ACCEPTED" | "REVIEW_REQUIRED";
  supersedesRateSnapshotId?: string | null;
};

export type RateQuote = {
  id: string;
  journeyId: string;
  quoteCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  decimalRate: string;
  effectiveDate: string;
  economicDate?: string | null;
  referenceDate?: string | null;
  policyVersion?: string | null;
  observedAt: string;
  provider: string;
  providerReference: string | null;
  sourceReference?: string | null;
  expiresAt: string;
};

export type PaymentRecord = {
  id: string;
  expenseId?: string;
  expenseRevision?: number;
  payerMemberId?: string;
  instrumentLabel: string | null;
  authorization: Money | null;
  posted: Money | null;
  postedAt: string | null;
  authorizedAt?: string | null;
  fee: Money | null;
  bankFxRate?: string | null;
  source?: string | null;
  notes?: string | null;
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
  decimalRate?: string | null;
  roundingMode?: "HALF_UP";
  effectiveAt?: string;
  supersedesValuationId?: string | null;
  referenceEvidence?: {
    economicDate: string;
    referenceDate: string;
    source: string;
    sourceReference: string;
    deliveryProvider: string;
    providerReference: string;
    observedAt: string;
    acceptedAt: string;
    automatic: boolean;
  } | null;
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
  settlementParticipation: ExpenseSettlementParticipation;
};

export type LedgerConflictField =
  | "amount"
  | "payer"
  | "currency"
  | "participants"
  | "splits"
  | "valuation"
  | "settlementParticipation";

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
