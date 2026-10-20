import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advanceScrollAnchor, restoredScrollY } from "./settlementScrollAnchor";

describe("Settlement page anchors", () => {
  it("shares collapse while each page retains its body position", () => {
    const deep = advanceScrollAnchor({ collapse: 0, body: 0 }, 230, 80);
    expect(deep).toEqual({ collapse: 80, body: 150 });
    expect(restoredScrollY(deep.collapse, 25)).toBe(105);
    expect(advanceScrollAnchor({ collapse: 80, body: 25 }, -40, 80)).toEqual({
      collapse: 65,
      body: 0,
    });
    expect(advanceScrollAnchor({ collapse: 20, body: 150 }, 15, 80)).toEqual({
      collapse: 35,
      body: 150,
    });
  });
});

it("keeps managed Ledger scroll content from bouncing away from its floating header", () => {
  for (const file of ["SettlementReadinessScreen.tsx", "LedgerStage6Screen.tsx"]) {
    const screen = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(screen).toMatch(/bounces=\{false\}\s+contentInsetAdjustmentBehavior="never"/);
  }
});
