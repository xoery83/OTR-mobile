import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQaGetReservation, QaReadBudgetError } from "./nativeQaReadBudget";
import { createApiClient } from "./client";
import { z } from "zod";
const state = vi.hoisted(() => ({
  text: null as string | null,
  opens: 0,
  writes: 0,
  failWrite: false,
  reserve: null as null | ((method: string, path: string, base: string) => void),
}));
vi.mock("./nativeQaReadBudget", async (importOriginal) => {
  const original = await importOriginal<typeof import("./nativeQaReadBudget")>();
  return {
    ...original,
    reserveNativeQaGet: (method: string, path: string, base: string) =>
      state.reserve!(method, path, base),
  };
});
const config = {
  version: 1 as const,
  runId: "afdf5785-670b-44c1-951d-9864dc1307f6",
  maximum: 72,
};
const raw = JSON.stringify(config),
  base = "https://api-dev.xoery.art",
  route =
    "/v2/trips/10000000-0000-4000-8000-000000000001/core/operations/10000000-0000-4000-8000-000000000002?PRIVATE_QUERY=secret";
beforeEach(() => {
  state.text = null;
  state.opens = 0;
  state.writes = 0;
  state.failWrite = false;
  state.reserve = createQaGetReservation(
    () => process.env.EXPO_PUBLIC_OTR_QA_READ_BUDGET,
    () => {
      state.opens++;
      return {
        exists: () => state.text !== null,
        read: () => state.text!,
        create: () => {
          if (state.text !== null) throw Error("exists");
          state.text = "";
        },
        write: (text: string) => {
          state.writes++;
          if (state.failWrite) throw Error("PRIVATE_IO_ERROR");
          state.text = text;
        },
      };
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});
function fixture(initial: string | null = null) {
  let text = initial,
    writes = 0;
  const store = {
    exists: () => text !== null,
    read: () => text!,
    create: () => {
      if (text !== null) throw Error("exists");
      text = "";
    },
    write: (value: string) => {
      text = value;
      writes++;
    },
  };
  return {
    store,
    read: () => text,
    writes: () => writes,
    reserve: createQaGetReservation(
      () => raw,
      () => store,
      () => "2026-10-24T06:00:00.000Z",
    ),
  };
}
it("off and nonGET paths never open Native filesystem", () => {
  const reserve = createQaGetReservation(
    () => undefined,
    () => {
      throw Error("off must not open");
    },
  );
  expect(() => reserve("GET", route, base)).not.toThrow();
  const post = createQaGetReservation(
    () => "broken",
    () => {
      throw Error("POST must not open");
    },
  );
  expect(() => post("POST", route, base)).not.toThrow();
});
it("cold restart reads same ledger and increments synchronously without resetting", () => {
  const f = fixture();
  f.reserve("GET", route, base);
  const restarted = createQaGetReservation(
    () => raw,
    () => f.store,
  );
  restarted("GET", route, base);
  const ledger = JSON.parse(f.read()!);
  expect(ledger.entries.map((e: { ordinal: number }) => e.ordinal)).toEqual([1, 2]);
  expect(ledger.entries[0].route).toBe("/v2/trips/:id/core/operations/:id");
  expect(f.read()).not.toMatch(/PRIVATE|10000000/);
});
it("exact72 hard cap refuses73 with no ledger reset", () => {
  const f = fixture();
  for (let n = 0; n < 72; n++) f.reserve("GET", route, base);
  const prior = f.read();
  expect(() => f.reserve("GET", route, base)).toThrow("QA_READ_BUDGET_EXHAUSTED");
  expect(f.read()).toBe(prior);
  expect(f.writes()).toBe(72);
});
it("bad file or old identity/maximum is failclosed and never overwritten", () => {
  for (const text of [
    "broken",
    JSON.stringify({ ...config, runId: "old", entries: [] }),
    JSON.stringify({ ...config, maximum: 71, entries: [] }),
    JSON.stringify({
      ...config,
      entries: [{ ordinal: 7, method: "GET", route: "/private", at: "bad" }],
    }),
  ]) {
    const f = fixture(text);
    expect(() => f.reserve("GET", route, base)).toThrow(QaReadBudgetError);
    expect(f.read()).toBe(text);
    expect(f.writes()).toBe(0);
  }
});
it("invalid public allocation and foreign origin refuse before any file operation", () => {
  for (const value of [
    "broken",
    JSON.stringify({ ...config, maximum: 73 }),
    JSON.stringify({ ...config, runId: "other" }),
  ])
    expect(() =>
      createQaGetReservation(
        () => value,
        () => {
          throw Error("must not open");
        },
      )("GET", route, base),
    ).toThrow(QaReadBudgetError);
  expect(() => fixture().reserve("GET", route, "https://production.invalid")).toThrow(
    QaReadBudgetError,
  );
});
it.each([false, true])(
  "actual GET sends including401retry reserve first (bounded=%s)",
  async (bounded) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_QA_READ_BUDGET", raw);
    let calls = 0;
    const client = createApiClient({
      baseUrl: base,
      ...(bounded ? { maxResponseBytes: 256 } : {}),
      accessTokenProvider: async () => "PRIVATE_TOKEN",
      fetchImplementation: async () => {
        calls++;
        expect(JSON.parse(state.text!).entries.length).toBe(calls);
        return new Response(
          JSON.stringify(
            calls === 1 ? { error: { code: "AUTH_REQUIRED" } } : { id: "okay" },
          ),
          { status: calls === 1 ? 401 : 200 },
        );
      },
    });
    expect(await client.get(route, z.object({ id: z.string() }))).toEqual({ id: "okay" });
    expect(calls).toBe(2);
    expect(state.text).not.toContain("PRIVATE");
  },
);
it("concurrent client GETs reserve unique persisted ordinals before their HTTP calls", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_QA_READ_BUDGET", raw);
  let calls = 0;
  const client = createApiClient({
    baseUrl: base,
    maxResponseBytes: 256,
    fetchImplementation: async () => {
      calls++;
      expect(JSON.parse(state.text!).entries.length).toBe(calls);
      await Promise.resolve();
      return new Response('{"id":"okay"}');
    },
  });
  await Promise.all(
    Array.from({ length: 12 }, () => client.get(route, z.object({ id: z.string() }))),
  );
  expect(
    JSON.parse(state.text!).entries.map((e: { ordinal: number }) => e.ordinal),
  ).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
});
it("failed synchronous write stops the request before HTTP", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_QA_READ_BUDGET", raw);
  state.failWrite = true;
  let calls = 0;
  const client = createApiClient({
    baseUrl: base,
    maxResponseBytes: 256,
    fetchImplementation: async () => {
      calls++;
      return new Response("{}");
    },
  });
  await expect(client.get(route, z.unknown())).rejects.toMatchObject({
    code: "QA_READ_BUDGET_CLOSED",
  });
  expect(calls).toBe(0);
});
