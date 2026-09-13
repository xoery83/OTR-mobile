import { describe, expect, it } from "vitest";

import { resolveSettlementExportUri } from "./settlementExportPath";

describe("resolveSettlementExportUri", () => {
  it("rebases a durable export after the app container changes", () => {
    expect(
      resolveSettlementExportUri(
        "file:///old/Documents/settlement-exports/root/head/digest/member/statement.csv",
        "file:///new/Documents/",
      ),
    ).toBe(
      "file:///new/Documents/settlement-exports/root/head/digest/member/statement.csv",
    );
  });
});
