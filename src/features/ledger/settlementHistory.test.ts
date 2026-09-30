import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { settlementBalanceLabel, settlementHistory } from "./settlementHistory";

const root = {
  id: "v1",
  lineageSequence: 0,
  balances: [
    { memberId: "me", netMinor: 1444 },
    { memberId: "other", netMinor: -1444 },
  ],
  adjustmentDeltas: [],
};

const update = (id: string, sequence: number, deltaMinor?: number) => ({
  id,
  lineageSequence: sequence,
  balances: [],
  adjustmentDeltas: deltaMinor === undefined ? [] : [{ memberId: "me", deltaMinor }],
});

describe("frozen settlement history", () => {
  it("shows a single root as the current version", () => {
    expect(settlementHistory([root], "me")).toMatchObject([
      { row: { id: "v1" }, balanceMinor: 1444, deltaMinor: null, isCurrent: true },
    ]);
  });

  it("accumulates ordered deltas for any version and treats a missing personal delta as zero", () => {
    const rows = [update("v3", 2), root, update("v2", 1, 2028)];
    expect(settlementHistory(rows, "me")).toMatchObject([
      { row: { id: "v1" }, balanceMinor: 1444, isCurrent: false },
      { row: { id: "v2" }, balanceMinor: 3472, deltaMinor: 2028, isCurrent: false },
      { row: { id: "v3" }, balanceMinor: 3472, deltaMinor: 0, isCurrent: true },
    ]);
    expect(rows[0].id).toBe("v3");
  });

  it("keeps an older version's balance when later versions change", () => {
    const history = settlementHistory([root, update("v2", 1, 100)], "other");
    expect(history.map(({ balanceMinor }) => balanceMinor)).toEqual([-1444, -1444]);
    expect(settlementHistory([root, update("v2", 1, 99999)], "me")[0].balanceMinor).toBe(
      1444,
    );
  });

  it("never links frozen historical inputs to the current Expense detail", () => {
    const screen = readFileSync(
      new URL("./SettlementStatementScreen.tsx", import.meta.url),
      "utf8",
    );
    expect(screen).not.toContain("/expenses/expense/");
  });

  it("labels positive, negative and zero balances from the user's perspective", () => {
    expect([1, -1, 0].map(settlementBalanceLabel)).toEqual([
      "You receive",
      "You pay",
      "Settled",
    ]);
  });
});
