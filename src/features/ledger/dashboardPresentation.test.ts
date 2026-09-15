import { describe, expect, it } from "vitest";

import { journeyLifecycleLabel, settlementPositionLabel } from "./dashboardPresentation";

describe("Ledger dashboard presentation", () => {
  it("only labels lifecycle when Journey dates make it unambiguous", () => {
    expect(
      journeyLifecycleLabel(
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-09-14",
      ),
    ).toBe("Active");
    expect(
      journeyLifecycleLabel({ startDate: "2026-10-01", endDate: null }, "2026-09-14"),
    ).toBe("Upcoming");
    expect(
      journeyLifecycleLabel({ startDate: null, endDate: "2026-08-31" }, "2026-09-14"),
    ).toBe("Past");
    expect(
      journeyLifecycleLabel({ startDate: "2026-01-01", endDate: null }, "2026-09-14"),
    ).toBeNull();
  });

  it("uses the signed settlement position without implying a new calculation", () => {
    expect(settlementPositionLabel(-1)).toBe("You owe");
    expect(settlementPositionLabel(1)).toBe("You are owed");
    expect(settlementPositionLabel(0)).toBe("All settled");
  });
});
