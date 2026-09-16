import { describe, expect, it } from "vitest";

import { createLedgerReviewRepository } from "./ledgerReviewRepository";

describe("Ledger Review repository", () => {
  it("appends action history and queue work without mutating financial truth", async () => {
    const writes: string[] = [];
    const database = {
      async withTransactionAsync(task: () => Promise<void>) {
        await task();
      },
      async runAsync(sql: string) {
        writes.push(sql);
        return { changes: 1 } as never;
      },
      async getAllAsync() {
        return [] as never;
      },
      async getFirstAsync(sql: string) {
        if (sql.includes("ledger_review_findings"))
          return {
            id: "10000000-0000-4000-8000-000000000001",
            journeyId: "20000000-0000-4000-8000-000000000001",
            expenseId: "30000000-0000-4000-8000-000000000001",
            layer: "HEURISTIC",
            status: "OPEN",
            revision: 1,
            entityRevision: 4,
            rulesetVersion: "ledger-review-v1",
          } as never;
        if (sql.includes("ledger_actor_context"))
          return {
            userId: "40000000-0000-4000-8000-000000000001",
            memberId: "50000000-0000-4000-8000-000000000001",
            role: "owner",
          } as never;
        return { creatorMemberId: "50000000-0000-4000-8000-000000000001" } as never;
      },
    };

    const beforeFinancialFingerprint = "expenses|splits|valuations|settlements|payments";
    await createLedgerReviewRepository(
      database,
      async () => "40000000-0000-4000-8000-000000000001",
    ).act("10000000-0000-4000-8000-000000000001", "DISMISSED", "False positive");

    expect(writes).toHaveLength(3);
    expect(writes.join("\n")).not.toMatch(
      /UPDATE\s+(ledger_expenses|ledger_expense_splits|ledger_settlements|ledger_settlement_payments)/i,
    );
    expect(beforeFinancialFingerprint).toBe(
      "expenses|splits|valuations|settlements|payments",
    );
  });
});
