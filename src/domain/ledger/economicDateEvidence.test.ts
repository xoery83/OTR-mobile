import { describe, expect, it } from "vitest";

import { classifyMissingEconomicDate } from "./economicDateEvidence";

const stage9 = {
  occurredPrecision: "DATE",
  mappingVersion: "legacy-ledger-to-ledger2-v1",
  transformVersion: "stage9-europe-replay-v2",
};

describe("missing economic-date evidence", () => {
  it("accepts a versioned date-only import mapping", () => {
    for (const transformVersion of ["stage9-europe-replay-v2", "stage9-europe-replay-v3"])
      expect(
        classifyMissingEconomicDate({
          occurredAt: "2026-07-25T00:00:00.000Z",
          importProvenance: { ...stage9, transformVersion },
        }),
      ).toEqual({
        disposition: "AUTO_SAFE",
        date: "2026-07-25",
        source: "STAGE9_DATE_ONLY_V1",
      });
  });

  it("never promotes a timestamp-only fixture, even when its UTC day looks plausible", () => {
    expect(
      classifyMissingEconomicDate({
        occurredAt: "2026-07-25T18:00:00.000Z",
        importProvenance: { fixtureVersion: "ledger-ui-polish-v1", boundaryCase: 7 },
      }).disposition,
    ).toBe("USER_ACTION_REQUIRED");
  });

  it("rejects conflicting dates and malformed calendar days", () => {
    expect(
      classifyMissingEconomicDate({
        occurredAt: "2026-07-25T00:00:00.000Z",
        importProvenance: stage9,
        conflictingDateEvidence: true,
      }).disposition,
    ).toBe("USER_ACTION_REQUIRED");
    expect(
      classifyMissingEconomicDate({
        occurredAt: "2026-02-30T00:00:00.000Z",
        importProvenance: stage9,
      }).disposition,
    ).toBe("USER_ACTION_REQUIRED");
  });
});
