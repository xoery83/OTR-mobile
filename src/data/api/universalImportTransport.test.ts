import { ApiClientError } from "./client";
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
  await expect(f.transport.result(f.context, binding)).rejects.toMatchObject({
    kind: "http",
    status: 404,
    code: "TASK_NOT_FOUND",
  });
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
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code } }, { status: 503 }),
    );
    const transport = createUniversalImportTransport(async () => f.account, {
      baseUrl: "https://api.example",
      tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
      fetchImplementation: fetcher,
    });
    await expect(transport.context(f.context, f.batch)).rejects.toMatchObject({
      kind: "http",
      status: 503,
      code,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(f.interpret).not.toHaveBeenCalled();
  },
);

it("resumes only the exact server-bound Task through the real API client", async () => {
  const f = await fixture();
  let reply = { status: "EXISTING", context: f.binding };
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(
      `https://api.example/v2/import-batches/${f.batch}/interpretations/prepare`,
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(f.binding.taskId);
    expect(JSON.parse(String(init?.body))).toEqual({
      version: "otr.backend.universal-resume/1",
      tripId: f.binding.tripId,
      batchId: f.batch,
      taskId: f.binding.taskId,
    });
    return Response.json(reply, { status: 202 });
  });
  const transport = createUniversalImportTransport(async () => f.account, {
    baseUrl: "https://api.example",
    tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
    fetchImplementation: fetcher,
  });
  expect((await transport.resume(f.context, f.binding)).status).toBe("EXISTING");
  reply = { status: "QUEUED", context: f.binding };
  await expect(transport.resume(f.context, f.binding)).rejects.toThrow(
    "UNIVERSAL_CONTEXT_MISMATCH",
  );
  reply = { status: "EXISTING", context: { ...f.binding, taskId: randomUUID() } };
  await expect(transport.resume(f.context, f.binding)).rejects.toThrow(
    "UNIVERSAL_CONTEXT_MISMATCH",
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(f.interpret).not.toHaveBeenCalled();
});

