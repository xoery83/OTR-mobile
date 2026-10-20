import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

import { allocateEqual } from "../../src/domain/ledger/allocation";
import {
  currencyScale,
  ISO_4217_METADATA_VERSION,
} from "../../src/domain/ledger/currency";

export const STAGE9_TARGET_PROJECT_REF = "tuqigdxrvrerfewsxqgm" as const;
export const STAGE9_JOURNEY_NAME = "Europe 2026 Replay" as const;
export const STAGE9_TRANSFORM_VERSION = "stage9-europe-replay-v3" as const;
export const STAGE9_MAPPING_VERSION = "legacy-ledger-to-ledger2-v1" as const;
export const STAGE9_ALLOCATION_VERSION = "ledger-largest-remainder-v1" as const;
export const STAGE9_NORMALIZATION_VERSION =
  "legacy-equal-rounding-normalization-v2" as const;
export const STAGE9_MANIFEST_VERSION = "stage9-import-manifest-v1" as const;

export const STAGE9_SOURCE_ALLOWLIST = {
  trips: {
    rows: ["id", "start_date", "end_date"],
    presenceOnly: [
      "name",
      "destination",
      "cover_image_url",
      "created_by",
      "photo_storage_provider",
      "photo_storage_status",
      "photo_storage_root_folder_id",
    ],
  },
  journey_members: {
    rows: ["id", "trip_id", "role", "status"],
    presenceOnly: [
      "user_id",
      "display_name",
      "avatar_url",
      "notes",
      "invite_email",
      "invite_code",
      "invited_by_user_id",
      "linked_at",
    ],
  },
  journey_ledgers: {
    rows: [
      "journey_id",
      "base_currency",
      "display_currency",
      "exchange_rates_snapshot_date",
    ],
    presenceOnly: ["exchange_rates_snapshot_source", "exchange_rates_refreshed_by"],
  },
  ledger_entries: {
    rows: [
      "id",
      "journey_id",
      "category",
      "accounting_mode",
      "expense_date",
      "start_date",
      "end_date",
      "original_amount",
      "original_currency",
      "base_amount",
      "base_currency",
      "exchange_rate",
      "exchange_rate_date",
      "payer_member_id",
      "status",
    ],
    presenceOnly: [
      "title",
      "description",
      "itinerary_event_id",
      "itinerary_reservation_id",
      "memory_entry_id",
      "created_by_member_id",
      "created_by_user_id",
      "address_text",
      "latitude",
      "longitude",
      "location_source",
      "location_text",
      "location_lat",
      "location_lng",
      "location_confidence",
      "place_id",
      "location_provider",
      "location_provider_place_id",
      "geocoded_at",
      "geocode_error",
    ],
  },
  ledger_entry_participants: {
    rows: [
      "ledger_entry_id",
      "member_id",
      "split_method",
      "share_amount",
      "share_percentage",
      "computed_share_base_amount",
    ],
    presenceOnly: [],
  },
  journey_exchange_rates: {
    rows: ["journey_id", "base_currency", "quote_currency", "rate_to_base", "rate_date"],
    presenceOnly: ["source"],
  },
  ledger_settlements: {
    rows: [
      "id",
      "journey_id",
      "from_member_id",
      "to_member_id",
      "amount",
      "currency",
      "status",
      "created_at",
    ],
    presenceOnly: ["notes"],
  },
} as const;

const uuid = z.uuid();
const date = z.iso.date();
const nullableDate = date.nullable();
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);

