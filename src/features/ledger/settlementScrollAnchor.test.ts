import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advanceScrollAnchor, rebaseHeaderCollapse, restoredScrollY } from "./settlementScrollAnchor";

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


it("rebases a collapsed header when Dynamic Type changes without moving the body anchor", () => {
  expect(rebaseHeaderCollapse(144, 144, 96)).toBe(96);
  expect(rebaseHeaderCollapse(95.5, 96, 144)).toBe(144);
  expect(rebaseHeaderCollapse(32, 96, 144)).toBe(32);
  expect(rebaseHeaderCollapse(0, 0, 96)).toBe(0);
  expect(restoredScrollY(rebaseHeaderCollapse(144, 144, 96), 220)).toBe(316);
});
