import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createMyLedgerReadGate,
  readMyLedger,
  type MyLedgerReadEvent,
} from "./supabaseGateway";

const userId = "20000000-0000-4000-8000-000000000001";
const journey = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const member = (n: number) => ({ id: journey(n + 100), trip_id: journey(n) });

function fakeService(
  members: ReturnType<typeof member>[],
  enabled: string[],
  settingsError: Error | null = null,
) {
  const settingsLookup = vi.fn(async (_column: string, _ids: string[]) => ({
    data: enabled.map((journey_id) => ({ journey_id })),
    error: settingsError,
  }));
  const membershipFilters: [string, string][] = [];
  const from = vi.fn((table: string) => {
    if (table === "journey_members") {
      const query = {
        eq: (column: string, value: string) => {
          membershipFilters.push([column, value]);
          return query;
        },
        order: async () => ({
          data: [...members].sort((a, b) => a.trip_id.localeCompare(b.trip_id)),
          error: null,
        }),
      };
      return { select: () => query };
    }
    if (table === "ledger_settings") return { select: () => ({ in: settingsLookup }) };
    throw new Error(`Unexpected table: ${table}`);
  });
  return {
    service: { from } as unknown as SupabaseClient,
    from,
    settingsLookup,
    membershipFilters,
  };
}

