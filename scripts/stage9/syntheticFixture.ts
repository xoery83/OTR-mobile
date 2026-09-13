import type {
  LegacyExtract,
  Stage9TransformConfig,
} from "../../backend/src/stage9Import";

export const syntheticStage9Config: Stage9TransformConfig = {
  namespaceKey: "stage9-synthetic-key-0123456789abcdef0123456789abcdef",
  devOperatorUserId: "00000000-0000-4000-8000-000000000001",
  linkedUserBySourceMemberId: {
    "90000000-0000-4000-8000-000000000001": "00000000-0000-4000-8000-000000000001",
    "90000000-0000-4000-8000-000000000002": "00000000-0000-4000-8000-000000000002",
  },
};

const journeyId = "90000000-0000-4000-8000-000000000000";
const ownerId = "90000000-0000-4000-8000-000000000001";
const memberId = "90000000-0000-4000-8000-000000000002";

function entry(
  id: string,
  overrides: Partial<LegacyExtract["ledgerEntries"][number]> = {},
): LegacyExtract["ledgerEntries"][number] {
  return {
    id,
    journeyId,
    category: "food",
    accountingMode: "shared",
    expenseDate: "2026-06-01",
    startDate: null,
    endDate: null,
    originalAmount: "10.01",
    originalCurrency: "EUR",
    baseAmount: "20.00",
    baseCurrency: "NZD",
    exchangeRate: "1.998001998",
    exchangeRateDate: "2026-06-01",
    payerMemberId: ownerId,
    status: "complete",
    ...overrides,
  };
}

function equalParticipants(entryId: string, shares: [string, string]) {
  return [ownerId, memberId].map((sourceMemberId, index) => ({
    ledgerEntryId: entryId,
    memberId: sourceMemberId,
    splitMethod: "equal" as const,
    shareAmount: null,
    sharePercentage: null,
    computedShareBaseAmount: shares[index],
  }));
}

export function syntheticLegacyExtract(): LegacyExtract {
  const accepted = "91000000-0000-4000-8000-000000000001";
  const residual = "91000000-0000-4000-8000-000000000002";
  const stats = "91000000-0000-4000-8000-000000000003";
  const custom = "91000000-0000-4000-8000-000000000004";
  const noPayer = "91000000-0000-4000-8000-000000000005";
  const fractionalJpy = "91000000-0000-4000-8000-000000000006";
  return {
    sourceProjectRef: "synthetic-source",
    sourceEnvironment: "Synthetic",
    extractedAt: "2026-09-13T00:00:00.000Z",
    sourceJourneyId: journeyId,
    trips: [{ id: journeyId, startDate: "2026-06-01", endDate: "2026-06-30" }],
    journeyMembers: [
      { id: ownerId, tripId: journeyId, role: "owner", status: "linked" },
      { id: memberId, tripId: journeyId, role: "group_member", status: "linked" },
    ],
    journeyLedgers: [
      {
        journeyId,
        baseCurrency: "NZD",
        displayCurrency: "NZD",
        exchangeRatesSnapshotDate: "2026-06-01",
      },
    ],
    ledgerEntries: [
      entry(accepted),
      entry(residual, { baseAmount: "20.01" }),
      entry(stats, { accountingMode: "stats_only" }),
      entry(custom),
      entry(noPayer, { payerMemberId: null }),
      entry(fractionalJpy, {
        originalAmount: "1.50",
        originalCurrency: "JPY",
        baseAmount: "0.02",
        exchangeRate: "0.013",
      }),
    ],
    ledgerEntryParticipants: [
      ...equalParticipants(accepted, ["10.00", "10.00"]),
      ...equalParticipants(residual, ["10.01", "10.01"]),
      ...equalParticipants(stats, ["10.00", "10.00"]),
      ...equalParticipants(custom, ["10.00", "10.00"]).map((row) => ({
        ...row,
        splitMethod: "custom_amount" as const,
        shareAmount: "5.005",
      })),
      ...equalParticipants(noPayer, ["10.00", "10.00"]),
      ...equalParticipants(fractionalJpy, ["0.01", "0.01"]),
    ],
    journeyExchangeRates: [
      {
        journeyId,
        baseCurrency: "NZD",
        quoteCurrency: "EUR",
        rateToBase: "1.998001998",
        rateDate: "2026-06-01",
      },
    ],
    ledgerSettlements: [
      {
        id: "92000000-0000-4000-8000-000000000001",
        journeyId,
        fromMemberId: memberId,
        toMemberId: ownerId,
        amount: "10.00",
        currency: "NZD",
        status: "suggested",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    ],
    redactionPresenceCounts: {
      "trips.name": 1,
      "journey_members.display_name": 2,
      "ledger_entries.title": 6,
      "ledger_entries.description": 3,
    },
  };
}
