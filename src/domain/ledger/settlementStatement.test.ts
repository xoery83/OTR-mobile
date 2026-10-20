import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertCurrentFinalStatement,
  buildSettlementStatement,
  canonicalSettlementStatementJson,
  type SettlementLineageSnapshot,
} from "./settlementStatement";

const root: SettlementLineageSnapshot = {
  id: "70000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  kind: "ROOT",
  rootSettlementId: null,
  parentAdjustmentId: null,
  lineageSequence: 0,
  status: "SETTLED",
  throughTimestamp: "2026-09-12T00:00:00.000Z",
  settlementCurrency: "NZD",
  settlementScale: 2,
  algorithmVersion: "ledger-settlement-greedy-v1",
  eligibilityVersion: "ledger-settlement-eligibility-v1",
  inputDigest: "a".repeat(64),
  finalizedAt: "2026-09-12T00:00:00.000Z",
  adjustmentState: "CURRENT",
  outstandingBalances: [],
  inputs: [],
  balances: [],
  transfers: [],
  auditEvents: [],
};

describe("Stage 7.3 SettlementStatement", () => {
  it("normalizes lineage order and produces a stable canonical digest source", () => {
    const adjustment: SettlementLineageSnapshot = {
      ...root,
      id: "70000000-0000-4000-8000-000000000002",
      kind: "ADJUSTMENT",
      rootSettlementId: root.id,
      parentAdjustmentId: null,
      lineageSequence: 1,
      inputDigest: "b".repeat(64),
      priorInputDigest: root.inputDigest,
      adjustmentReason: "Correction",
    };
    const statement = buildSettlementStatement([adjustment, root]);
    expect(statement.headSettlementId).toBe(adjustment.id);
    expect(statement.lineage.map((row) => row.id)).toEqual([root.id, adjustment.id]);
    expect(
      createHash("sha256")
        .update(canonicalSettlementStatementJson(statement))
        .digest("hex"),
    ).toHaveLength(64);
    expect(() => assertCurrentFinalStatement(statement)).not.toThrow();
  });

  it("rejects a report that is not current and fully settled", () => {
    expect(() =>
      assertCurrentFinalStatement(
        buildSettlementStatement([{ ...root, adjustmentState: "ADJUSTMENT_REQUIRED" }]),
      ),
    ).toThrow("not current");
    expect(() =>
      assertCurrentFinalStatement(
        buildSettlementStatement([
          {
            ...root,
            transfers: [
              {
                id: "72000000-0000-4000-8000-000000000001",
                fromMemberId: "30000000-0000-4000-8000-000000000001",
                toMemberId: "30000000-0000-4000-8000-000000000002",
                amount: { minor: 1, currency: "NZD", scale: 2 },
                confirmedDischarge: { minor: 0, currency: "NZD", scale: 2 },
                confirmedRemaining: { minor: 1, currency: "NZD", scale: 2 },
                awaitingAmount: { minor: 0, currency: "NZD", scale: 2 },
                availableToReport: { minor: 1, currency: "NZD", scale: 2 },
                status: "OPEN",
                revision: 1,
                payments: [],
              },
            ],
          },
        ]),
      ),
    ).toThrow("not fully settled");
  });
});
