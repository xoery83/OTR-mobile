import type { ReportingScope } from "@/domain/ledger/reporting";

export function formatLedgerMoney(minor: number, currency: string, scale: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(minor / 10 ** scale);
}

export function formatLedgerRate(rate: string) {
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(
    Number(rate),
  );
}

const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarDate(value: string) {
  const match = dateOnly.exec(value.slice(0, 10));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayNumber(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}

export function formatLedgerDate(value: string, now = new Date()) {
  const date = calendarDate(value);
  if (!date) return "Unknown date";
  const difference = dayNumber(date) - dayNumber(now);
  if (difference === 0) return "Today";
  if (difference === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

export function formatLedgerDateRange(
  start: string | null,
  end: string | null,
  now = new Date(),
) {
  if (!start && !end) return "Dates not set";
  if (!start) return `Until ${formatLedgerDate(end!, now)}`;
  if (!end || end === start) return formatLedgerDate(start, now);
  return `${formatLedgerDate(start, now)} – ${formatLedgerDate(end, now)}`;
}

export function formatLedgerDateFilter(from?: string, to?: string) {
  if (!from) return "Any date";
  const start = calendarDate(from);
  if (!start) return "Unknown date";
  const end = to ? calendarDate(to) : null;
  const exactDate = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(value);
  if (start && end && dayNumber(end) - dayNumber(start) === 1) return exactDate(start);
  return end
    ? `${exactDate(start)} – ${exactDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1))}`
    : `From ${exactDate(start)}`;
}

export function ledgerExpenseAttention(
  expense: {
    businessStatus: string;
    componentMinor: number | null;
    hasOpenConflict: boolean;
    isAuthoritative: boolean;
  },
  scope: ReportingScope,
) {
  if (expense.hasOpenConflict) return "Conflict—review required";
  if (expense.businessStatus === "RATE_REQUIRED") return null;
  if (scope === "MINE" && expense.componentMinor === null) return "Not in your share";
  return expense.isAuthoritative ? null : "Not included in totals";
}

export function formatValuationPolicy(policy: string) {
  if (policy === "MANUAL_AGREED") return "Agreed exchange rate";
  if (policy === "REFERENCE_RATE") return "Reference exchange rate";
  if (policy === "ACTUAL_PAYER_COST") return "Payer's actual cost";
  if (policy === "SAME_CURRENCY") return "Same currency";
  return "Imported exchange rate";
}
