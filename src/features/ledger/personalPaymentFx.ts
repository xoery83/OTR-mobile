import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import { currencyScale } from "@/domain/ledger/currency";
import { convertMoneyWithCrossRate } from "@/domain/ledger/money";
import type { RateQuote } from "@/domain/ledger/types";

export type PersonalPaymentReference = {
  quote: RateQuote;
  kind: "REQUESTED_DATE" | "NEAR_DATE" | "HISTORICAL";
};

export type SnapshotMatch =
  "EXACT_DATE" | "PREVIOUS_WORKING_DAY" | "STALE_DATE" | "ROUGH_LATEST" | "NO_MATCH";

export type SnapshotSelection = {
  match: SnapshotMatch;
  snapshot: FxReferenceSnapshot | null;
  economicDistanceDays: number | null;
};

export type FxReferenceSnapshot = {
  referenceDate: string;
  rates: Record<string, string>;
  observedAt: string;
  expiresAt: string;
};

export type FxReferenceSnapshotBundle = {
  snapshots: FxReferenceSnapshot[];
};

export type PersonalPaymentComparable = {
  money: { minor: number; currency: string; scale: number };
  source: "ORIGINAL" | "CONFIRMED_EQUIVALENT" | "LOCAL_ECB_SNAPSHOT";
  estimate: null | {
    referenceDate: string;
    observedAt: string;
    match: Exclude<SnapshotMatch, "NO_MATCH">;
    economicDistanceDays: number;
  };
};

export function bestSnapshotForEconomicDate(
  snapshots: FxReferenceSnapshot[],
  economicDate: string,
  today: string,
): SnapshotSelection {
  const eligible = snapshots
    .filter((snapshot) => snapshot.referenceDate <= today)
    .sort((left, right) => right.referenceDate.localeCompare(left.referenceDate));
  const exact = eligible.find((snapshot) => snapshot.referenceDate === economicDate);
  if (exact) return { match: "EXACT_DATE", snapshot: exact, economicDistanceDays: 0 };
  const previous = eligible.find((snapshot) => snapshot.referenceDate < economicDate);
  if (previous) {
    const distance = daysBetween(previous.referenceDate, economicDate);
    if (distance <= 7)
      return {
        match: "PREVIOUS_WORKING_DAY",
        snapshot: previous,
        economicDistanceDays: distance,
      };
    if (distance <= 30)
      return {
        match: "STALE_DATE",
        snapshot: previous,
        economicDistanceDays: distance,
      };
  }
  const age = daysBetween(economicDate, today);
  if (!previous && age >= 0 && age <= 7 && eligible[0])
    return {
      match: "ROUGH_LATEST",
      snapshot: eligible[0],
      economicDistanceDays: Math.abs(
        daysBetween(eligible[0].referenceDate, economicDate),
      ),
    };
  return { match: "NO_MATCH", snapshot: null, economicDistanceDays: null };
}

export function personalPaymentComparable(
  record: LocalPersonalPayment,
  targetCurrency: string,
  targetScale: number,
  bundle: FxReferenceSnapshotBundle | null,
  today: string,
): PersonalPaymentComparable | null {
  if (record.currency === targetCurrency)
    return {
      money: {
        minor: rescaleMinor(record.amountMinor, record.scale, targetScale),
        currency: targetCurrency,
        scale: targetScale,
      },
      source: "ORIGINAL",
      estimate: null,
    };
  if (
    record.recordedEquivalentCurrency === targetCurrency &&
    record.recordedEquivalentMinor != null &&
    record.recordedEquivalentScale != null
  )
    return {
      money: {
        minor: rescaleMinor(
          record.recordedEquivalentMinor,
          record.recordedEquivalentScale,
          targetScale,
        ),
        currency: targetCurrency,
        scale: targetScale,
      },
      source: "CONFIRMED_EQUIVALENT",
      estimate: null,
    };
  if (!bundle || currencyScale(record.currency) !== record.scale) return null;
  const selected = bestSnapshotForEconomicDate(
    bundle.snapshots,
    record.occurredAt.slice(0, 10),
    today,
  );
  const snapshot = selected.snapshot;
  const sourceRate = snapshot?.rates[record.currency];
  const targetRate = snapshot?.rates[targetCurrency];
  if (
    !snapshot ||
    !sourceRate ||
    !targetRate ||
    selected.match === "NO_MATCH" ||
    selected.economicDistanceDays === null
  )
    return null;
  return {
    money: convertMoneyWithCrossRate(
      { minor: record.amountMinor, currency: record.currency, scale: record.scale },
      targetCurrency,
      targetScale,
      sourceRate,
      targetRate,
    ),
    source: "LOCAL_ECB_SNAPSHOT",
    estimate: {
      referenceDate: snapshot.referenceDate,
      observedAt: snapshot.observedAt,
      match: selected.match,
      economicDistanceDays: selected.economicDistanceDays,
    },
  };
}

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

function rescaleMinor(minor: number, fromScale: number, toScale: number) {
  const difference = toScale - fromScale;
  const result =
    difference >= 0
      ? BigInt(minor) * 10n ** BigInt(difference)
      : BigInt(minor) / 10n ** BigInt(-difference);
  const value = Number(result);
  if (!Number.isSafeInteger(value))
    throw new Error("Rescaled amount exceeds safe range.");
  return value;
}