export const legacyExtractSchema = z
  .object({
    sourceProjectRef: z.string().min(1),
    sourceEnvironment: z.enum(["Production", "Synthetic"]),
    extractedAt: z.iso.datetime(),
    sourceJourneyId: uuid,
    trips: z
      .array(
        z.object({ id: uuid, startDate: nullableDate, endDate: nullableDate }).strict(),
      )
      .length(1),
    journeyMembers: z.array(
      z
        .object({
          id: uuid,
          tripId: uuid,
          role: z.enum(["owner", "group_member", "guest"]),
          status: z.enum(["linked", "unlinked", "invite_pending"]),
        })
        .strict(),
    ),
    journeyLedgers: z
      .array(
        z
          .object({
            journeyId: uuid,
            baseCurrency: z.string(),
            displayCurrency: z.string(),
            exchangeRatesSnapshotDate: date,
          })
          .strict(),
      )
      .length(1),
    ledgerEntries: z.array(
      z
        .object({
          id: uuid,
          journeyId: uuid,
          category: z.string(),
          accountingMode: z.enum(["stats_only", "shared"]),
          expenseDate: date,
          startDate: nullableDate,
          endDate: nullableDate,
          originalAmount: decimal,
          originalCurrency: z.string(),
          baseAmount: decimal,
          baseCurrency: z.string(),
          exchangeRate: decimal,
          exchangeRateDate: nullableDate,
          payerMemberId: uuid.nullable(),
          status: z.enum(["draft", "complete", "needs_review"]),
        })
        .strict(),
    ),
    ledgerEntryParticipants: z.array(
      z
        .object({
          ledgerEntryId: uuid,
          memberId: uuid,
          splitMethod: z.enum(["equal", "custom_amount", "custom_percentage"]),
          shareAmount: decimal.nullable(),
          sharePercentage: decimal.nullable(),
          computedShareBaseAmount: decimal.nullable(),
        })
        .strict(),
    ),
    journeyExchangeRates: z.array(
      z
        .object({
          journeyId: uuid,
          baseCurrency: z.string(),
          quoteCurrency: z.string(),
          rateToBase: decimal,
          rateDate: date,
        })
        .strict(),
    ),
    ledgerSettlements: z.array(
      z
        .object({
          id: uuid,
          journeyId: uuid,
          fromMemberId: uuid,
          toMemberId: uuid,
          amount: decimal,
          currency: z.string(),
          status: z.enum(["suggested", "confirmed", "paid"]),
          createdAt: z.iso.datetime(),
        })
        .strict(),
    ),
    redactionPresenceCounts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

export type LegacyExtract = z.infer<typeof legacyExtractSchema>;

export const stage9TransformConfigSchema = z
  .object({
    namespaceKey: z.string().min(32),
    devOperatorUserId: uuid,
    linkedUserBySourceMemberId: z.record(uuid, uuid),
  })
  .strict();

export type Stage9TransformConfig = z.infer<typeof stage9TransformConfigSchema>;

const importProvenanceSchema = z
  .object({
    sourceRefHmac: z.string().regex(/^[a-f0-9]{64}$/),
    transformVersion: z.literal(STAGE9_TRANSFORM_VERSION),
    mappingVersion: z.literal(STAGE9_MAPPING_VERSION),
    iso4217Version: z.literal(ISO_4217_METADATA_VERSION),
    legacyAccountingMode: z.enum(["stats_only", "shared"]),
    destinationSettlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]),
    legacyStatus: z.enum(["draft", "complete", "needs_review"]),
    occurredPrecision: z.literal("DATE"),
    startDate: nullableDate,
    endDate: nullableDate,
    legacyEqualRoundingNormalization: z
      .object({
        normalizationVersion: z.literal(STAGE9_NORMALIZATION_VERSION),
        sourceSplitIntent: z.literal("LEGACY_EQUAL"),
        sourceAlgorithm: z.literal("INDEPENDENT_JS_NUMBER_TO_FIXED_2_PER_PARTICIPANT"),
        sourceStoredShares: z.literal("HISTORICAL_EVIDENCE"),
        sourceStoredSharesEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        destinationAllocationVersion: z.literal(STAGE9_ALLOCATION_VERSION),
        residualAssignment: z.literal("LEDGER_2_0_MIGRATION_NORMALIZATION"),
        destinationParticipantAmountsHistorical: z.literal(false),
      })
      .strict()
      .nullable(),
    aggregatePayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const stage9DatasetSchema = z
  .object({
    transformVersion: z.literal(STAGE9_TRANSFORM_VERSION),
    mappingVersion: z.literal(STAGE9_MAPPING_VERSION),
    allocationVersion: z.literal(STAGE9_ALLOCATION_VERSION),
    normalizationVersion: z.literal(STAGE9_NORMALIZATION_VERSION),
    iso4217Version: z.literal(ISO_4217_METADATA_VERSION),
    targetProjectRef: z.literal(STAGE9_TARGET_PROJECT_REF),
    journey: z
      .object({
        id: uuid,
        name: z.literal(STAGE9_JOURNEY_NAME),
        startDate: nullableDate,
        endDate: nullableDate,
        createdByUserId: uuid,
      })
      .strict(),
    settings: z
      .object({
        settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
        settlementScale: z.number().int().min(0).max(4),
        valuationPolicy: z.literal("MANUAL_AGREED"),
      })
      .strict(),
    members: z.array(
      z
        .object({
          id: uuid,
          userId: uuid.nullable(),
          displayName: z.string().regex(/^Traveller \d{2,}$/),
          role: z.enum(["owner", "group_member", "guest"]),
          status: z.enum(["linked", "unlinked"]),
        })
        .strict(),
    ),
    expenses: z.array(
      z
        .object({
          id: uuid,
          payerMemberId: uuid,
          title: z.string().regex(/^Imported [a-z_]+ [a-f0-9]{8}$/),
          category: z.string(),
          occurredAt: z.iso.datetime(),
          originalAmountMinor: z.number().int().positive().safe(),
          originalCurrency: z.string().regex(/^[A-Z]{3}$/),
          originalScale: z.number().int().min(0).max(4),
          businessStatus: z.enum(["ACCEPTED", "DRAFT"]),
          settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]),
          importProvenance: importProvenanceSchema,
        })
        .strict(),
    ),
    participants: z.array(
      z
        .object({
          expenseId: uuid,
          memberId: uuid,
          displayNameSnapshot: z.string().regex(/^Traveller \d{2,}$/),
          displayOrder: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    splits: z.array(
      z
        .object({
          expenseId: uuid,
          memberId: uuid,
          method: z.literal("EQUAL_PERSON"),
          originalAmountMinor: z.number().int().nonnegative().safe(),
          settlementAmountMinor: z.number().int().nonnegative().safe(),
          roundingAdjustmentMinor: z.number().int().min(-1).max(1),
        })
        .strict(),
    ),
    rateSnapshots: z.array(
      z
        .object({
          id: uuid,
          expenseId: uuid,
          baseCurrency: z.string().regex(/^[A-Z]{3}$/),
          quoteCurrency: z.string().regex(/^[A-Z]{3}$/),
          decimalRate: decimal,
          effectiveDate: date,
          sourceRefHmac: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    valuations: z.array(
      z
        .object({
          id: uuid,
          expenseId: uuid,
          originalAmountMinor: z.number().int().positive().safe(),
          originalCurrency: z.string().regex(/^[A-Z]{3}$/),
          originalScale: z.number().int().min(0).max(4),
          settlementAmountMinor: z.number().int().positive().safe(),
          settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
          settlementScale: z.number().int().min(0).max(4),
          rateSnapshotId: uuid,
          decimalRate: decimal,
          effectiveAt: z.iso.datetime(),
          policy: z.literal("LEGACY_IMPORTED"),
        })
        .strict(),
    ),
    reviewFindings: z.array(
      z
        .object({
          id: uuid,
          expenseId: uuid,
          findingType: z.literal("IMPORT_NEEDS_REVIEW"),
          evidenceCodes: z.array(z.string()).min(1),
          rulesetVersion: z.literal(STAGE9_TRANSFORM_VERSION),
        })
        .strict(),
    ),
  })
  .strict();

export type Stage9Dataset = z.infer<typeof stage9DatasetSchema>;

export type Stage9PrivacyReport = {
  passed: boolean;
  hits: { code: string; path: string }[];
};

export type Stage9PrivateApprovalManifest = {
  manifestVersion: typeof STAGE9_MANIFEST_VERSION;
  state: "SYNTHETIC_VALIDATED" | "PRELOAD_VALIDATED";
  sourceJourneyRefHmac: string;
  extractedAt: string;
  sourceRowCounts: Record<keyof typeof STAGE9_SOURCE_ALLOWLIST, number>;
  destinationEntityCounts: Record<string, number>;
  classificationCounts: {
    accepted: number;
    settlementIncluded: number;
    settlementExcluded: number;
    needsReviewLoaded: number;
    needsReviewUnloaded: number;
    excluded: number;
  };
  reviewReasonCounts: Record<string, number>;
  legacyEqualSettlementResidualCount: number;
  legacyEqualRoundingNormalizedCount: number;
  groupedFinancialTotals: {
    classification: "ACCEPTED" | "NEEDS_REVIEW";
    basis: "ORIGINAL" | "BASE";
    currency: string;
    scale: number;
    category: string;
    amountMinor: number;
  }[];
  legacySettlementTotals: {
    currency: string;
    scale: number;
    status: "suggested" | "confirmed" | "paid";
    amountMinor: number;
    rowCount: number;
  }[];
  pseudonymizationCounts: { journeys: number; members: number; expenseTitles: number };
  removedSensitiveValueCount: number;
  assetRowsExtracted: 0;
  assetPayloadsExtracted: 0;
  versions: {
    transform: typeof STAGE9_TRANSFORM_VERSION;
    mapping: typeof STAGE9_MAPPING_VERSION;
    allocation: typeof STAGE9_ALLOCATION_VERSION;
    normalization: typeof STAGE9_NORMALIZATION_VERSION;
    iso4217: typeof ISO_4217_METADATA_VERSION;
  };
  target: {
    projectRef: typeof STAGE9_TARGET_PROJECT_REF;
    journeyId: string;
    name: string;
  };
  transformedDatasetSha256: string;
  estimatedDevLoadBytes: number;
  financialChecksumHmac: string;
  privacyPassed: boolean;
  validation: {
    financialPassed: true;
    relationshipPassed: true;
    privacyPassed: true;
    deterministicIdsPassed: true;
    duplicateMappingPassed: true;
    normalizationEvidencePassed: true;
    acceptedSplitReconciliationPassed: true;
    draftIsolationPassed: true;
  };
};

export type Stage9RepoSafeSummary = Omit<
  Stage9PrivateApprovalManifest,
  | "sourceJourneyRefHmac"
  | "extractedAt"
  | "groupedFinancialTotals"
  | "legacySettlementTotals"
>;

export type Stage9TransformResult = {
  dataset: Stage9Dataset;
  unloadedReviews: { sourceRefHmac: string; reasonCodes: string[] }[];
  privateApprovalManifest: Stage9PrivateApprovalManifest;
  repoSafeSummary: Stage9RepoSafeSummary;
  privacyReport: Stage9PrivacyReport;
};

const categories = new Set([
  "flight",
  "hotel",
  "car",
  "fuel",
  "food",
  "ticket",
  "shopping",
  "transport",
  "insurance",
  "other",
]);

function sortedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortedObject(item)]),
    );
  }
  return value;
}

export function canonicalStage9Json(value: unknown): string {
  return JSON.stringify(sortedObject(value));
}

export function stage9Sha256(value: unknown): string {
  return createHash("sha256").update(canonicalStage9Json(value)).digest("hex");
}

function hmac(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function deterministicStage9Uuid(
  namespaceKey: string,
  entityType: string,
  sourceIdentity: string,
): string {
  const bytes = Buffer.from(
    hmac(namespaceKey, `${STAGE9_TRANSFORM_VERSION}|${entityType}|${sourceIdentity}`),
    "hex",
  ).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parsePositiveRate(value: string): boolean {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return false;
  return BigInt(match[1] + (match[2] ?? "")) > 0n;
}

function decimalToMinor(value: string, scale: number, allowZero: boolean): number {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("UNSAFE_OR_INEXACT_MONEY");
  const fraction = match[2] ?? "";
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new Error("UNSAFE_OR_INEXACT_MONEY");
  }
  const minor =
    BigInt(match[1]) * 10n ** BigInt(scale) +
    BigInt((fraction.slice(0, scale) + "0".repeat(scale)).slice(0, scale) || "0");
  const result = Number(minor);
  if (!Number.isSafeInteger(result)) throw new Error("OUT_OF_RANGE");
  if (result < 0 || (!allowZero && result === 0)) throw new Error("NON_POSITIVE_AMOUNT");
  return result;
}

export function decimalToMinorExact(value: string, scale: number): number {
  return decimalToMinor(value, scale, false);
}

function minorResult(value: string, currency: string, allowZero = false) {
  const scale = currencyScale(currency);
  if (scale === null) return { ok: false, reason: "UNKNOWN_CURRENCY_OR_SCALE" } as const;
  try {
    return {
      ok: true,
      minor: decimalToMinor(value, scale, allowZero),
      scale,
    } as const;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "UNSAFE_OR_INEXACT_MONEY",
    } as const;
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function scanValue(
  value: unknown,
  path: string,
  hits: Stage9PrivacyReport["hits"],
  options: { sourceIds: Set<string>; productionProjectRef: string },
) {
  if (typeof value === "string") {
    if (options.sourceIds.has(value)) hits.push({ code: "PRODUCTION_ID", path });
    if (options.productionProjectRef && value.includes(options.productionProjectRef))
      hits.push({ code: "PRODUCTION_PROJECT", path });
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) hits.push({ code: "EMAIL", path });
    if (/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(value))
      hits.push({ code: "TOKEN", path });
    if (/supabase\.(?:co|com).*storage|\/storage\/v1\//i.test(value))
      hits.push({ code: "STORAGE_PATH", path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, hits, options));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      /^(email|token|secret|notes?|description|address|latitude|longitude|coordinates|receipt|ocr|storagePath|providerPayload)$/i.test(
        key,
      )
    ) {
      hits.push({ code: "FORBIDDEN_FIELD", path: `${path}.${key}` });
    }
    scanValue(item, `${path}.${key}`, hits, options);
  }
}

export function scanStage9Privacy(
  value: unknown,
  options: { sourceIds?: string[]; productionProjectRef?: string } = {},
): Stage9PrivacyReport {
  const hits: Stage9PrivacyReport["hits"] = [];
  scanValue(value, "$", hits, {
    sourceIds: new Set(options.sourceIds ?? []),
    productionProjectRef: options.productionProjectRef ?? "",
  });
  return { passed: hits.length === 0, hits };
}

function sourceRowCounts(raw: LegacyExtract) {
  return {
    trips: raw.trips.length,
    journey_members: raw.journeyMembers.length,
    journey_ledgers: raw.journeyLedgers.length,
    ledger_entries: raw.ledgerEntries.length,
    ledger_entry_participants: raw.ledgerEntryParticipants.length,
    journey_exchange_rates: raw.journeyExchangeRates.length,
    ledger_settlements: raw.ledgerSettlements.length,
  };
}

function validateSourceScope(raw: LegacyExtract) {
  const journey = raw.sourceJourneyId;
  if (raw.trips[0].id !== journey || raw.journeyLedgers[0].journeyId !== journey)
    throw new Error("SOURCE_JOURNEY_SCOPE_MISMATCH");
  if (
    raw.journeyMembers.some((item) => item.tripId !== journey) ||
    raw.ledgerEntries.some((item) => item.journeyId !== journey) ||
    raw.journeyExchangeRates.some((item) => item.journeyId !== journey) ||
    raw.ledgerSettlements.some((item) => item.journeyId !== journey)
  ) {
    throw new Error("SOURCE_JOURNEY_SCOPE_MISMATCH");
  }
  const entryIds = new Set(raw.ledgerEntries.map((item) => item.id));
  if (raw.ledgerEntryParticipants.some((item) => !entryIds.has(item.ledgerEntryId)))
    throw new Error("SOURCE_CHILD_SCOPE_MISMATCH");
}

function validateMapping(raw: LegacyExtract, config: Stage9TransformConfig) {
  const sourceMemberIds = new Set(raw.journeyMembers.map((item) => item.id));
  const mapping = Object.entries(config.linkedUserBySourceMemberId);
  if (mapping.some(([sourceId]) => !sourceMemberIds.has(sourceId)))
    throw new Error("MAPPING_SOURCE_MEMBER_INVALID");
  if (unique(mapping.map(([, userId]) => userId)).length !== mapping.length)
    throw new Error("MAPPING_DEV_USER_REUSED");
  const mappedOwner = raw.journeyMembers.filter(
    (item) =>
      item.role === "owner" &&
      config.linkedUserBySourceMemberId[item.id] === config.devOperatorUserId,
  );
  if (mappedOwner.length !== 1) throw new Error("MAPPING_OWNER_REQUIRED");
}

function financialTotals(
  raw: LegacyExtract,
  classification: Map<string, "ACCEPTED" | "NEEDS_REVIEW">,
) {
  const totals = new Map<
    string,
    Stage9PrivateApprovalManifest["groupedFinancialTotals"][number]
  >();
  for (const entry of raw.ledgerEntries) {
    for (const [basis, value, currency] of [
      ["ORIGINAL", entry.originalAmount, entry.originalCurrency],
      ["BASE", entry.baseAmount, entry.baseCurrency],
    ] as const) {
      const money = minorResult(value, currency);
      if (!money.ok || !categories.has(entry.category)) continue;
      const group = {
        classification: classification.get(entry.id) ?? "NEEDS_REVIEW",
        basis,
        currency,
        scale: money.scale,
        category: entry.category,
        amountMinor: 0,
      } as Stage9PrivateApprovalManifest["groupedFinancialTotals"][number];
      const key = canonicalStage9Json({ ...group, amountMinor: undefined });
      const current = totals.get(key) ?? group;
      current.amountMinor += money.minor;
      if (!Number.isSafeInteger(current.amountMinor)) throw new Error("OUT_OF_RANGE");
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((left, right) =>
    canonicalStage9Json(left).localeCompare(canonicalStage9Json(right)),
  );
}

function settlementTotals(raw: LegacyExtract) {
  const totals = new Map<
    string,
    Stage9PrivateApprovalManifest["legacySettlementTotals"][number]
  >();
  for (const settlement of raw.ledgerSettlements) {
    const money = minorResult(settlement.amount, settlement.currency);
    if (!money.ok) continue;
    const group = {
      currency: settlement.currency.toUpperCase(),
      scale: money.scale,
      status: settlement.status,
      amountMinor: 0,
      rowCount: 0,
    };
    const key = canonicalStage9Json({
      currency: group.currency,
      scale: group.scale,
      status: group.status,
    });
    const current = totals.get(key) ?? group;
    current.amountMinor += money.minor;
    current.rowCount += 1;
    if (!Number.isSafeInteger(current.amountMinor)) throw new Error("OUT_OF_RANGE");
    totals.set(key, current);
  }
  return [...totals.values()].sort((left, right) =>
    canonicalStage9Json(left).localeCompare(canonicalStage9Json(right)),
  );
}

export function validateStage9Dataset(datasetInput: unknown): Stage9Dataset {
  const dataset = stage9DatasetSchema.parse(datasetInput);
  const memberIds = new Set(dataset.members.map((item) => item.id));
  const expenseIds = new Set(dataset.expenses.map((item) => item.id));
  if (
    memberIds.size !== dataset.members.length ||
    expenseIds.size !== dataset.expenses.length
  )
    throw new Error("DUPLICATE_DESTINATION_ID");
  if (
    dataset.members.filter(
      (item) => item.role === "owner" && item.userId === dataset.journey.createdByUserId,
    ).length !== 1
  ) {
    throw new Error("DESTINATION_OWNER_INVALID");
  }
  for (const expense of dataset.expenses) {
    if (!memberIds.has(expense.payerMemberId)) throw new Error("PAYER_NOT_IN_JOURNEY");
    if (
      expense.settlementParticipation !==
        (expense.importProvenance.legacyAccountingMode === "shared"
          ? "INCLUDED"
          : "EXCLUDED") ||
      expense.settlementParticipation !==
        expense.importProvenance.destinationSettlementParticipation
    ) {
      throw new Error("SETTLEMENT_PARTICIPATION_PROVENANCE_MISMATCH");
    }
    const participants = dataset.participants.filter(
      (item) => item.expenseId === expense.id,
    );
    if (participants.some((item) => !memberIds.has(item.memberId)))
      throw new Error("PARTICIPANT_NOT_IN_JOURNEY");
    const splits = dataset.splits.filter((item) => item.expenseId === expense.id);
    const valuation = dataset.valuations.filter((item) => item.expenseId === expense.id);
    if (
      expense.importProvenance.legacyEqualRoundingNormalization !== null &&
      expense.businessStatus !== "ACCEPTED"
    )
      throw new Error("NORMALIZED_EXPENSE_NOT_ACCEPTED");
    if (expense.businessStatus === "DRAFT") {
      if (splits.length || valuation.length) throw new Error("DRAFT_IS_AUTHORITATIVE");
      continue;
    }
    if (participants.length === 0 || splits.length !== participants.length)
      throw new Error("ACCEPTED_SPLIT_COUNT_INVALID");
    if (valuation.length !== 1) throw new Error("ACCEPTED_VALUATION_INVALID");
    if (
      splits.reduce((sum, item) => sum + item.originalAmountMinor, 0) !==
      expense.originalAmountMinor
    ) {
      throw new Error("ORIGINAL_SPLIT_MISMATCH");
    }
    if (
      splits.reduce((sum, item) => sum + item.settlementAmountMinor, 0) !==
      valuation[0].settlementAmountMinor
    ) {
      throw new Error("SETTLEMENT_SPLIT_MISMATCH");
    }
  }
  return dataset;
}

export function transformLegacyExtract(
  rawInput: unknown,
  configInput: unknown,
): Stage9TransformResult {
  const raw = legacyExtractSchema.parse(rawInput);
  const config = stage9TransformConfigSchema.parse(configInput);
  validateSourceScope(raw);
  validateMapping(raw, config);

  const namespace = config.namespaceKey;
  const sourceRef = (type: string, id: string) => hmac(namespace, `${type}|${id}`);
  const journeyId = deterministicStage9Uuid(namespace, "journey", raw.sourceJourneyId);
  const memberTokens = raw.journeyMembers
    .map((member) => ({ id: member.id, token: sourceRef("member", member.id) }))
    .sort((left, right) => left.token.localeCompare(right.token));
  const memberLabel = new Map(
    memberTokens.map((member, index) => [
      member.id,
      `Traveller ${String(index + 1).padStart(2, "0")}`,
    ]),
  );
  const memberId = new Map(
    raw.journeyMembers.map((member) => [
      member.id,
      deterministicStage9Uuid(namespace, "member", member.id),
    ]),
  );
  const members: Stage9Dataset["members"] = raw.journeyMembers
    .map((member) => {
      const userId = config.linkedUserBySourceMemberId[member.id] ?? null;
      return {
        id: memberId.get(member.id)!,
        userId,
        displayName: memberLabel.get(member.id)!,
        role: member.role,
        status: userId ? ("linked" as const) : ("unlinked" as const),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const ledger = raw.journeyLedgers[0];
  const settlementCurrency = ledger.baseCurrency.toUpperCase();
  const settlementScale = currencyScale(settlementCurrency);
  if (settlementScale === null) throw new Error("JOURNEY_CURRENCY_INVALID");

  const expenses: Stage9Dataset["expenses"] = [];
  const participants: Stage9Dataset["participants"] = [];
  const splits: Stage9Dataset["splits"] = [];
  const rateSnapshots: Stage9Dataset["rateSnapshots"] = [];
  const valuations: Stage9Dataset["valuations"] = [];
  const reviewFindings: Stage9Dataset["reviewFindings"] = [];
  const unloadedReviews: Stage9TransformResult["unloadedReviews"] = [];
  const classification = new Map<string, "ACCEPTED" | "NEEDS_REVIEW">();
  let legacyEqualSettlementResidualCount = 0;
  let legacyEqualRoundingNormalizedCount = 0;

  for (const entry of [...raw.ledgerEntries].sort((a, b) => a.id.localeCompare(b.id))) {
    const reasons: string[] = [];
    if (entry.status !== "complete") reasons.push("SOURCE_STATUS_NOT_COMPLETE");
    if (!categories.has(entry.category)) reasons.push("CATEGORY_INVALID");
    const originalCurrency = entry.originalCurrency.toUpperCase();
    const baseCurrency = entry.baseCurrency.toUpperCase();
    const original = minorResult(entry.originalAmount, originalCurrency);
    const base = minorResult(entry.baseAmount, baseCurrency);
    if (!original.ok) reasons.push(original.reason);
    if (!base.ok) reasons.push(base.reason);
    if (baseCurrency !== settlementCurrency) reasons.push("BASE_CURRENCY_MISMATCH");
    if (!parsePositiveRate(entry.exchangeRate))
      reasons.push("RATE_PAIR_OR_VALUE_INVALID");
    if (
      originalCurrency === baseCurrency &&
      entry.exchangeRate !== "1" &&
      !/^1\.0+$/.test(entry.exchangeRate)
    ) {
      reasons.push("RATE_PAIR_OR_VALUE_INVALID");
    }
    if (
      original.ok &&
      base.ok &&
      originalCurrency === baseCurrency &&
      original.minor !== base.minor
    ) {
      reasons.push("BASE_VALUE_MISMATCH");
    }
    const sourceParticipants = raw.ledgerEntryParticipants
      .filter((item) => item.ledgerEntryId === entry.id)
      .sort((left, right) =>
        (memberId.get(left.memberId) ?? "").localeCompare(
          memberId.get(right.memberId) ?? "",
        ),
      );
    const sourceParticipantIds = sourceParticipants.map((item) => item.memberId);
    if (unique(sourceParticipantIds).length !== sourceParticipantIds.length)
      reasons.push("DUPLICATE_PARTICIPANT");
    if (sourceParticipantIds.some((id) => !memberId.has(id)))
      reasons.push("MISSING_OR_INVALID_PARTICIPANT");
    if (sourceParticipants.length === 0) reasons.push("MISSING_OR_INVALID_PARTICIPANT");
    if (
      sourceParticipants.some((item) => item.splitMethod !== "equal") ||
      unique(sourceParticipants.map((item) => item.splitMethod)).length > 1
    ) {
      reasons.push("UNSUPPORTED_OR_MIXED_SPLIT_MODE");
    }
    const payerId = entry.payerMemberId ? memberId.get(entry.payerMemberId) : null;
    if (!payerId) reasons.push("MISSING_OR_INVALID_PAYER");

    const settlementShares: number[] = [];
    if (base.ok) {
      for (const participant of sourceParticipants) {
        if (participant.computedShareBaseAmount === null) {
          reasons.push("MISSING_COMPUTED_SHARE");
          continue;
        }
        const share = minorResult(
          participant.computedShareBaseAmount,
          baseCurrency,
          true,
        );
        if (share.ok) settlementShares.push(share.minor);
        else reasons.push(share.reason);
      }
      if (
        settlementShares.length === sourceParticipants.length &&
        settlementShares.reduce((sum, value) => sum + value, 0) !== base.minor
      ) {
        reasons.push("SETTLEMENT_SPLIT_MISMATCH");
        if (sourceParticipants.every((item) => item.splitMethod === "equal"))
          legacyEqualSettlementResidualCount += 1;
      }
    }
    const sourceReasonCodes = unique(reasons).sort();
    let normalizedLegacyEqualRounding = false;
    if (
      sourceReasonCodes.length === 1 &&
      sourceReasonCodes[0] === "SETTLEMENT_SPLIT_MISMATCH" &&
      original.ok &&
      base.ok &&
      payerId &&
      sourceParticipants.length > 0 &&
      sourceParticipants.every((item) => item.splitMethod === "equal") &&
      unique(sourceParticipantIds).length === sourceParticipantIds.length &&
      sourceParticipantIds.every((id) => memberId.has(id))
    ) {
      const legacyShare = Number(
        (Number(entry.baseAmount) / sourceParticipants.length).toFixed(2),
      );
      const legacyShareMinor = minorResult(legacyShare.toFixed(2), baseCurrency, true);
      const storedSharesMatchLegacyAlgorithm =
        Number.isFinite(legacyShare) &&
        sourceParticipants.every(
          (participant) =>
            participant.computedShareBaseAmount !== null &&
            Number(participant.computedShareBaseAmount) === legacyShare,
        );
      const residual =
        base.minor - settlementShares.reduce((sum, value) => sum + value, 0);
      normalizedLegacyEqualRounding =
        storedSharesMatchLegacyAlgorithm &&
        legacyShareMinor.ok &&
        residual !== 0 &&
        residual === base.minor - legacyShareMinor.minor * sourceParticipants.length;
      if (normalizedLegacyEqualRounding) legacyEqualRoundingNormalizedCount += 1;
    }
    const reasonCodes = normalizedLegacyEqualRounding ? [] : sourceReasonCodes;
    const structuralFailure = reasonCodes.some((reason) =>
      [
        "CATEGORY_INVALID",
        "MISSING_OR_INVALID_PAYER",
        "MISSING_OR_INVALID_PARTICIPANT",
        "DUPLICATE_PARTICIPANT",
        "UNKNOWN_CURRENCY_OR_SCALE",
        "UNSAFE_OR_INEXACT_MONEY",
        "NON_POSITIVE_AMOUNT",
        "OUT_OF_RANGE",
      ].includes(reason),
    );
    const accepted = reasonCodes.length === 0;
    classification.set(entry.id, accepted ? "ACCEPTED" : "NEEDS_REVIEW");
    const entryRef = sourceRef("expense", entry.id);
    if (structuralFailure || !original.ok || !payerId) {
      unloadedReviews.push({ sourceRefHmac: entryRef, reasonCodes });
      continue;
    }

    const expenseId = deterministicStage9Uuid(namespace, "expense", entry.id);
    const sourceStoredSharesEvidence = sourceParticipants.map((participant) => ({
      memberRefHmac: sourceRef("member", participant.memberId),
      splitMethod: participant.splitMethod,
      computedShareBaseAmount: participant.computedShareBaseAmount,
    }));
    const provenanceWithoutHash = {
      sourceRefHmac: entryRef,
      transformVersion: STAGE9_TRANSFORM_VERSION as typeof STAGE9_TRANSFORM_VERSION,
      mappingVersion: STAGE9_MAPPING_VERSION as typeof STAGE9_MAPPING_VERSION,
      iso4217Version: ISO_4217_METADATA_VERSION as typeof ISO_4217_METADATA_VERSION,
      legacyAccountingMode: entry.accountingMode,
      destinationSettlementParticipation:
        entry.accountingMode === "shared" ? ("INCLUDED" as const) : ("EXCLUDED" as const),
      legacyStatus: entry.status,
      occurredPrecision: "DATE" as const,
      startDate: entry.startDate,
      endDate: entry.endDate,
      legacyEqualRoundingNormalization: normalizedLegacyEqualRounding
        ? {
            normalizationVersion: STAGE9_NORMALIZATION_VERSION,
            sourceSplitIntent: "LEGACY_EQUAL" as const,
            sourceAlgorithm: "INDEPENDENT_JS_NUMBER_TO_FIXED_2_PER_PARTICIPANT" as const,
            sourceStoredShares: "HISTORICAL_EVIDENCE" as const,
            sourceStoredSharesEvidenceSha256: stage9Sha256(sourceStoredSharesEvidence),
            destinationAllocationVersion: STAGE9_ALLOCATION_VERSION,
            residualAssignment: "LEDGER_2_0_MIGRATION_NORMALIZATION" as const,
            destinationParticipantAmountsHistorical: false as const,
          }
        : null,
    };
    const expense: Stage9Dataset["expenses"][number] = {
      id: expenseId,
      payerMemberId: payerId,
      title: `Imported ${entry.category} ${entryRef.slice(0, 8)}`,
      category: entry.category,
      occurredAt: `${entry.expenseDate}T00:00:00.000Z`,
      originalAmountMinor: original.minor,
      originalCurrency,
      originalScale: original.scale,
      businessStatus: accepted ? ("ACCEPTED" as const) : ("DRAFT" as const),
      settlementParticipation:
        entry.accountingMode === "shared" ? "INCLUDED" : "EXCLUDED",
      importProvenance: {
        ...provenanceWithoutHash,
        aggregatePayloadHash: stage9Sha256({
          entry: provenanceWithoutHash,
          payerMemberId: payerId,
          participantEvidence: sourceStoredSharesEvidence,
        }),
      },
    };
    expenses.push(expense);
    sourceParticipants.forEach((participant, index) => {
      participants.push({
        expenseId,
        memberId: memberId.get(participant.memberId)!,
        displayNameSnapshot: memberLabel.get(participant.memberId)!,
        displayOrder: index,
      });
    });
    if (!accepted) {
      const findingId = deterministicStage9Uuid(namespace, "review-finding", entry.id);
      reviewFindings.push({
        id: findingId,
        expenseId,
        findingType: "IMPORT_NEEDS_REVIEW",
        evidenceCodes: reasonCodes,
        rulesetVersion: STAGE9_TRANSFORM_VERSION,
      });
      continue;
    }
    if (!base.ok) throw new Error("ACCEPTED_BASE_AMOUNT_REQUIRED");

    const allocatedSplits = allocateEqual(
      original.minor,
      normalizedLegacyEqualRounding ? base.minor : null,
      sourceParticipants.map((item) => memberId.get(item.memberId)!),
    );
    sourceParticipants.forEach((participant, index) => {
      const settlementAmountMinor = normalizedLegacyEqualRounding
        ? allocatedSplits[index]!.settlementMinor!
        : settlementShares[index]!;
      const roundingAdjustmentMinor = normalizedLegacyEqualRounding
        ? settlementAmountMinor - settlementShares[index]!
        : 0;
      if (Math.abs(roundingAdjustmentMinor) > 1)
        throw new Error("NORMALIZATION_ADJUSTMENT_OUT_OF_RANGE");
      splits.push({
        expenseId,
        memberId: memberId.get(participant.memberId)!,
        method: "EQUAL_PERSON",
        originalAmountMinor: allocatedSplits[index]!.originalMinor,
        settlementAmountMinor,
        roundingAdjustmentMinor,
      });
    });
    const rateSnapshotId = deterministicStage9Uuid(namespace, "rate-snapshot", entry.id);
    const valuationId = deterministicStage9Uuid(namespace, "valuation", entry.id);
    rateSnapshots.push({
      id: rateSnapshotId,
      expenseId,
      baseCurrency,
      quoteCurrency: originalCurrency,
      decimalRate: entry.exchangeRate,
      effectiveDate: entry.exchangeRateDate ?? entry.expenseDate,
      sourceRefHmac: entryRef,
    });
    valuations.push({
      id: valuationId,
      expenseId,
      originalAmountMinor: original.minor,
      originalCurrency,
      originalScale: original.scale,
      settlementAmountMinor: base.minor,
      settlementCurrency: baseCurrency,
      settlementScale: base.scale,
      rateSnapshotId,
      decimalRate: entry.exchangeRate,
      effectiveAt: `${entry.exchangeRateDate ?? entry.expenseDate}T00:00:00.000Z`,
      policy: "LEGACY_IMPORTED",
    });
  }

  const dataset = validateStage9Dataset({
    transformVersion: STAGE9_TRANSFORM_VERSION,
    mappingVersion: STAGE9_MAPPING_VERSION,
    allocationVersion: STAGE9_ALLOCATION_VERSION,
    normalizationVersion: STAGE9_NORMALIZATION_VERSION,
    iso4217Version: ISO_4217_METADATA_VERSION,
    targetProjectRef: STAGE9_TARGET_PROJECT_REF,
    journey: {
      id: journeyId,
      name: STAGE9_JOURNEY_NAME,
      startDate: raw.trips[0].startDate,
      endDate: raw.trips[0].endDate,
      createdByUserId: config.devOperatorUserId,
    },
    settings: {
      settlementCurrency,
      settlementScale,
      valuationPolicy: "MANUAL_AGREED",
    },
    members,
    expenses,
    participants,
    splits,
    rateSnapshots,
    valuations,
    reviewFindings,
  });
  if (
    dataset.expenses.filter(
      (expense) => expense.importProvenance.legacyEqualRoundingNormalization !== null,
    ).length !== legacyEqualRoundingNormalizedCount
  )
    throw new Error("NORMALIZATION_PROVENANCE_COUNT_MISMATCH");
  const sourceIds = [
    raw.sourceJourneyId,
    ...raw.journeyMembers.map((item) => item.id),
    ...raw.ledgerEntries.map((item) => item.id),
    ...raw.ledgerSettlements.flatMap((item) => [
      item.id,
      item.fromMemberId,
      item.toMemberId,
    ]),
  ];
  const privacyReport = scanStage9Privacy(dataset, {
    sourceIds,
    productionProjectRef: raw.sourceProjectRef,
  });
  if (!privacyReport.passed) throw new Error("STAGE9_PRIVACY_REJECTED");

  const groupedFinancialTotals = financialTotals(raw, classification);
  const legacySettlementTotals = settlementTotals(raw);
  const transformedDatasetSha256 = stage9Sha256(dataset);
  const destinationEntityCounts = {
    journeys: 1,
    members: members.length,
    expenses: expenses.length,
    participants: participants.length,
    splits: splits.length,
    rateSnapshots: rateSnapshots.length,
    valuations: valuations.length,
    reviewFindings: reviewFindings.length,
  };
  const classificationCounts = {
    accepted: expenses.filter((item) => item.businessStatus === "ACCEPTED").length,
    settlementIncluded: expenses.filter(
      (item) =>
        item.businessStatus === "ACCEPTED" && item.settlementParticipation === "INCLUDED",
    ).length,
    settlementExcluded: expenses.filter(
      (item) =>
        item.businessStatus === "ACCEPTED" && item.settlementParticipation === "EXCLUDED",
    ).length,
    needsReviewLoaded: expenses.filter((item) => item.businessStatus === "DRAFT").length,
    needsReviewUnloaded: unloadedReviews.length,
    excluded: raw.ledgerSettlements.length,
  };
  const reviewReasonCounts = [...reviewFindings, ...unloadedReviews].reduce<
    Record<string, number>
  >((counts, item) => {
    const reasonCodes = "evidenceCodes" in item ? item.evidenceCodes : item.reasonCodes;
    for (const reason of reasonCodes) counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
  const privateApprovalManifest: Stage9PrivateApprovalManifest = {
    manifestVersion: STAGE9_MANIFEST_VERSION,
    state:
      raw.sourceEnvironment === "Synthetic" ? "SYNTHETIC_VALIDATED" : "PRELOAD_VALIDATED",
    sourceJourneyRefHmac: sourceRef("journey", raw.sourceJourneyId),
    extractedAt: raw.extractedAt,
    sourceRowCounts: sourceRowCounts(raw),
    destinationEntityCounts,
    classificationCounts,
    reviewReasonCounts: Object.fromEntries(
      Object.entries(reviewReasonCounts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    legacyEqualSettlementResidualCount,
    legacyEqualRoundingNormalizedCount,
    groupedFinancialTotals,
    legacySettlementTotals,
    pseudonymizationCounts: {
      journeys: 1,
      members: members.length,
      expenseTitles: expenses.length,
    },
    removedSensitiveValueCount: Object.values(raw.redactionPresenceCounts).reduce(
      (sum, value) => sum + value,
      0,
    ),
    assetRowsExtracted: 0,
    assetPayloadsExtracted: 0,
    versions: {
      transform: STAGE9_TRANSFORM_VERSION,
      mapping: STAGE9_MAPPING_VERSION,
      allocation: STAGE9_ALLOCATION_VERSION,
      normalization: STAGE9_NORMALIZATION_VERSION,
      iso4217: ISO_4217_METADATA_VERSION,
    },
    target: {
      projectRef: STAGE9_TARGET_PROJECT_REF,
      journeyId,
      name: STAGE9_JOURNEY_NAME,
    },
    transformedDatasetSha256,
    estimatedDevLoadBytes: Buffer.byteLength(canonicalStage9Json(dataset)),
    financialChecksumHmac: hmac(
      namespace,
      canonicalStage9Json({ groupedFinancialTotals, legacySettlementTotals }),
    ),
    privacyPassed: true,
    validation: {
      financialPassed: true,
      relationshipPassed: true,
      privacyPassed: true,
      deterministicIdsPassed: true,
      duplicateMappingPassed: true,
      normalizationEvidencePassed: true,
      acceptedSplitReconciliationPassed: true,
      draftIsolationPassed: true,
    },
  };
  const {
    sourceJourneyRefHmac: _sourceJourneyRefHmac,
    extractedAt: _extractedAt,
    groupedFinancialTotals: _groupedFinancialTotals,
    legacySettlementTotals: _legacySettlementTotals,
    ...repoSafeSummary
  } = privateApprovalManifest;
  return {
    dataset,
    unloadedReviews,
    privateApprovalManifest,
    repoSafeSummary,
    privacyReport,
  };
}
