import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseDevGateway } from "./supabaseGateway";

const tripId = "10000000-0000-4000-8000-000000000001";
const personId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const now = "2026-10-03T00:00:00Z";

afterEach(() => vi.unstubAllGlobals());

function fixture(pair: Record<string, unknown>) {
  const memberSelects: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    let body: unknown = [];
    if (url.pathname.endsWith("/rpc/read_ledger_review_projection_v2"))
      body = { findings: [], actions: [] };
    if (url.pathname.endsWith("/ledger_settings"))
      body = {
        revision: 1,
        settlement_currency: "NZD",
        settlement_scale: 2,
        valuation_policy: "REFERENCE_RATE",
        updated_at: now,
      };
    if (url.pathname.endsWith("/trips"))
      body = { name: "Trip", start_date: null, end_date: null };
    if (url.pathname.endsWith("/journey_members")) {
      memberSelects.push(url.searchParams.get("select") ?? "");
      body = [
        {
          id: personId,
          user_id: userId,
          display_name: "Inactive Organizer",
          role: "owner",
          status: "linked",
          updated_at: now,
          ...pair,
        },
      ];
    }
    return Response.json(body);
  });
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    secretKey: "local-test-secret",
    publishableKey: "local-test-public",
  });
  return { gateway, memberSelects };
}

describe("Trip Person passive bootstrap projection", () => {
  it.each([
    [true, 0],
    [false, 7],
    [true, Number.MAX_SAFE_INTEGER],
  ])(
    "emits %s/%s without changing linked-owner capabilities",
    async (active, revision) => {
      const { gateway, memberSelects } = fixture({
        participation_active: active,
        participation_revision: revision,
      });
      const response = await gateway.bootstrapLedger(userId, tripId);
      expect(response.members).toHaveLength(1);
      expect(response.members[0]).toMatchObject({
        id: personId,
        isParticipating: active,
        participationRevision: revision,
        role: "owner",
        status: "linked",
        capabilities: { canFinalizeSettlement: true },
      });
      expect(response.actor.capabilities.canFinalizeSettlement).toBe(true);
      expect(
        memberSelects.some(
          (select) =>
            select.includes("participation_active") &&
            select.includes("participation_revision"),
        ),
      ).toBe(true);
    },
  );
  it.each([
    {},
    { participation_active: false },
    { participation_active: null, participation_revision: 0 },
    { participation_active: false, participation_revision: -1 },
    { participation_active: false, participation_revision: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects missing/malformed migrated database observation %j", async (pair) => {
    const { gateway } = fixture(pair);
    await expect(gateway.bootstrapLedger(userId, tripId)).rejects.toThrow();
  });
});
