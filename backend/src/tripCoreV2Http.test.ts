import { publicationFixture } from "./__fixtures__/tripCoreV2CandidatePublication";
import { candidatePublicationRequestHash } from "../../src/domain/trip/tripCoreV2CandidatePublication";
import { createHash, randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
const actor = randomUUID(),
  trip = randomUUID(),
  operation = randomUUID();
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const request = (path: string, body?: string, headers: Record<string, string> = {}) =>
  new Request(`http://local/v2/trips/${trip}/core/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer valid", ...headers },
    body,
  });
const command = () => {
  const id = randomUUID();
  return {
    contractVersion: 2,
    intentVersion: 2,
    operationId: operation,
    tripId: trip,
    command: "CREATE_SPARSE_FLIGHT",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
    },
  };
};
const handle = (read = true) =>
  createDevBackendHandler({
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "valid" ? { id: actor } : null,
      canReadTrip: async () => read,
    } as unknown as DevBackendGateway,
  });
describe("Core2 authenticated HTTP boundary, default CLOSED", () => {
  it("authenticates capabilities and keeps v2 commands/source/read unavailable", async () => {
    const h = handle();
    const result = await h(request("capabilities"));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      contractVersion: 2,
      activationState: "CLOSED",
      enabledCommands: [],
    });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect((await h(request("commands", JSON.stringify(command())))).status).toBe(503);
    expect((await h(request("collection"))).status).toBe(503);
    expect((await h(request("source-plans/prepare", "{}"))).status).toBe(503);
  });
  it("rejects missing auth, denied Trip and unknown version", async () => {
    expect(
      (
        await handle()(
          request("capabilities", undefined, {
            Authorization: "Bearer denied",
          }),
        )
      ).status,
    ).toBe(401);
    expect((await handle(false)(request("capabilities"))).status).toBe(404);
    expect(
      (
        await handle()(
          request("capabilities", undefined, {
            "X-OTR-Core-Contract-Version": "1",
          }),
        )
      ).status,
    ).toBe(426);
  });
  it("returns426 for unknown Capture versions before the closed admission port", async () => {
    const h = handle();
    for (const path of ["source-plans/prepare", `source-plans/${randomUUID()}/finalize`])
      expect((await h(request(path, JSON.stringify({ captureVersion: 1 })))).status).toBe(
        426,
      );
  });
  it("rejects duplicate keys, oversized body, scope forgery and caller authority flags", async () => {
    const h = handle(),
      q = command();
    expect(
      (await h(request("commands", '{"contractVersion":2,"contractVersion":2}'))).status,
    ).toBe(400);
    expect((await h(request("commands", " ".repeat(32769)))).status).toBe(413);
    expect(
      (await h(request("commands", JSON.stringify({ ...q, tripId: randomUUID() }))))
        .status,
    ).toBe(404);
    expect(
      (await h(request("commands", JSON.stringify({ ...q, sourceAuthorized: true }))))
        .status,
    ).toBe(400);
    expect(
      (await h(request("commands", JSON.stringify({ ...q, contractVersion: 1 })))).status,
    ).toBe(426);
  });
  it("allows exact redacted operation recovery after current Trip revocation", async () => {
    const connection = {
      hash,
      readOperation: async (a: string, t: string, o: string) => {
        expect([a, t, o]).toEqual([actor, trip, operation]);
        return {
          projection: "STATUS_ONLY" as const,
          domainReceiptId: randomUUID(),
          receiptSha256: "a".repeat(64),
          operationId: operation,
          outcome: "APPLIED" as const,
          targetRevision: null,
        };
      },
    } as CoreHttpConnection;
    const result = await coreHttpBoundary(
      request(`operations/${operation}`),
      actor,
      async () => false,
      connection,
    );
    expect(result.status).toBe(200);
    expect(Object.keys(await result.json()).sort()).toEqual([
      "domainReceiptId",
      "operationId",
      "outcome",
      "projection",
      "receiptSha256",
      "targetRevision",
    ]);
  });
});

it("bounds the publication route and verifies owning response scope/hash/roster", async () => {
  const { request: publication } = await publicationFixture();
  for (const candidate of publication.candidates) {
    candidate.accountId = actor;
    candidate.tripId = trip;
  }
  const result = {
    publicationVersion: 2 as const,
    publicationId: publication.publicationId,
    accountId: actor,
    tripId: trip,
    sourceId: publication.sourceId,
    sourceRevision: publication.sourceRevision,
    runId: publication.runId,
    inputCatalogSha256: publication.inputCatalogSha256,
    requestSha256: await candidatePublicationRequestHash(publication, hash),
    candidates: publication.candidates.map((c) => ({
      candidateId: c.candidateId,
      candidateSha256: "a".repeat(64),
      status: "QUALIFIED" as const,
      errorCode: null,
    })),
  };
  let reply = result;
  const connection: CoreHttpConnection = {
    hash,
    commands: {
      withLockedCommand: async () => {
        throw new Error("UNUSED_COMMAND_PORT");
      },
    },
    readOperation: async () => null,
    publishSourceCandidates: async (owner: string, scope: string) => {
      expect(owner).toBe(actor);
      expect(scope).toBe(trip);
      return reply;
    },
  };
  const post = () =>
    coreHttpBoundary(
      request("source-candidates/publish", JSON.stringify(publication)),
      actor,
      async () => true,
      connection,
    );
  expect((await post()).status).toBe(200);
  reply = { ...result, accountId: randomUUID() };
  expect((await post()).status).toBe(503);
  reply = { ...result, requestSha256: "0".repeat(64) };
  expect((await post()).status).toBe(503);
  reply = { ...result, candidates: result.candidates.slice(0, 1) };
  expect((await post()).status).toBe(503);
  expect(
    (await handle()(request("source-candidates/publish", JSON.stringify(publication))))
      .status,
  ).toBe(503);
  expect(
    (
      await handle()(
        request(
          "source-candidates/publish",
          JSON.stringify({ ...publication, publicationVersion: 1 }),
        ),
      )
    ).status,
  ).toBe(426);
  publication.candidates[0].accountId = randomUUID();
  expect((await post()).status).toBe(404);
});

it("capabilities use only current authenticated actor and Trip, and default CLOSED without the owning producer", async () => {
  const capabilities = vi.fn(async () => ({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: ["CREATE_ITEM"],
    enabledFamilies: ["P1", "P3"],
    enabledAdmissionModes: ["MANUAL"],
  }));
  const connection = {
    read: { capabilities },
    hash,
  } as unknown as CoreHttpConnection;
  const response = await coreHttpBoundary(
    request("capabilities"),
    actor,
    async () => true,
    connection,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    activationState: "ENABLED",
    operationalCustodyAvailable: false,
  });
  expect(capabilities).toHaveBeenCalledExactlyOnceWith(actor, trip);
  expect(
    (
      await coreHttpBoundary(
        request("capabilities"),
        actor,
        async () => false,
        connection,
      )
    ).status,
  ).toBe(404);
  expect(capabilities).toHaveBeenCalledTimes(1);
  expect(
    (
      await coreHttpBoundary(
        new Request(
          `http://local/v2/trips/${trip}/core/capabilities?actor=${randomUUID()}`,
        ),
        actor,
        async () => true,
        connection,
      )
    ).status,
  ).toBe(400);
  expect(capabilities).toHaveBeenCalledTimes(1);
});
it("expired owning capability returns CLOSED without widening its available commands", async () => {
  const connection = {
    read: { capabilities: async () => coreClosedCapabilities },
    hash,
  } as unknown as CoreHttpConnection;
  const result = await coreHttpBoundary(
    request("capabilities"),
    actor,
    async () => true,
    connection,
  );
  expect(await result.json()).toEqual(coreClosedCapabilities);
});

