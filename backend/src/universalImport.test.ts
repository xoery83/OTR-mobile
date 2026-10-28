import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  prepareUniversalDispatch,
  createUniversalPort,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalHost,
  type UniversalManifest,
  type UniversalProvider,
  type UniversalResult,
} from "./universalImport";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const actor = randomUUID(),
  other = randomUUID(),
  account = randomUUID(),
  trip = randomUUID(),
  batch = randomUUID(),
  task = randomUUID();
const source = (text: string, index: number) => {
  const bytes = Buffer.from(text);
  return {
    accountId: account,
    tripId: trip,
    batchId: batch,
    inputId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    revision: 1,
    originalSha256: sha(bytes),
    mime: "text/plain",
    bytes,
  };
};
function fixture(output: unknown, manifest: UniversalManifest) {
  const receipts = new Map<string, UniversalResult>();
  const host: UniversalHost = {
    readManifest: vi.fn(async (a, t, b) =>
      a === actor && t === trip && b === batch ? manifest : null,
    ),
    claimDispatch: vi.fn(async (marker) => {
      const existing = receipts.get(marker.taskId);
      if (existing) return { claimed: false, receipt: existing };
      receipts.set(marker.taskId, marker);
      return { claimed: true, receipt: marker };
    }),
    writeReceipt: vi.fn(async (r) => {
      receipts.set(r.taskId, r);
    }),
    readReceipt: vi.fn(async (a, b, id) =>
      a === actor && b === batch ? (receipts.get(id) ?? null) : null,
    ),
  };
  const provider: UniversalProvider = {
    mode: "LOCAL_FIXTURE",
    interpret: vi.fn(async () => ({
      output,
      providerReceipt: { outcome: "LOCAL_FIXTURE" as const, requestId: null },
    })),
  };
  const gateway = {
    validateAccessToken: vi.fn(async (token) =>
      token === "valid" ? { id: actor } : token === "other" ? { id: other } : null,
    ),
    canReadTrip: vi.fn(async (a, t) => t === trip && (a === actor || a === other)),
  } as unknown as DevBackendGateway;
  const handle = createDevBackendHandler({
    gateway,
    universalImportPort: createUniversalPort(host, provider),
  });
  const post = (token = "valid", id = task) =>
    handle(
      new Request(`http://localhost/v2/import-batches/${batch}/interpretations`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "Idempotency-Key": id },
        body: JSON.stringify({
          version: UNIVERSAL_IMPORT_VERSION,
          tripId: trip,
          taskId: id,
        }),
      }),
    );
  const get = (token = "valid", id = task) =>
    handle(
      new Request(
        `http://localhost/v2/import-batches/${batch}/interpretations/${id}?tripId=${trip}`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
    );
  return { post, get, host, provider, handle, receipts };
}

it("executes one authenticated Backend-local batch with two original sources and mixed P1/P3 candidates", async () => {
  const a = source("Activity: Museum walk\n", 0),
    b = source("Property: Grand Hotel\n", 1);
  const output = {
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
  };
  const x = fixture(output, {
    accountId: account,
    tripId: trip,
    batchId: batch,
    representations: [a, b],
  });
  const response = await x.post();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("CANDIDATES_READY");
  expect(body.sourceBindings.map((s: { sourceId: string }) => s.sourceId)).toEqual([
    a.sourceId,
    b.sourceId,
  ]);
  expect(body.candidates.map((c: { kind: string }) => c.kind)).toEqual(["P1", "P3"]);
  expect(body.quality.decisions.map((d: { tier: string }) => d.tier)).toEqual([
    "HIGH_CONFIDENCE",
    "HIGH_CONFIDENCE",
  ]);
  expect(body.admission).toBe("NOT_RUN");
  expect(body.canonicalWrites).toBe(false);
  expect((await x.get()).status).toBe(200);
  await x.post();
  expect(x.provider.interpret).toHaveBeenCalledTimes(1);
  expect((await x.get("other")).status).toBe(404);
  expect((await x.post("other", randomUUID())).status).toBe(503);
});

