import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { myLedgerResponseSchema } from "../../src/data/api/ledgerReadContracts";
import { readMyLedger, readMyLedgerSummary } from "./supabaseGateway";
import { summarizeMyLedgerSnapshot, type LightweightSnapshot } from "./myLedgerSummary";

const userId = "20000000-0000-4000-8000-000000000001";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memberId = (n: number) => id(n + 1000);
const expenseId = (n: number) => id(n + 2000);

function fixture(): LightweightSnapshot {
  const journeys = Array.from({ length: 50 }, (_, index) => ({
    journeyId: id(index + 1),
    memberId: memberId(index + 1),
    title: `Journey ${index + 1}`,
    startDate: "2026-01-01",
    endDate: null,
    currency: "NZD",
    scale: 2,
    updatedAt: "2026-09-26T00:00:00Z",
  }));
  const expenses: LightweightSnapshot["expenses"] = [];
  for (let journey = 1; journey <= 49; journey++) {
    for (let offset = 0; offset < 6; offset++) {
      const kind = offset % 6;
      expenses.push({
        expenseId: expenseId(journey * 10 + offset),
        revision: 2,
        journeyId: id(journey),
        category: "food",
        economicDate: kind === 0 ? "2026-02-02" : "2026-09-20",
        occurredAt:
          kind === 0
            ? "2025-12-31T23:00:00Z"
            : kind === 1
              ? "2026-01-01T00:00:00Z"
              : "2026-09-20T00:00:00Z",
        status: kind === 3 ? "RATE_REQUIRED" : "ACCEPTED",
        settlementParticipation: kind === 2 ? "EXCLUDED" : "INCLUDED",
        payerMemberId: kind === 4 ? memberId(journey + 500) : memberId(journey),
        originalCurrency: "EUR",
        originalScale: 2,
        personalSplitMinor: kind === 5 ? null : 40,
        personalSettlementMinor: kind === 3 ? null : kind === 5 ? null : 60,
        settlementMinor: kind === 3 ? null : 100,
        hasOpenConflict: kind === 4 && journey !== 2,
      });
    }
  }
  return { linkedJourneyCount: 51, journeys, expenses };
}

function oldService(snapshot: LightweightSnapshot) {
  const from = vi.fn((table: string) => {
    if (table === "journey_members") {
      const query = {
        eq: () => query,
        order: async () => ({
          data: snapshot.journeys.map((j) => ({ id: j.memberId, trip_id: j.journeyId })),
          error: null,
        }),
      };
      return { select: () => query };
    }
    if (table === "ledger_settings")
      return {
        select: () => ({
          in: async () => ({
            data: snapshot.journeys.map((j) => ({ journey_id: j.journeyId })),
            error: null,
          }),
        }),
      };
    throw new Error(`Forbidden old table ${table}`);
  });
  const readReporting = vi.fn(async (_: unknown, _user: string, journeyId: string) => {
    const journey = snapshot.journeys.find((item) => item.journeyId === journeyId)!;
    return {
      bootstrap: {
        journey: {
          title: journey.title,
          startDate: journey.startDate,
          endDate: journey.endDate,
          settlementCurrency: journey.currency,
          settlementScale: journey.scale,
          updatedAt: journey.updatedAt,
        },
      },
      records: snapshot.expenses
        .filter((e) => e.journeyId === journeyId)
        .map((e) => ({
          id: e.expenseId,
          title: "",
          description: null,
          category: e.category,
          occurredAt: e.occurredAt,
          payerMemberId: e.payerMemberId,
          payerName: "",
          originalMinor: 0,
          originalCurrency: e.originalCurrency,
          businessStatus: e.status,
          settlementParticipation: e.settlementParticipation,
          syncStatus: "SYNCED",
          settlementMinor: e.settlementMinor,
          settlementCurrency: journey.currency,
          hasOpenConflict: e.hasOpenConflict,
          hasReceipt: false,
          splits:
            e.personalSplitMinor === null
              ? []
              : [
                  {
                    memberId: journey.memberId,
                    memberName: "",
                    settlementMinor: e.personalSettlementMinor,
                  },
                ],
        })),
    };
  });
  return { service: { from } as unknown as SupabaseClient, readReporting, from };
}

