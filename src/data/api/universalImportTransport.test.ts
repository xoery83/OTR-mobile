import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createDevBackendHandler,
  type DevBackendGateway,
} from "../../../backend/src/app";
import {
  createUniversalPort,
  type UniversalHost,
  type UniversalResult,
} from "../../../backend/src/universalImport";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createUniversalImportTransport } from "./universalImportTransport";
import { universalResultSchema } from "./universalImportContracts";

vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

async function fixture() {
  const account = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    task = randomUUID();
  const binding = {
    version: "otr.backend.universal-context/1" as const,
    actorId: account,
    accountId: account,
    tripId: trip,
    batchId: batch,
    taskId: task,
  };
  const sources = ["Activity: Museum walk\n", "Property: Grand Hotel\n"].map((text) => ({
    accountId: account,
    tripId: trip,
    batchId: batch,
    inputId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    revision: 1,
    originalSha256: createHash("sha256").update(text).digest("hex"),
    mime: "text/plain",
    bytes: Buffer.from(text),
  }));
  let receipt: UniversalResult | null = null;
  const host: UniversalHost = {
    readManifest: async (a, t, b) =>
      a === account && t === trip && b === batch
        ? { accountId: account, tripId: trip, batchId: batch, representations: sources }
        : null,
    claimDispatch: async (marker) => {
      if (receipt) return { claimed: false, receipt };
      receipt = marker;
      return { claimed: true, receipt };
    },
    writeReceipt: async (result) => {
      receipt = result;
    },
    readReceipt: async (a, b, t) =>
      a === account && b === batch && t === task ? receipt : null,
  };
  const interpret = vi.fn(async () => ({
    output: {
      v: 2,
      items: [
        {
          id: "i1",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [[0, "activity.name", "Museum walk"]],
        },
        {
          id: "i2",
          kind: "P3",
          subtype: "ACCOMMODATION",
          f: [[1, "property.name", "Grand Hotel"]],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
    providerReceipt: { outcome: "LOCAL_FIXTURE" as const, requestId: null },
  }));
  const port = createUniversalPort(host, { mode: "LOCAL_FIXTURE", interpret });
  port.readContext = async (a, b, t) =>
    a === account && b === batch && t === trip ? binding : null;
  const handle = createDevBackendHandler({
    universalImportPort: port,
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "test-normal-auth" ? { id: account } : null,
      canReadTrip: async (a: string, t: string) => a === account && t === trip,
    } as unknown as DevBackendGateway,
  });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handle(new Request(String(url), init)),
  );
  const getAccount = async () => account;
  const context = await captureAccountRequestContext(trip, getAccount);
  const transport = createUniversalImportTransport(getAccount, {
    baseUrl: "https://api.example",
    fetchImplementation: fetcher as typeof fetch,
    tokenProvider: async () => ({ userId: account, token: "test-normal-auth" }),
  });
  return { context, transport, account, trip, batch, task, binding, interpret, fetcher };
}

it("consumes the actual Backend contract with two sources and mixed candidates, then reads the same Task", async () => {
  const f = await fixture();
  const binding = await f.transport.context(f.context, f.batch);
  expect(binding).toEqual(f.binding);
  expect(f.interpret).not.toHaveBeenCalled();
  const result = await f.transport.execute(f.context, binding);
  expect(result.candidates.map((c) => c.kind)).toEqual(["P1", "P3"]);
  expect(result.sourceBindings).toHaveLength(2);
  expect(result.canonicalWrites).toBe(false);
  expect(result.admission).toBe("NOT_RUN");
  expect(await f.transport.result(f.context, binding)).toEqual(result);
  await f.transport.execute(f.context, binding);
  expect(f.interpret).toHaveBeenCalledTimes(1);
  const post = f.fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(post[1]?.headers).toMatchObject({ "Idempotency-Key": f.task });
});
it("rejects a local replacement Task/Account binding before transport", async () => {
  const f = await fixture();
  await expect(
    f.transport.execute(f.context, { ...f.binding, accountId: randomUUID() }),
  ).rejects.toThrow("MISMATCH");
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.interpret).not.toHaveBeenCalled();
});
it("rejects Account generation changes while the HTTP result is in flight", async () => {
  const f = await fixture();
  const transport = createUniversalImportTransport(async () => f.account, {
    baseUrl: "https://api.example",
    tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
    fetchImplementation: async () => {
      advanceAccountGeneration();
      return Response.json(f.binding);
    },
  });
  await expect(transport.context(f.context, f.batch)).rejects.toThrow();
});
it("keeps unavailable context explicit and never uses a model call to probe availability", async () => {
  const f = await fixture();
  await expect(f.transport.context(f.context, randomUUID())).rejects.toThrow();
  expect(f.interpret).not.toHaveBeenCalled();
});
it("network UNKNOWN is not automatically retried", async () => {
  const f = await fixture(),
    fetcher = vi.fn(async () => {
      throw new TypeError("network interrupted");
    });
  const transport = createUniversalImportTransport(async () => f.account, {
    baseUrl: "https://api.example",
    tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
    fetchImplementation: fetcher,
  });
  await expect(transport.execute(f.context, f.binding)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("preserves optional Source observations and rejects evidence outside the returned Source bindings", async () => {
  const f = await fixture(),
    raw = await f.transport.execute(f.context, f.binding);
  const observation = {
    type: "OPTIONAL_SOURCE_FIELD",
    path: "stay.contact",
    evidence: { raw: "QA contact" },
  };
  const parsed = universalResultSchema.parse({
    ...raw,
    sourceObservations: [observation],
  });
  expect(parsed.sourceObservations).toEqual([observation]);
  const invalid = structuredClone(raw);
  invalid.candidates[0].fields[0].sourceId = "UNBOUND";
  expect(universalResultSchema.safeParse(invalid).success).toBe(false);
});

it.each(["UNIVERSAL_IMPORT_CLOSED", "UNIVERSAL_CONTEXT_UNAVAILABLE"])(
  "preserves exact closed context code %s through the real API client",
  async (code) => {
    const f = await fixture();
    const fetcher = vi.fn(async () => Response.json({ error: { code } }, { status: 503 }));
    const transport = createUniversalImportTransport(async () => f.account, {
      baseUrl: "https://api.example",
      tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
      fetchImplementation: fetcher,
    });
    await expect(transport.context(f.context, f.batch)).rejects.toMatchObject({
      kind: "http", status: 503, code,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(f.interpret).not.toHaveBeenCalled();
  },
);
