import type {
  SettlementInputSnapshot,
  SettlementMemberBalanceSnapshot,
} from "./settlement";
import type {
  FeeTreatment,
  RepaymentValuation,
  SettlementPaymentStatus,
} from "./paymentLifecycle";
import type { Money } from "./types";

export const settlementStatementSchemaVersion = 1;

type SettlementPaymentSnapshot = {
  id: string;
  transferId: string;
  status: SettlementPaymentStatus;
  payment: Money;
  assertedDischarge: Money;
  repaymentValuation: (RepaymentValuation & { id: string }) | null;
  feeTreatment: FeeTreatment | null;
  reportedByMemberId: string;
  reportingAuthority: "PAYER" | "ORGANIZER_OVERRIDE";
  reportingReason: string | null;
  paidAt: string;
  supersedesPaymentId: string | null;
  revision: number;
  createdAt: string;
  discharge: {
    id: string;
    amount: Money;
    confirmationAuthority: "RECIPIENT" | "ORGANIZER_OVERRIDE";
    confirmedByMemberId: string;
    reason: string | null;
    confirmedAt: string;
  } | null;
};

type SettlementPaymentSource = Omit<SettlementPaymentSnapshot, "discharge"> & {
  notes?: string | null;
  evidenceAssetId?: string | null;
  syncStatus?: "PENDING" | "SYNCED" | "FAILED";
  reportedByUserId?: string;
  discharge:
    | (NonNullable<SettlementPaymentSnapshot["discharge"]> & {
        confirmedByUserId?: string;
      })
    | null;
};

type SettlementTransferSnapshot = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: Money;
  confirmedDischarge: Money;
  confirmedRemaining: Money;
  awaitingAmount: Money;
  availableToReport: Money;
  status:
    | "OPEN"
    | "PARTIALLY_PAID"
    | "AWAITING_CONFIRMATION"
    | "SETTLED"
    | "DISPUTED"
    | "CANCELLED";
  revision: number;
  payments: SettlementPaymentSnapshot[];
};

export type SettlementLineageSnapshot = {
  id: string;
  journeyId: string;
  kind?: "ROOT" | "ADJUSTMENT";
  rootSettlementId?: string | null;
  parentAdjustmentId?: string | null;
  lineageSequence?: number;
  priorInputDigest?: string | null;
  adjustmentReason?: string | null;
  eligibilityVersion?: string;
  status: "FINALIZED" | "PARTIALLY_PAID" | "SETTLED" | "SUPERSEDED";
  throughTimestamp: string;
  settlementCurrency: string;
  settlementScale: number;
  algorithmVersion: string;
  inputDigest: string;
  finalizedAt: string;
  inputs: SettlementInputSnapshot[];
  balances: SettlementMemberBalanceSnapshot[];
  adjustmentDeltas?: {
    memberId: string;
    displayNameSnapshot: string;
    deltaMinor: number;
    currency: string;
    scale: number;
  }[];
  adjustmentState?: "CURRENT" | "ADJUSTMENT_REQUIRED" | "ADJUSTMENT_BLOCKED";
  outstandingBalances?: {
    memberId: string;
    displayNameSnapshot: string;
    amount: Money;
  }[];
  transfers: (Omit<SettlementTransferSnapshot, "payments"> & {
    payments: SettlementPaymentSource[];
  })[];
  auditEvents: {
    id: string;
    eventType: string;
    actorUserId?: string;
    actorMemberId: string;
    reason: string | null;
    transferId: string | null;
    paymentId: string | null;
    dischargeId: string | null;
    authority: "PAYER" | "RECIPIENT" | "ORGANIZER_OVERRIDE" | null;
    revision: number;
    createdAt: string;
  }[];
};

type StatementTransfer = SettlementTransferSnapshot;

export type SettlementStatement = {
  schemaVersion: typeof settlementStatementSchemaVersion;
  journeyId: string;
  rootSettlementId: string;
  headSettlementId: string;
  throughTimestamp: string;
  settlementCurrency: string;
  settlementScale: number;
  algorithmVersion: string;
  eligibilityVersion: string;
  adjustmentState: "CURRENT" | "ADJUSTMENT_REQUIRED" | "ADJUSTMENT_BLOCKED" | null;
  fullySettled: boolean;
  outstandingBalances: NonNullable<SettlementLineageSnapshot["outstandingBalances"]>;
  lineage: {
    id: string;
    kind: "ROOT" | "ADJUSTMENT";
    sequence: number;
    parentAdjustmentId: string | null;
    inputDigest: string;
    priorInputDigest: string | null;
    adjustmentReason: string | null;
    finalizedAt: string;
    balances: SettlementMemberBalanceSnapshot[];
    adjustmentDeltas: NonNullable<SettlementLineageSnapshot["adjustmentDeltas"]>;
    inputs: SettlementInputSnapshot[];
    transfers: StatementTransfer[];
    auditEvents: Omit<SettlementLineageSnapshot["auditEvents"][number], "actorUserId">[];
  }[];
};

