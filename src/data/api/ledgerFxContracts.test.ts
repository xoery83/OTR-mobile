import { describe, expect, it } from "vitest";

import { ledgerFxReferenceSnapshotBundleSchema } from "./ledgerFxContracts";

const bundle = {
  provider: "ECB",
  policyVersion: "ECB_LOCAL_SNAPSHOT_V1",
  baseCurrency: "EUR",
  snapshots: [
    {
      referenceDate: "2026-09-24",
      rates: { EUR: "1.0", ISK: "143.50", NZD: "1.9701" },
      observedAt: "2026-09-24T04:00:00.000Z",
      expiresAt: "2026-10-24T04:00:00.000Z",
    },
    {
      referenceDate: "2026-09-23",
      rates: { EUR: "1.0", ISK: "143.20", NZD: "1.9602" },
      observedAt: "2026-09-24T04:00:00.000Z",
      expiresAt: "2026-10-24T04:00:00.000Z",
    },
  ],
  sourceReference:
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  providerReference: "https://api.frankfurter.dev/v2/providers/ecb/rates",
} as const;

describe("Ledger FX snapshot contract", () => {
  it("accepts a newest-first exact-decimal ECB bundle", () => {
    expect(ledgerFxReferenceSnapshotBundleSchema.parse(bundle).snapshots).toHaveLength(2);
  });

  it("rejects duplicate, unordered, non-decimal and non-EUR-anchor data", () => {
    for (const snapshots of [
      [bundle.snapshots[0], bundle.snapshots[0]],
      [...bundle.snapshots].reverse(),
      [{ ...bundle.snapshots[0], rates: { EUR: "2", ISK: "143.50" } }],
      [{ ...bundle.snapshots[0], rates: { EUR: "1", ISK: "1e2" } }],
    ])
      expect(() =>
        ledgerFxReferenceSnapshotBundleSchema.parse({ ...bundle, snapshots }),
      ).toThrow();
  });
});
