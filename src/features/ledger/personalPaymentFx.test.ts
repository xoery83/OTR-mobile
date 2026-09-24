import { describe, expect, it } from "vitest";

import type { RateQuote } from "@/domain/ledger/types";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import {
  bestSnapshotForEconomicDate,
  personalPaymentComparable,
  selectPersonalPaymentReference,
  type FxReferenceSnapshotBundle,
} from "./personalPaymentFx";

const quote = (date: string, id = date) => ({ id, referenceDate: date }) as RateQuote;

describe("selectPersonalPaymentReference", () => {
  it("prefers requested date, then nearby, then historical without using the future", () => {
    expect(
      selectPersonalPaymentReference(
        [quote("2026-09-20"), quote("2026-09-18"), quote("2026-08-01")],
        "2026-09-20",
      )?.kind,
    ).toBe("REQUESTED_DATE");
    expect(
      selectPersonalPaymentReference(
        [
          {
            ...quote("2026-09-18", "weekend-request"),
            economicDate: "2026-09-20",
          },
        ],
        "2026-09-20",
      ),
    ).toMatchObject({
      kind: "REQUESTED_DATE",
      quote: { referenceDate: "2026-09-18" },
    });
    expect(
      selectPersonalPaymentReference(
        [quote("2026-09-21", "future"), quote("2026-09-18")],
        "2026-09-20",
      ),
    ).toMatchObject({ kind: "NEAR_DATE", quote: { referenceDate: "2026-09-18" } });
    expect(
      selectPersonalPaymentReference([quote("2026-08-01")], "2026-09-20")?.kind,
    ).toBe("HISTORICAL");
    expect(selectPersonalPaymentReference([], "2026-09-20")).toBeNull();
  });
});

const snapshot = (
  referenceDate: string,
  rates = { EUR: "1", USD: "1.2", ISK: "150", JPY: "100", NZD: "2" },
) => ({
  referenceDate,
  rates,
  observedAt: "2026-09-24T05:00:00.000Z",
  expiresAt: "2026-10-24T05:00:00.000Z",
});

const bundle = (referenceDate = "2026-09-23") =>
  ({
    snapshots: [snapshot(referenceDate)],
  }) satisfies FxReferenceSnapshotBundle;

function payment(
  currency: string,
  scale: number,
  amountMinor: number,
  extra: Partial<LocalPersonalPayment> = {},
) {
  return {
    id: "payment",
    journeyId: "journey-a",
    ownerUserId: "user-a",
    ownerMemberId: "member-a",
    counterpartyMemberId: "member-b",
    direction: "PAID",
    amountMinor,
    currency,
    scale,
    occurredAt: "2026-09-23T12:00:00.000Z",
    economicDate: "2026-09-23",
    revision: 2,
    recordedEquivalentMinor: null,
    recordedEquivalentCurrency: null,
    recordedEquivalentScale: null,
    ...extra,
  } as LocalPersonalPayment;
}

describe("local Personal Payment FX presentation", () => {
  it("classifies every economic-date selection branch", () => {
    const snapshots = [
      snapshot("2026-09-24"),
      snapshot("2026-09-20"),
      snapshot("2026-09-10"),
    ];
    expect(bestSnapshotForEconomicDate(snapshots, "2026-09-24", "2026-09-24").match).toBe(
      "EXACT_DATE",
    );
    expect(bestSnapshotForEconomicDate(snapshots, "2026-09-22", "2026-09-24").match).toBe(
      "PREVIOUS_WORKING_DAY",
    );
    expect(
      bestSnapshotForEconomicDate([snapshot("2026-09-10")], "2026-09-18", "2026-09-24")
        .match,
    ).toBe("STALE_DATE");
    expect(
      bestSnapshotForEconomicDate([snapshot("2026-09-24")], "2026-09-23", "2026-09-24")
        .match,
    ).toBe("ROUGH_LATEST");
    expect(
      bestSnapshotForEconomicDate([snapshot("2026-09-24")], "2026-08-01", "2026-09-24")
        .match,
    ).toBe("NO_MATCH");
    expect(
      bestSnapshotForEconomicDate([snapshot("2026-08-01")], "2026-09-23", "2026-09-24")
        .match,
    ).toBe("NO_MATCH");
  });

  it("converts USD and zero-scale ISK using exact EUR cross-rates", () => {
    expect(
      personalPaymentComparable(
        payment("USD", 2, 1_000),
        "NZD",
        2,
        bundle(),
        "2026-09-24",
      )?.money,
    ).toEqual({ minor: 1_667, currency: "NZD", scale: 2 });
    expect(
      personalPaymentComparable(
        payment("ISK", 0, 1_500),
        "NZD",
        2,
        bundle(),
        "2026-09-24",
      )?.money,
    ).toEqual({ minor: 2_000, currency: "NZD", scale: 2 });
  });

  it("prefers a matching server projection and ignores legacy equivalents", () => {
    expect(
      personalPaymentComparable(
        payment("USD", 2, 1_000, {
          recordedEquivalentMinor: 1_701,
          recordedEquivalentCurrency: "NZD",
          recordedEquivalentScale: 2,
          fxProjections: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              paymentId: "payment",
              journeyId: "journey-a",
              targetCurrency: "NZD",
              targetScale: 2,
              policyVersion: "ECB_DAILY_V1",
              sourcePaymentRevision: 2,
              inputDigest: "0123456789abcdef0123456789abcdef",
              economicDate: "2026-09-23",
              originalAmountMinor: 1_000,
              originalCurrency: "USD",
              originalScale: 2,
              state: "CONFIRMED",
              equivalentMinor: 1_703,
              decimalRate: "1.703",
              rateQuoteId: "20000000-0000-4000-8000-000000000001",
              referenceDate: "2026-09-23",
              provider: "ECB",
              providerReference: "provider",
              sourceReference: "source",
              failureCategory: null,
              revision: 1,
              createdAt: "2026-09-24",
              updatedAt: "2026-09-24",
            },
          ],
        }),
        "NZD",
        2,
        bundle(),
        "2026-09-24",
      ),
    ).toMatchObject({
      money: { minor: 1_703 },
      source: "CONFIRMED_EQUIVALENT",
      estimate: null,
    });
  });
});