it("correlates injected 503 context/results reads to one safe Batch hash without retry", async () => {
  const f = await fixture(),
    requestId = randomUUID();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: "SECRET_CODE", message: "private body", requestId } },
        { status: 503 },
      ),
    );
    const transport = createUniversalImportTransport(async () => f.account, {
      baseUrl: "https://api.example",
      tokenProvider: async () => ({ userId: f.account, token: "private-token" }),
      fetchImplementation: fetcher,
    });
    for (const read of [
      () => transport.context(f.context, f.batch),
      () => transport.result(f.context, f.binding),
    ])
      await expect(read()).rejects.toMatchObject({ status: 503, requestId });
    const other = randomUUID();
    await expect(transport.context(f.context, other)).rejects.toMatchObject({
      status: 503,
    });
    const logs = info.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((event) => event.event === "universal_import_read_failed");
    const hash = (id: string) =>
      createHash("sha256")
        .update(`otr.import.batch-diagnostic/1\0${id.toLowerCase()}`)
        .digest("hex");
    expect(logs).toEqual([
      {
        event: "universal_import_read_failed",
        method: "GET",
        phase: "CONTEXT",
        category: "HTTP_UNAVAILABLE",
        status: 503,
        requestId,
        batchCorrelation: hash(f.batch),
      },
      {
        event: "universal_import_read_failed",
        method: "GET",
        phase: "RESULTS",
        category: "HTTP_UNAVAILABLE",
        status: 503,
        requestId,
        batchCorrelation: hash(f.batch),
      },
      {
        event: "universal_import_read_failed",
        method: "GET",
        phase: "CONTEXT",
        category: "HTTP_UNAVAILABLE",
        status: 503,
        requestId,
        batchCorrelation: hash(other),
      },
    ]);
    const text = JSON.stringify(logs);
    for (const secret of [
      f.account,
      f.trip,
      f.batch,
      f.task,
      other,
      "private-token",
      "private body",
      "SECRET_CODE",
      "?tripId=",
      "filename",
    ])
      expect(text).not.toContain(secret);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(f.interpret).not.toHaveBeenCalled();
  } finally {
    info.mockRestore();
  }
});
it.each([undefined, "not-a-uuid private-token"])(
  "does not invent or log a missing/malicious requestId (%s)",
  async (requestId) => {
    const f = await fixture();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const fetcher = vi.fn(async () =>
        Response.json(
          { error: { code: "UNIVERSAL_CONTEXT_UNAVAILABLE", requestId } },
          { status: 503, headers: requestId ? { "x-request-id": requestId } : {} },
        ),
      );
      const transport = createUniversalImportTransport(async () => f.account, {
        baseUrl: "https://api.example",
        tokenProvider: async () => ({ userId: f.account, token: "test" }),
        fetchImplementation: fetcher,
      });
      await expect(transport.context(f.context, f.batch)).rejects.toMatchObject({
        status: 503,
      });
      const logs = info.mock.calls
        .map(([line]) => JSON.parse(String(line)))
        .filter((event) => event.event === "universal_import_read_failed");
      expect(logs).toHaveLength(1);
      expect(logs[0]).not.toHaveProperty("requestId");
      expect(JSON.stringify(logs)).not.toContain("private-token");
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      info.mockRestore();
    }
  },
);
it.each(["logger", "hash"])(
  "diagnostic %s failure preserves the exact original error without another request",
  async (broken) => {
    const f = await fixture(),
      original = new ApiClientError(
        "private original",
        "http",
        503,
        "private code",
        { body: "private" },
        randomUUID(),
      );
    const info = vi.spyOn(console, "info").mockImplementation(() => {
      if (broken === "logger") throw Error("logger failed");
    });
    const encode =
      broken === "hash"
        ? vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(() => {
            throw Error("hash encoding failed");
          })
        : null;
    try {
      const fetcher = vi.fn();
      const transport = createUniversalImportTransport(async () => f.account, {
        baseUrl: "https://api.example",
        assertCurrent: () => {
          throw original;
        },
        fetchImplementation: fetcher,
      });
      await expect(transport.context(f.context, f.batch)).rejects.toBe(original);
      if (broken === "logger") expect(info).toHaveBeenCalledOnce();
      if (broken === "hash") expect(encode).toHaveBeenCalledOnce();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      encode?.mockRestore();
    }
  },
);

it("uses the opt-in query only on explicit Analyze and sends the original Prepare with Batch idempotency", async () => {
  const f = await fixture();
  const ready = {
    version: "otr.backend.universal-material-ready/1",
    state: "MATERIAL_READY_NO_TASK",
    accountId: f.account,
    actorId: f.account,
    prepare: {
      tripId: f.trip,
      batchId: f.batch,
      submissionSha256: "a".repeat(64),
      inputs: [{
        id: randomUUID(),
        source_id: randomUUID(),
        representation_id: randomUUID(),
        material_revision: 1,
        payload_sha256: "b".repeat(64),
        byte_count: 66,
        observed_source_row_revision: 2,
        historical_selection: false as const,
      }],
    },
  };
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ status: "QUEUED", context: f.binding });
    return Response.json(new URL(String(url)).searchParams.has("materialReady") ? ready : f.binding);
  });
  const transport = createUniversalImportTransport(async () => f.account, {
    baseUrl: "https://api.example",
    tokenProvider: async () => ({ userId: f.account, token: "synthetic" }),
    fetchImplementation: fetcher,
  });
  expect(await transport.context(f.context, f.batch)).toEqual(f.binding);
  expect(await transport.materialReady(f.context, f.batch)).toEqual(ready);
  await transport.prepare(f.context, ready.prepare);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.has("materialReady")).toBe(false);
  expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("materialReady")).toBe("1");
  const [, post] = fetcher.mock.calls[2];
  expect(new Headers(post?.headers).get("Idempotency-Key")).toBe(f.batch);
  expect(JSON.parse(String(post?.body))).toEqual(ready.prepare);
  ready.actorId = randomUUID();
  await expect(transport.materialReady(f.context, f.batch)).rejects.toThrow("MISMATCH");
  fetcher.mockResolvedValueOnce(Response.json(f.binding));
  await expect(transport.materialReady(f.context, f.batch)).rejects.toThrow();
});