it("fails closed for absent port, invalid session, changed binding and conflicting facts", async () => {
  const a = source("Activity: Museum walk\n", 0),
    manifest = { accountId: account, tripId: trip, batchId: batch, representations: [a] };
  const x = fixture(
    {
      v: 2,
      items: [
        {
          id: "i1",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [
            [0, "activity.name", "Museum walk"],
            [0, "activity.name", "Museum walk"],
          ],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
    manifest,
  );
  expect((await x.post("invalid")).status).toBe(401);
  const conflict = await x.post();
  expect(conflict.status).toBe(200);
  expect((await conflict.json()).status).toBe("ABSTAIN");
  const changed = fixture(
    { v: 2, items: [], bookings: [], tickets: [], links: [], issues: [] },
    { ...manifest, representations: [{ ...a, originalSha256: "0".repeat(64) }] },
  );
  expect((await changed.post()).status).toBe(503);
  const closed = createDevBackendHandler({
    gateway: {
      validateAccessToken: async () => ({ id: actor }),
    } as unknown as DevBackendGateway,
  });
  expect(
    (
      await closed(
        new Request(`http://localhost/v2/import-batches/${batch}/interpretations`, {
          method: "POST",
          headers: { authorization: "Bearer valid" },
        }),
      )
    ).status,
  ).toBe(503);
});

it("withholds unresolved cancellation target and retains zero-result source inventory", async () => {
  const a = source("Cancellation notice: earlier reservation unknown\n", 0);
  const x = fixture(
    {
      v: 2,
      items: [],
      bookings: [],
      tickets: [],
      links: [],
      issues: [[0, "cancellation notice target unknown"]],
    },
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
  );
  const body = await (await x.post()).json();
  expect(body.status).toBe("ABSTAIN");
  expect(body.candidates).toEqual([]);
  expect(body.sourceBindings).toHaveLength(1);
  expect(
    body.unresolved.some((u: { reason: string }) => u.reason.includes("cancellation")),
  ).toBe(true);
});

it("retains UNKNOWN dispatch marker and never retries an uncertain Provider outcome", async () => {
  const a = source("Activity: Museum walk\n", 0);
  const x = fixture(null, {
    accountId: account,
    tripId: trip,
    batchId: batch,
    representations: [a],
  });
  vi.mocked(x.provider.interpret).mockRejectedValueOnce(new Error("timeout"));
  expect((await x.post()).status).toBe(503);
  expect(x.receipts.get(task)?.status).toBe("EXECUTION_OUTCOME_UNKNOWN");
  expect((await (await x.post()).json()).status).toBe("EXECUTION_OUTCOME_UNKNOWN");
  expect(x.provider.interpret).toHaveBeenCalledTimes(1);
});

it("rechecks owning permission after atomic claim before any Provider dispatch", async () => {
  const a = source("Activity: Museum walk\n", 0);
  const x = fixture(
    { v: 2, items: [], bookings: [], tickets: [], links: [], issues: [] },
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
  );
  vi.mocked(x.host.claimDispatch).mockImplementationOnce(async (marker) => {
    x.receipts.set(marker.taskId, marker);
    vi.mocked(x.host.readManifest).mockResolvedValue(null);
    return { claimed: true, receipt: marker };
  });
  expect((await x.post()).status).toBe(503);
  expect(x.provider.interpret).not.toHaveBeenCalled();
  expect(x.receipts.get(task)?.status).toBe("EXECUTION_OUTCOME_UNKNOWN");
});

it("blocks publication when an owning material pin changes during Provider execution", async () => {
  const a = source("Activity: Museum walk\n", 0);
  const x = fixture(
    {
      v: 2,
      items: [
        {
          id: "i1",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [[0, "activity.name", "Museum walk"]],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
  );
  vi.mocked(x.provider.interpret).mockImplementationOnce(async () => {
    a.revision++;
    return {
      output: { v: 2, items: [], bookings: [], tickets: [], links: [], issues: [] },
      providerReceipt: { outcome: "LOCAL_FIXTURE", requestId: null },
    };
  });
  expect((await x.post()).status).toBe(503);
  expect(x.provider.interpret).toHaveBeenCalledOnce();
  expect(x.receipts.get(task)?.status).toBe("EXECUTION_OUTCOME_UNKNOWN");
});

it("denies receipt GET after current Batch access is revoked even when Trip remains readable", async () => {
  const a = source("Activity: Museum walk\n", 0);
  const x = fixture(
    {
      v: 2,
      items: [
        {
          id: "i1",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [[0, "activity.name", "Museum walk"]],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
  );
  expect((await x.post()).status).toBe(200);
  vi.mocked(x.host.readManifest).mockResolvedValue(null);
  expect((await x.get()).status).toBe(404);
});

it("prunes quality-withheld Booking links from retained candidate graph", async () => {
  const a = source(
    "Activity: Museum walk\nBooking supplier: Acme\nBooking ref: ABC123\n",
    0,
  );
  const b = source("Activity: Skyline walk\ntrip idea only\n", 1);
  const output = {
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
        kind: "P1",
        subtype: "ACTIVITY",
        f: [[1, "activity.name", "Skyline walk"]],
      },
    ],
    bookings: [{ id: "b1", supplier: [0, "Acme"], reference: [0, "ABC123"], f: [] }],
    tickets: [],
    links: [
      ["B", "b1", "i1"],
      ["B", "b1", "i2"],
    ],
    issues: [],
  };
  const x = fixture(output, {
    accountId: account,
    tripId: trip,
    batchId: batch,
    representations: [a, b],
  });
  const body = await (await x.post()).json();
  expect(body.candidates).toHaveLength(1);
  expect(body.candidates[0].bookingTokens).toEqual([]);
  expect(body.bookingObservations).toEqual([]);
  expect(
    body.unresolved.some(
      (u: { reason: string }) =>
        u.reason === "BOOKING_OBSERVATION_WITHHELD_BY_QUALITY:b1",
    ),
  ).toBe(true);
});

it("prepares valid BOM UTF8 bytes with the frozen decoded-text contract", () => {
  const original = source("\uFEFFActivity: BOM QA\r\nDate: 2026-11-02\r\n", 0);
  const d = prepareUniversalDispatch(
    actor,
    batch,
    { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId: task },
    { accountId: account, tripId: trip, batchId: batch, representations: [original] },
  );
  expect(d.ready).toHaveLength(1);
  expect(d.ready[0].bytes.toString()).toBe("Activity: BOM QA\nDate: 2026-11-02\n");
  expect(d.bindings[0].originalSha256).toBe(sha(original.bytes));
  expect(d.bindings[0].submittedSha256).toBe(sha(d.ready[0].bytes));
  expect(original.bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");
});

it("keeps malformed UTF8 unsupported without replacing the original bytes", () => {
  const original = source("valid", 0);
  original.bytes = Buffer.from([0xef, 0xbb, 0xbf, 0xc3, 0x28]);
  original.originalSha256 = sha(original.bytes);
  const d = prepareUniversalDispatch(
    actor,
    batch,
    { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId: task },
    { accountId: account, tripId: trip, batchId: batch, representations: [original] },
  );
  expect(d.ready).toHaveLength(0);
  expect(d.prepared[0]).toMatchObject({
    status: "UNSUPPORTED",
    reason: "SOURCE_UTF8_INVALID",
  });
  expect(d.bindings[0].originalSha256).toBe(sha(original.bytes));
});

it("keeps a BOM-only original without dispatching empty prepared material", () => {
  const original = source("\uFEFF", 0);
  const d = prepareUniversalDispatch(
    actor,
    batch,
    { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId: task },
    { accountId: account, tripId: trip, batchId: batch, representations: [original] },
  );
  expect(d.ready).toHaveLength(0);
  expect(d.prepared[0]).toMatchObject({
    status: "UNSUPPORTED",
    reason: "PREPARED_SOURCE_EMPTY",
  });
  expect(original.bytes.toString("hex")).toBe("efbbbf");
});

it("retains a BOM-only original as ABSTAIN without a Provider call", async () => {
  const original = source("\uFEFF", 0);
  const x = fixture(null, {
    accountId: account,
    tripId: trip,
    batchId: batch,
    representations: [original],
  });
  const response = await x.post();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    status: "ABSTAIN",
    providerOutcome: "NOT_RUN",
    candidates: [],
  });
  expect(body.sourceBindings[0].originalSha256).toBe(sha(original.bytes));
  expect(body.unresolved[0].reason).toBe("PREPARED_SOURCE_EMPTY");
  expect(x.provider.interpret).not.toHaveBeenCalled();
});