export function buildSettlementStatement(
  rows: SettlementLineageSnapshot[],
): SettlementStatement {
  const lineage = [...rows].sort(
    (left, right) =>
      (left.lineageSequence ?? 0) - (right.lineageSequence ?? 0) ||
      left.id.localeCompare(right.id),
  );
  const root = lineage.find((row) => (row.kind ?? "ROOT") === "ROOT");
  if (!root) throw new Error("Settlement root is missing.");
  if (
    lineage.some(
      (row) =>
        row.journeyId !== root.journeyId ||
        (row.id !== root.id && row.rootSettlementId !== root.id),
    )
  ) {
    throw new Error("Settlement lineage contains an unrelated row.");
  }

  const head = lineage.at(-1)!;
  const transfers = lineage.flatMap((row) => row.transfers);

  return {
    schemaVersion: settlementStatementSchemaVersion,
    journeyId: root.journeyId,
    rootSettlementId: root.id,
    headSettlementId: head.id,
    throughTimestamp: root.throughTimestamp,
    settlementCurrency: root.settlementCurrency,
    settlementScale: root.settlementScale,
    algorithmVersion: root.algorithmVersion,
    eligibilityVersion: root.eligibilityVersion ?? "ledger-settlement-eligibility-v1",
    adjustmentState: root.adjustmentState ?? head.adjustmentState ?? null,
    fullySettled: transfers.every(
      (transfer) =>
        transfer.status === "SETTLED" &&
        transfer.confirmedRemaining.minor === 0 &&
        transfer.awaitingAmount.minor === 0,
    ),
    outstandingBalances: sorted(
      root.outstandingBalances ?? head.outstandingBalances ?? [],
      (row) => row.memberId,
    ),
    lineage: lineage.map((row) => ({
      id: row.id,
      kind: row.kind ?? "ROOT",
      sequence: row.lineageSequence ?? 0,
      parentAdjustmentId: row.parentAdjustmentId ?? null,
      inputDigest: row.inputDigest,
      priorInputDigest: row.priorInputDigest ?? null,
      adjustmentReason: row.adjustmentReason ?? null,
      finalizedAt: row.finalizedAt,
      balances: sorted(row.balances, (balance) => balance.memberId),
      adjustmentDeltas: sorted(row.adjustmentDeltas ?? [], (delta) => delta.memberId),
      inputs: sorted(row.inputs, (input) => input.expenseId).map((input) => ({
        ...input,
        splits: sorted(input.splits, (split) => split.member.memberId),
      })),
      transfers: sorted(row.transfers, (transfer) => transfer.id).map((transfer) => ({
        ...transfer,
        payments: sorted(
          transfer.payments.map(
            ({
              notes: _notes,
              evidenceAssetId: _evidence,
              syncStatus: _sync,
              reportedByUserId: _user,
              discharge,
              ...payment
            }) => ({
              ...payment,
              discharge: discharge
                ? (({ confirmedByUserId: _confirmedUser, ...fact }) => fact)(discharge)
                : null,
            }),
          ),
          (payment) => `${payment.createdAt}:${payment.id}`,
        ),
      })),
      auditEvents: sorted(
        row.auditEvents,
        (event) => `${event.createdAt}:${event.id}`,
      ).map(({ actorUserId: _actorUserId, ...event }) => event),
    })),
  };
}

export function assertCurrentFinalStatement(statement: SettlementStatement) {
  if (statement.adjustmentState !== "CURRENT")
    throw new Error("Settlement lineage is not current.");
  if (!statement.fullySettled)
    throw new Error("Settlement lineage is not fully settled.");
}

export function canonicalSettlementStatementJson(statement: SettlementStatement) {
  return JSON.stringify(sortKeys(statement));
}

function sorted<T>(values: T[], key: (value: T) => string) {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortKeys(child)]),
  );
}
