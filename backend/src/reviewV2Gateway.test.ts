import { describe, expect, it, vi } from "vitest";
import { createSupabaseDevGateway } from "./supabaseGateway";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select() {
        return this;
      },
      eq() {
        return Promise.resolve({
          data:
            table === "journey_members"
              ? [{ id: "12000000-0000-4000-8000-000000000002" }]
              : [],
          error: null,
        });
      },
    }),
    rpc,
  }),
}));

const input = {
  localId: "local",
  payerMemberId: "12000000-0000-4000-8000-000000000002",
  title: "Dinner",
  description: null,
  category: "food",
  occurredAt: "2026-09-16T12:00:00Z",
  original: { minor: 100, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED",
  settlementParticipation: "INCLUDED",
  participants: [
    {
      memberId: "12000000-0000-4000-8000-000000000002",
      displayNameSnapshot: "Member",
      householdIdSnapshot: null,
    },
  ],
  splits: [
    {
      memberId: "12000000-0000-4000-8000-000000000002",
      originalMinor: 100,
      settlementMinor: 100,
      method: "EXACT",
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    policy: "SAME_CURRENCY",
    original: { minor: 100, currency: "NZD", scale: 2 },
    settlement: { minor: 100, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
  },
};

describe("Review v2 post-commit trigger", () => {
  it("reconciles after canonical create and never turns committed financial success into failure", async () => {
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "synthetic",
      secretKey: "synthetic",
    });
    rpc
      .mockReset()
      .mockImplementation(async (name: string, args: Record<string, unknown>) =>
        name === "ledger_create_expense_4a"
          ? { data: args.response_body_value, error: null }
          : { data: null, error: { message: "Review unavailable" } },
      );
    const result = await gateway.createLedgerExpense(
      "00000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000001",
      "key",
      input as never,
    );
    expect(result.revision).toBe(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "ledger_create_expense_4a",
      "reconcile_ledger_review_v2",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_expense_revisions: {},
      p_observations: [],
    });
  });
});