const reporting = (journeyId: string) => ({
  bootstrap: {
    journey: {
      title: journeyId,
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      updatedAt: "2026-09-26T00:00:00Z",
    },
  },
  records: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("My Ledger bootstrap safety", () => {
  it("serializes distinct reads so the two-job limit holds across requests", async () => {
    const run = createMyLedgerReadGate();
    const first = deferred<void>();
    const second = vi.fn(async () => undefined);
    const a = run(() => first.promise);
    const b = run(second);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    first.resolve();
    await Promise.all([a, b]);
    expect(second).toHaveBeenCalledOnce();
  });

  it("releases the process-wide read gate after failure", async () => {
    const run = createMyLedgerReadGate();
    await expect(
      run(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await expect(run(async () => "next")).resolves.toBe("next");
  });

  it("uses one settings precheck and keeps fully configured output ordered", async () => {
    const { service, from, settingsLookup, membershipFilters } = fakeService(
      [member(3), member(1), member(2)],
      [journey(1), journey(2), journey(3)],
    );
    const readReporting = vi.fn(async (_service, _user, id: string) => reporting(id));
    const log = vi.fn<(event: MyLedgerReadEvent) => void>();
    const result = await readMyLedger(service, userId, "ALL", null, null, {
      readReporting: readReporting as never,
      log,
    });
    expect(result.journeys.map((row) => row.journeyId)).toEqual([
      journey(1),
      journey(2),
      journey(3),
    ]);
    expect(result.journeys.every((row) => row.mySpendMinor === 0)).toBe(true);
    expect(settingsLookup).toHaveBeenCalledOnce();
    expect(membershipFilters).toEqual([
      ["user_id", userId],
      ["status", "linked"],
    ]);
    expect(settingsLookup).toHaveBeenCalledWith("journey_id", [
      journey(1),
      journey(2),
      journey(3),
    ]);
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "journey_members",
      "ledger_settings",
    ]);
    expect(readReporting).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        linkedJourneyCount: 3,
        ledgerEligibleJourneyCount: 3,
        skippedMissingSettingsCount: 0,
        completedJourneyCount: 3,
      }),
    );
  });

  it("preserves included versus excluded financial totals", async () => {
    const { service } = fakeService([member(1)], [journey(1)]);
    const entry = (
      id: string,
      participation: "INCLUDED" | "EXCLUDED",
      minor: number,
      share: number,
    ) => ({
      id,
      title: id,
      description: null,
      category: "food",
      occurredAt: "2026-09-20T00:00:00Z",
      payerMemberId: member(1).id,
      payerName: "Payer",
      originalMinor: minor,
      originalCurrency: "NZD",
      businessStatus: "ACCEPTED",
      settlementParticipation: participation,
      syncStatus: "SYNCED",
      settlementMinor: minor,
      settlementCurrency: "NZD",
      hasOpenConflict: false,
      hasReceipt: false,
      splits: [{ memberId: member(1).id, memberName: "Payer", settlementMinor: share }],
    });
    const readReporting = vi.fn(async () => ({
      ...reporting(journey(1)),
      records: [
        entry("included", "INCLUDED", 100, 40),
        entry("excluded", "EXCLUDED", 200, 80),
      ],
    }));
    const result = await readMyLedger(service, userId, "ALL", null, null, {
      readReporting: readReporting as never,
    });
    expect(result.journeys[0]).toMatchObject({
      mySpendMinor: 120,
      paidMinor: 100,
      positionMinor: 60,
      unvaluedCount: 0,
      conflictCount: 0,
    });
  });

  it.each([
    [[journey(1), journey(3)], 1],
    [[journey(2)], 2],
    [[], 3],
  ])("skips missing settings without reporting reads", async (enabled, skipped) => {
    const { service, settingsLookup } = fakeService(
      [member(1), member(2), member(3)],
      enabled,
    );
    const readReporting = vi.fn(async (_service, _user, id: string) => reporting(id));
    const log = vi.fn<(event: MyLedgerReadEvent) => void>();
    const result = await readMyLedger(service, userId, "ALL", null, null, {
      readReporting: readReporting as never,
      log,
    });
    expect(result.journeys.map((row) => row.journeyId)).toEqual(enabled);
    expect(settingsLookup).toHaveBeenCalledOnce();
    expect(readReporting).toHaveBeenCalledTimes(enabled.length);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ skippedMissingSettingsCount: skipped }),
    );
  });

  it("returns empty without a settings query when no Journeys are linked", async () => {
    const { service, settingsLookup } = fakeService([], []);
    const result = await readMyLedger(service, userId, "ALL", null, null);
    expect(result.journeys).toEqual([]);
    expect(settingsLookup).not.toHaveBeenCalled();
  });

  it("fails closed when the batched settings lookup fails", async () => {
    const { service } = fakeService([member(1)], [], new Error("unavailable"));
    const readReporting = vi.fn();
    await expect(
      readMyLedger(service, userId, "ALL", null, null, {
        readReporting: readReporting as never,
      }),
    ).rejects.toThrow("settings read failed");
    expect(readReporting).not.toHaveBeenCalled();
  });

  it("runs at most two reports, preserves order, and stops queued work on failure", async () => {
    const ids = [journey(1), journey(2), journey(3), journey(4)];
    const { service } = fakeService(
      ids.map((_, index) => member(index + 1)),
      ids,
    );
    const waits = ids.map(() => deferred<ReturnType<typeof reporting>>());
    let active = 0;
    let highWater = 0;
    const readReporting = vi.fn(async (_service, _user, id: string) => {
      active += 1;
      highWater = Math.max(highWater, active);
      try {
        return await waits[ids.indexOf(id)].promise;
      } finally {
        active -= 1;
      }
    });
    const log = vi.fn<(event: MyLedgerReadEvent) => void>();
    const result = readMyLedger(service, userId, "ALL", null, null, {
      readReporting: readReporting as never,
      log,
    });
    await vi.waitFor(() => expect(readReporting).toHaveBeenCalledTimes(2));
    waits[1].resolve(reporting(ids[1]));
    expect(readReporting).toHaveBeenCalledTimes(2);
    waits[0].resolve(reporting(ids[0]));
    await vi.waitFor(() => expect(readReporting).toHaveBeenCalledTimes(4));
    waits[3].resolve(reporting(ids[3]));
    waits[2].resolve(reporting(ids[2]));
    expect((await result).journeys.map((row) => row.journeyId)).toEqual(ids);
    expect(highWater).toBe(2);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ activeConcurrencyHighWaterMark: 2 }),
    );

    const failed = ids.map(() => deferred<ReturnType<typeof reporting>>());
    readReporting.mockImplementation(
      async (_service, _user, id) => failed[ids.indexOf(id)].promise,
    );
    const second = readMyLedger(service, userId, "ALL", null, null, {
      readReporting: readReporting as never,
      log,
    });
    const rejection = expect(second).rejects.toThrow("report failed");
    await vi.waitFor(() => expect(readReporting).toHaveBeenCalledTimes(6));
    failed[0].reject(new Error("report failed"));
    await Promise.resolve();
    expect(log).toHaveBeenCalledTimes(1);
    failed[1].resolve(reporting(ids[1]));
    await rejection;
    expect(readReporting).toHaveBeenCalledTimes(6);
    expect(log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        completedJourneyCount: 1,
        failedJourneyIndex: 0,
        queuedWorkSuppressed: true,
      }),
    );
  });
});