it("logs only bounded schema codes and paths for a late Core validation failure", async () => {
  const { z } = await import("zod");
  const parsed = z.object({ receipt: z.object({ outcome: z.string() }) }).safeParse({
    receipt: { outcome: 123 },
  });
  if (parsed.success) throw Error("EXPECTED_SCHEMA_FAILURE");
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const connection = {
      commands: {
        withLockedCommand: async () => {
          throw parsed.error;
        },
      },
      hash,
    } as unknown as CoreHttpConnection;
    const response = await coreHttpBoundary(
      request("commands", JSON.stringify(command())),
      actor,
      async () => true,
      connection,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "INVALID_PAYLOAD" } });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"core_validation_failed"'),
    );
    const event = log.mock.calls
      .map(([v]) => JSON.parse(String(v)))
      .find((v) => v.event === "core_validation_failed");
    expect(event).toMatchObject({
      resource: "commands",
      method: "POST",
      cause: "SCHEMA",
      issues: [{ code: "invalid_type", path: ["receipt", "outcome"] }],
    });
    expect(JSON.stringify(event)).not.toContain("Bearer");
    expect(JSON.stringify(event)).not.toContain(actor);
    expect(JSON.stringify(event)).not.toContain(trip);
    expect(JSON.stringify(event)).not.toContain("123");
  } finally {
    log.mockRestore();
  }
});

