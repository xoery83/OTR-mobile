export type ReportingScope = "MINE" | "GROUP";
export type ReportingDimension =
  "CATEGORY" | "DAY" | "PAYER" | "PARTICIPANT" | "CURRENCY";

export type ReportingFilters = {
  from?: string;
  to?: string;
  query?: string;
  category?: string;
  payerMemberId?: string;
  participantMemberId?: string;
  currency?: string;
  businessStatus?: string;
  syncStatus?: string;
  conflict?: "OPEN" | "NONE";
  valuation?: "VALUED" | "RATE_REQUIRED";
  receipt?: "HAS" | "HAS_NOT";
};

export type ReportingRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  occurredAt: string;
  payerMemberId: string;
  payerName: string;
  originalMinor: number;
  originalCurrency: string;
  businessStatus: string;
  settlementParticipation: "INCLUDED" | "EXCLUDED";
  syncStatus: string;
  settlementMinor: number | null;
  settlementCurrency: string;
  hasOpenConflict: boolean;
  hasReceipt: boolean;
  splits: { memberId: string; memberName: string; settlementMinor: number | null }[];
};

export type ReportingAggregate = {
  totalMinor: number;
  expenseCount: number;
  includedExpenseIds: string[];
  unresolvedRateCount: number;
  openConflictCount: number;
};

export type ReportingBucket = ReportingAggregate & { key: string; label: string };

function sqliteLower(value: string) {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export function isAuthoritative(record: ReportingRecord) {
  return (
    record.businessStatus === "ACCEPTED" &&
    record.settlementMinor !== null &&
    !record.hasOpenConflict
  );
}

export function matchesReportingFilters(
  record: ReportingRecord,
  filters: ReportingFilters,
) {
  const needle = filters.query ? sqliteLower(filters.query.trim()) : undefined;
  return (
    (!filters.from || record.occurredAt >= filters.from) &&
    (!filters.to || record.occurredAt < filters.to) &&
    (!needle ||
      sqliteLower(
        [
          record.title,
          record.description ?? "",
          record.category,
          record.payerName,
          ...record.splits.map((split) => split.memberName),
        ].join(" "),
      ).includes(needle)) &&
    (!filters.category || record.category === filters.category) &&
    (!filters.payerMemberId || record.payerMemberId === filters.payerMemberId) &&
    (!filters.participantMemberId ||
      record.splits.some((split) => split.memberId === filters.participantMemberId)) &&
    (!filters.currency || record.originalCurrency === filters.currency) &&
    (filters.businessStatus
      ? record.businessStatus === filters.businessStatus
      : record.businessStatus !== "DELETED") &&
    (!filters.syncStatus || record.syncStatus === filters.syncStatus) &&
    (!filters.conflict || (filters.conflict === "OPEN") === record.hasOpenConflict) &&
    (!filters.valuation ||
      (filters.valuation === "RATE_REQUIRED"
        ? record.businessStatus === "RATE_REQUIRED"
        : record.settlementMinor !== null)) &&
    (!filters.receipt || (filters.receipt === "HAS") === record.hasReceipt)
  );
}

export function summarizeReporting(
  records: ReportingRecord[],
  scope: ReportingScope,
  memberId: string,
  filters: ReportingFilters = {},
): ReportingAggregate {
  const filtered = records.filter((record) => matchesReportingFilters(record, filters));
  const relevant = filtered.filter(
    (record) =>
      scope === "GROUP" || record.splits.some((split) => split.memberId === memberId),
  );
  const components = relevant.flatMap((record) => {
    if (!isAuthoritative(record)) return [];
    const minor =
      scope === "GROUP"
        ? record.settlementMinor!
        : record.splits.find((split) => split.memberId === memberId)?.settlementMinor;
    return minor === null || minor === undefined ? [] : [{ id: record.id, minor }];
  });
  return {
    totalMinor: components.reduce((sum, component) => sum + component.minor, 0),
    expenseCount: components.length,
    includedExpenseIds: components.map((component) => component.id).sort(),
    unresolvedRateCount: relevant.filter(
      (record) => record.businessStatus === "RATE_REQUIRED",
    ).length,
    openConflictCount: relevant.filter((record) => record.hasOpenConflict).length,
  };
}

export function analyzeReporting(
  records: ReportingRecord[],
  dimension: ReportingDimension,
  scope: ReportingScope,
  memberId: string,
  filters: ReportingFilters = {},
): ReportingBucket[] {
  const filtered = records.filter(
    (record) => matchesReportingFilters(record, filters) && isAuthoritative(record),
  );
  const buckets = new Map<
    string,
    { label: string; parts: { id: string; minor: number }[] }
  >();
  const add = (key: string, label: string, id: string, minor: number | null) => {
    if (minor === null) return;
    const bucket = buckets.get(key) ?? { label, parts: [] };
    bucket.parts.push({ id, minor });
    buckets.set(key, bucket);
  };

  for (const record of filtered) {
    const own = record.splits.find(
      (split) => split.memberId === memberId,
    )?.settlementMinor;
    const amount = scope === "GROUP" ? record.settlementMinor : own;
    if (amount === null || amount === undefined) continue;
    if (dimension === "CATEGORY")
      add(record.category, record.category, record.id, amount);
    if (dimension === "DAY")
      add(
        record.occurredAt.slice(0, 10),
        record.occurredAt.slice(0, 10),
        record.id,
        amount,
      );
    if (dimension === "PAYER")
      add(record.payerMemberId, record.payerName, record.id, amount);
    if (dimension === "CURRENCY")
      add(record.originalCurrency, record.originalCurrency, record.id, amount);
    if (dimension === "PARTICIPANT") {
      if (scope === "MINE") {
        const split = record.splits.find((item) => item.memberId === memberId);
        if (split)
          add(split.memberId, split.memberName, record.id, split.settlementMinor);
      } else {
        for (const split of record.splits)
          add(split.memberId, split.memberName, record.id, split.settlementMinor);
      }
    }
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      totalMinor: bucket.parts.reduce((sum, part) => sum + part.minor, 0),
      expenseCount: new Set(bucket.parts.map((part) => part.id)).size,
      includedExpenseIds: [...new Set(bucket.parts.map((part) => part.id))].sort(),
      unresolvedRateCount: 0,
      openConflictCount: 0,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor || a.label.localeCompare(b.label));
}
