import type { RateQuote } from "@/domain/ledger/types";

export type PersonalPaymentReference = {
  quote: RateQuote;
  kind: "REQUESTED_DATE" | "NEAR_DATE" | "HISTORICAL";
};

export function selectPersonalPaymentReference(
  quotes: RateQuote[],
  requestedDate: string,
): PersonalPaymentReference | null {
  const eligible = quotes
    .filter((quote) => quote.referenceDate && quote.referenceDate <= requestedDate)
    .sort((left, right) => right.referenceDate!.localeCompare(left.referenceDate!));
  const exact = eligible.find(
    (quote) =>
      quote.economicDate === requestedDate || quote.referenceDate === requestedDate,
  );
  if (exact) return { quote: exact, kind: "REQUESTED_DATE" };
  const near = eligible.find(
    (quote) => daysBetween(quote.referenceDate!, requestedDate) <= 7,
  );
  if (near) return { quote: near, kind: "NEAR_DATE" };
  return eligible[0] ? { quote: eligible[0], kind: "HISTORICAL" } : null;
}

function daysBetween(earlier: string, later: string) {
  return (
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000
  );
}