it("keeps the original validation response if diagnostic logging fails", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {
    throw Error("logger unavailable");
  });
  try {
    const response = await coreHttpBoundary(
      request("commands", "{}"),
      actor,
      async () => true,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "INVALID_PAYLOAD" } });
  } finally {
    log.mockRestore();
  }
});

it("does not put arbitrary schema path keys or error messages into diagnostics", async () => {
  const { z } = await import("zod");
  const error = new z.ZodError([
    {
      code: "custom",
      path: ["payload", "private@example.com", "PassportAB12345"],
      message: "SENSITIVE_VALUE_NEVER_LOG",
    },
  ]);
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const response = await coreHttpBoundary(
      request("commands", JSON.stringify(command())),
      actor,
      async () => true,
      {
        hash,
        commands: {
          withLockedCommand: async () => {
            throw error;
          },
        },
      } as unknown as CoreHttpConnection,
    );
    expect(response?.status).toBe(400);
    const text = JSON.stringify(log.mock.calls);
    expect(text).toContain("[field]");
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("PassportAB12345");
    expect(text).not.toContain("SENSITIVE_VALUE_NEVER_LOG");
  } finally {
    log.mockRestore();
  }
});

it("passes only one validated operation to capabilities after Trip access", async () => {
  const operation = randomUUID(),
    capabilities = vi.fn(async () => coreClosedCapabilities);
  const connection = { read: { capabilities }, hash } as unknown as CoreHttpConnection;
  const get = (query: string, allowed = true) =>
    coreHttpBoundary(
      request("capabilities" + query),
      actor,
      async () => allowed,
      connection,
    );
  expect((await get("?operationId=" + operation)).status).toBe(200);
  expect(capabilities).toHaveBeenCalledExactlyOnceWith(actor, trip, operation);
  for (const query of [
    "?operationId=bad",
    "?operationId=" + operation + "&operationId=" + operation,
    "?operationId=" + operation + "&actor=" + actor,
  ])
    expect((await get(query)).status).toBe(400);
  expect((await get("?operationId=" + operation, false)).status).toBe(404);
  expect(capabilities).toHaveBeenCalledTimes(1);
});

it.each([
  {
    message: "CORE_CONNECTION_TIMEOUT",
    category: "CORE_CONNECTION_TIMEOUT",
    brokenLog: false,
  },
  {
    message: "P1_SOURCE_EVIDENCE_INVALID",
    category: "P1_SOURCE_EVIDENCE_INVALID",
    brokenLog: false,
  },
  {
    message: "PRIVATE_ORIGINAL_AND_TOKEN_NEVER_LOG",
    category: "FAILED",
    brokenLog: false,
  },
  {
    message: "CORE_CONNECTION_TIMEOUT",
    category: "CORE_CONNECTION_TIMEOUT",
    brokenLog: true,
  },
])(
  "keeps publication failures bounded and preserves the response: $category / $brokenLog",
  async ({ message, category, brokenLog }) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {
      if (brokenLog) throw Error("logger unavailable");
    });
    try {
      const response = await coreHttpBoundary(
        request(
          "universal-p1-candidates",
          JSON.stringify({
            captureVersion: 2,
            sourceId: randomUUID(),
            batchId: randomUUID(),
            taskId: randomUUID(),
            token: "i1",
            requestSha256: "a".repeat(64),
          }),
        ),
        actor,
        async () => true,
        {
          hash,
          publishUniversalP1: async () => {
            throw Error(message);
          },
        } as unknown as CoreHttpConnection,
      );
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        error: { code: "CORE_EXECUTION_UNAVAILABLE" },
      });
      expect(log).toHaveBeenCalled();
      if (!brokenLog) {
        const event = JSON.parse(String(log.mock.calls[0][0]));
        expect(event).toEqual({ event: "core_source_publication_failed", category });
        expect(JSON.stringify(log.mock.calls)).not.toContain(
          "PRIVATE_ORIGINAL_AND_TOKEN_NEVER_LOG",
        );
        expect(JSON.stringify(event)).not.toContain(actor);
        expect(JSON.stringify(event)).not.toContain(trip);
      }
    } finally {
      log.mockRestore();
    }
  },
);
