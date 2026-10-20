import { t, getFormatLocale } from "@/ui/locale";
import type { ReportingScope } from "@/domain/ledger/reporting";

// Formatting and visual parts share the same locale and precision policy.
function ledgerMoneyFormatter(
  currency: string,
  scale: number,
  locale?: string | string[],
) {
  return new Intl.NumberFormat(locale ?? getFormatLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
}

export function formatLedgerMoney(
  minor: number,
  currency: string,
  scale: number,
  locale?: string | string[],
) {
  return ledgerMoneyFormatter(currency, scale, locale).format(minor / 10 ** scale);
}

export function ledgerMoneyParts(
  minor: number,
  currency: string,
  scale: number,
  locale?: string | string[],
) {
  const formatter = ledgerMoneyFormatter(currency, scale, locale);
  const amount = minor / 10 ** scale;
  if (typeof formatter.formatToParts === "function")
    return formatter.formatToParts(amount);

  // iOS Hermes lacks formatToParts. Slice only the canonical display string;
  // the same formatter's zero supplies its decimal separator, not a locale map.
  const value = formatter.format(amount);
  const zero = formatter.format(0);
  const zeroDigits = [...zero.matchAll(/\p{Decimal_Number}+/gu)];
  const firstZero = zeroDigits[0];
  const lastZero = zeroDigits[zeroDigits.length - 1];
  const symbol =
    firstZero && lastZero
      ? (
          zero.slice(0, firstZero.index) + zero.slice(lastZero.index + lastZero[0].length)
        ).replace(/^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu, "")
      : "";
  const decimal =
    scale > 0 && zeroDigits.length === 2
      ? zero.slice(zeroDigits[0].index + zeroDigits[0][0].length, zeroDigits[1].index)
      : null;
  const chunks = value.match(/\p{Decimal_Number}+|[^\p{Decimal_Number}]+/gu) ?? [];
  const isDigits = (chunk: string) => /^\p{Decimal_Number}+$/u.test(chunk);
  const first = chunks.findIndex(isDigits);
  const last = chunks.map(isDigits).lastIndexOf(true);
  const affixParts = (text: string): Intl.NumberFormatPart[] =>
    text
      .split(/([\s\p{Cf}]+|[-+\u2212])/u)
      .filter(Boolean)
      .map((value) => ({
        type: /^[\s\p{Cf}]+$/u.test(value)
          ? "literal"
          : /^[-\u2212]$/u.test(value)
            ? "minusSign"
            : value === "+"
              ? "plusSign"
              : "currency",
        value,
      }));
  return chunks.flatMap<Intl.NumberFormatPart>((chunk, index) => {
    if (isDigits(chunk))
      return [
        {
          type: index > first && chunks[index - 1] === decimal ? "fraction" : "integer",
          value: chunk,
        },
      ];
    if (index > first && index < last)
      return [{ type: chunk === decimal ? "decimal" : "group", value: chunk }];
    const symbolIndex = symbol ? chunk.indexOf(symbol) : -1;
    return symbolIndex < 0
      ? affixParts(chunk)
      : [
          ...affixParts(chunk.slice(0, symbolIndex)),
          { type: "currency", value: symbol },
          ...affixParts(chunk.slice(symbolIndex + symbol.length)),
        ];
  });
}

export function formatLedgerRate(rate: string) {
  return new Intl.NumberFormat(getFormatLocale(), { maximumSignificantDigits: 6 }).format(
    Number(rate),
  );
}

export function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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
  if (!date) return t("format.unknownDate");
  const difference = dayNumber(date) - dayNumber(now);
  if (difference === 0) return t("search.today");
  if (difference === -1) return t("search.yesterday");
  return new Intl.DateTimeFormat(getFormatLocale(), {
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
  if (!start && !end) return t("format.datesUnset");
  if (!start) return t("format.until", { date: formatLedgerDate(end!, now) });
  if (!end || end === start) return formatLedgerDate(start, now);
  return t("format.range", {
    start: formatLedgerDate(start, now),
    end: formatLedgerDate(end, now),
  });
}

export function formatLedgerDateFilter(from?: string, to?: string) {
  if (!from) return t("format.anyDate");
  const start = calendarDate(from);
  if (!start) return t("format.unknownDate");
  const end = to ? calendarDate(to) : null;
  const exactDate = (value: Date) =>
    new Intl.DateTimeFormat(getFormatLocale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(value);
  if (start && end && dayNumber(end) - dayNumber(start) === 1) return exactDate(start);
  return end
    ? t("format.range", {
        start: exactDate(start),
        end: exactDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)),
      })
    : t("format.from", { date: exactDate(start) });
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
  if (expense.hasOpenConflict) return t("expense.reviewChanges");
  if (expense.businessStatus === "RATE_REQUIRED") return null;
  if (scope === "MINE" && expense.componentMinor === null)
    return t("expense.notYourShare");
  return expense.isAuthoritative ? null : t("expense.notIncluded");
}

export function formatValuationPolicy(policy: string) {
  if (policy === "MANUAL_AGREED") return t("format.agreedRate");
  if (policy === "REFERENCE_RATE") return t("format.referenceRate");
  if (policy === "ACTUAL_PAYER_COST") return t("format.actualCost");
  if (policy === "SAME_CURRENCY") return t("format.sameCurrency");
  return t("format.importedRate");
}
