import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type { ReportingFilters } from "@/domain/ledger/reporting";

export type LedgerDatePreset =
  "ANY" | "TODAY" | "YESTERDAY" | "TRIP" | "LAST_30" | "EXACT" | "RANGE";

const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarDay(value: string) {
  const match = dateOnly.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function localDay(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number) {
  const date = calendarDay(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

function bounds(from: string, inclusiveTo: string) {
  const to = addDays(inclusiveTo, 1);
  return calendarDay(from) && to && from <= inclusiveTo
    ? { from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z` }
    : null;
}

export function ledgerDateFilter(
  preset: LedgerDatePreset,
  journey: Pick<LedgerJourneyContext, "startDate" | "endDate"> | null,
  exact: string,
  rangeStart: string,
  rangeEnd: string,
  now = new Date(),
): Pick<ReportingFilters, "from" | "to"> | null {
  const today = localDay(now);
  if (preset === "ANY") return {};
  if (preset === "TODAY") return bounds(today, today);
  if (preset === "YESTERDAY") {
    const yesterday = addDays(today, -1)!;
    return bounds(yesterday, yesterday);
  }
  if (preset === "LAST_30") return bounds(addDays(today, -29)!, today);
  if (preset === "EXACT") return bounds(exact, exact);
  if (preset === "RANGE") return bounds(rangeStart, rangeEnd);
  if (!journey?.startDate || !journey.endDate) return null;
  return bounds(journey.startDate.slice(0, 10), journey.endDate.slice(0, 10));
}

export function countLedgerFilters(filters: ReportingFilters) {
  return [
    filters.from,
    filters.category,
    filters.payerMemberId,
    filters.participantMemberId,
    filters.currency,
    filters.valuation,
    filters.conflict,
  ].filter(Boolean).length;
}

export function formatExpenseCount(count: number) {
  return `${count} ${count === 1 ? "Expense" : "Expenses"}`;
}