function lightweightService(
  snapshot: LightweightSnapshot,
  members = [
    ...snapshot.journeys,
    {
      ...snapshot.journeys[0],
      journeyId: id(51),
      memberId: memberId(51),
    },
  ],
) {
  const rpc = vi.fn((_name: string, args: Record<string, unknown>) => {
    expect(args.actor_user).toBe(userId);
    return {
      abortSignal: async (_signal?: AbortSignal) => ({ data: snapshot, error: null }),
    };
  });
  const from = vi.fn((table: string) => {
    expect(table).toBe("journey_members");
    const query = {
      eq: () => query,
      abortSignal: async () => ({
        data: members.map((j) => ({ id: j.memberId, trip_id: j.journeyId })),
        error: null,
      }),
    };
    return { select: () => query };
  });
  return { service: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("My Ledger lightweight summary", () => {
  it.each([
    ["ALL", null, null],
    ["YEAR", "2026-01-01T00:00:00Z", "2026-09-26T00:00:00Z"],
    ["30D", "2026-08-27T00:00:00Z", "2026-09-26T00:00:00Z"],
  ] as const)(
    "matches every old summary field for %s across 50 Journeys",
    async (period, from, to) => {
      const snapshot = fixture();
      const old = oldService(snapshot);
      const baseline = await readMyLedger(old.service, userId, period, from, to, {
        readReporting: old.readReporting as never,
      });
      const next = summarizeMyLedgerSnapshot(
        snapshot,
        period,
        from,
        to,
        baseline.serverTime,
      );
      expect(next.journeys).toEqual(baseline.journeys);
      expect(next.journeys).toHaveLength(50);
      expect(next.journeys[49]).toMatchObject({ mySpendMinor: 0, paidMinor: 0 });
      if (period === "ALL") {
        expect(next.journeys[0]).toMatchObject({
          mySpendMinor: 180,
          paidMinor: 300,
          positionMinor: 180,
          conflictCount: 1,
          unvaluedCount: 1,
        });
        expect(next.journeys[1].conflictCount).toBe(0);
      }
      expect(next.spendingFacts?.length).toBeGreaterThan(150);
    },
  );

  it("uses two operations independent of Journey count and excludes full reads", async () => {
    const snapshot = fixture();
    const { service, rpc, from } = lightweightService(snapshot);
    const log = vi.fn();
    const result = await readMyLedgerSummary(
      service,
      userId,
      "ALL",
      null,
      null,
      undefined,
      log,
    );
    expect(result.journeys).toHaveLength(50);
    expect(rpc).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        linkedJourneyCount: 51,
        ledgerEligibleJourneyCount: 50,
        skippedMissingSettingsCount: 1,
        expenseCount: 294,
        queryOperationCount: 2,
        batchCount: 1,
      }),
    );
  });

  it("uses the local YEAR when its UTC lower bound falls on December 31", () => {
    const result = summarizeMyLedgerSnapshot(
      fixture(),
      "YEAR",
      "2025-12-31T11:00:00Z",
      "2026-09-26T00:00:00Z",
      "now",
    );
    expect(result.spendingFacts?.some((fact) => fact.economicDate === "2026-02-02")).toBe(
      true,
    );
    expect(
      result.spendingFacts?.every((fact) =>
        (fact.economicDate ?? fact.occurredAt.slice(0, 10)).startsWith("2026-"),
      ),
    ).toBe(true);
  });

  it("keeps the optional fact field backward compatible", () => {
    const response = summarizeMyLedgerSnapshot(fixture(), "ALL", null, null, "now");
    const oldShape = { ...response };
    delete oldShape.spendingFacts;
    expect(myLedgerResponseSchema.parse(oldShape).journeys).toEqual(response.journeys);
  });

  it("rejects revoked access after the snapshot", async () => {
    const snapshot = fixture();
    const { service } = lightweightService(snapshot, snapshot.journeys.slice(1));
    await expect(readMyLedgerSummary(service, userId, "ALL", null, null)).rejects.toThrow(
      "access changed",
    );
  });

  it("rejects an Expense outside the authorized Journey snapshot", async () => {
    const snapshot = fixture();
    snapshot.expenses[0] = { ...snapshot.expenses[0], journeyId: id(99) };
    const { service } = lightweightService(snapshot);
    await expect(readMyLedgerSummary(service, userId, "ALL", null, null)).rejects.toThrow(
      "scope is invalid",
    );
  });

  it("retries an added membership once and then fails if scope still changes", async () => {
    const snapshot = fixture();
    const extra = { ...snapshot.journeys[0], journeyId: id(99), memberId: memberId(99) };
    const { service, rpc } = lightweightService(snapshot, [
      ...snapshot.journeys,
      { ...snapshot.journeys[0], journeyId: id(51), memberId: memberId(51) },
      extra,
    ]);
    await expect(readMyLedgerSummary(service, userId, "ALL", null, null)).rejects.toThrow(
      "scope changed",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("returns the second coherent snapshot after one scope retry", async () => {
    const first = fixture();
    first.linkedJourneyCount = 50;
    const second = fixture();
    const { service, rpc } = lightweightService(second);
    rpc.mockImplementationOnce(() => ({
      abortSignal: async () => ({ data: first, error: null }),
    }));
    const log = vi.fn();
    const result = await readMyLedgerSummary(
      service,
      userId,
      "ALL",
      null,
      null,
      undefined,
      log,
    );
    expect(result.journeys).toHaveLength(50);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ consistencyRetryCount: 1 }),
    );
  });

  it("passes cancellation into the snapshot operation", async () => {
    const controller = new AbortController();
    const { service, rpc } = lightweightService(fixture());
    rpc.mockImplementationOnce(() => ({
      abortSignal: (signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    }));
    const log = vi.fn();
    const pending = readMyLedgerSummary(
      service,
      userId,
      "ALL",
      null,
      null,
      controller.signal,
      log,
    );
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toThrow("aborted");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ cancellationCount: 1 }));
  });

  it("stops before querying if already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { service, rpc } = lightweightService(fixture());
    await expect(
      readMyLedgerSummary(service, userId, "ALL", null, null, controller.signal),
    ).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});