it("carries only a scoped missing-input identity through the Start response", async () => {
  const f = await fixture();
  const context = await captureAccountRequestContext(f.binding.tripId, async () => f.binding.accountId);
  const inputId = randomUUID();
  const fetcher = vi.fn(async () => Response.json({
    error: { code: "UNIVERSAL_ORIGINAL_BYTES_REQUIRED", details: { inputId } },
  }, { status: 409 }));
  const transport = createUniversalImportTransport(async () => f.binding.accountId, {
    baseUrl: "https://local.test",
    fetchImplementation: fetcher,
    tokenProvider: async () => ({ token: "fixture", userId: f.binding.accountId }),
  });
  await expect(transport.prepare(context, {
    tripId: f.binding.tripId,
    batchId: f.binding.batchId,
    submissionSha256: "a".repeat(64),
    retainedOriginals: [{ inputId, acquisition: {} }],
    inputs: [{
      id: inputId,
      source_id: randomUUID(),
      material_revision: 1,
      representation_id: randomUUID(),
      payload_sha256: "b".repeat(64),
      byte_count: 10,
      observed_source_row_revision: 1,
      historical_selection: false,
    }],
  })).rejects.toMatchObject({
    status: 409, code: "UNIVERSAL_ORIGINAL_BYTES_REQUIRED", details: { inputId },
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("transports Local-First metadata and binary without legacy execution", async () => {
  const account = randomUUID(), trip = randomUUID(), analysis = randomUUID();
  const file = randomUUID(), document = randomUUID();
  const bytes = new TextEncoder().encode("fixture-original");
  const originalSha = createHash("sha256").update(bytes).digest("hex");
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { createUniversalV3Intake } = await import("../../../backend/src/universalV3Intake");
  const { initializeUniversalTaskDatabase } = await import("../../../backend/src/universalTaskBootstrap");
  const root = await mkdtemp(join(tmpdir(), "otr-v3-native-transport-"));
  const sql = new DatabaseSync(":memory:");
  try {
    const gateway = {
      validateAccessToken: async (token: string) =>
        token === "test-normal-auth" ? { id: account, accountClass: "NORMAL_ACCOUNT" } : null,
      canReadTrip: async (a: string, t: string) => a === account && t === trip,
    } as unknown as DevBackendGateway;
    const handler = createDevBackendHandler({
      gateway,
      universalV3Intake: createUniversalV3Intake(initializeUniversalTaskDatabase(sql), root),
    });
    const fetcher = vi.fn((url: string | URL | Request, init?: RequestInit) =>
      handler(new Request(String(url), init)));
    const getAccount = async () => account;
    const transport = createUniversalImportTransport(getAccount, {
      baseUrl: "https://api.example",
      fetchImplementation: fetcher as typeof fetch,
      tokenProvider: async () => ({ userId: account, token: "test-normal-auth" }),
    });
    const context = await captureAccountRequestContext(trip, getAccount);
    expect(await transport.startLocalFirst(context, analysis, {
      version: "otr.import.local-first/1", tripId: trip, mode: "UNIVERSAL",
      files: [{ fileId: file, documentId: document, length: bytes.length, sha256: originalSha, mediaType: "text/plain" }],
    })).toEqual({ analysisId: analysis, missingFiles: [file] });
    await transport.uploadLocalFirst(context, analysis, file, bytes);
    expect(await transport.readLocalFirst(context, analysis)).toEqual({
      analysisId: analysis, missingFiles: [],
    });
    const binary = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
    expect(binary?.body).toEqual(bytes);
    expect(binary?.headers).toMatchObject({
      "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length),
    });
    expect(fetcher.mock.calls.every(([url]) => String(url).includes("/interpretations/intake"))).toBe(true);
  } finally {
    sql.close();
    await rm(root, { recursive: true, force: true });
  }
});
