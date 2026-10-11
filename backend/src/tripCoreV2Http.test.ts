import { publicationFixture } from "./__fixtures__/tripCoreV2CandidatePublication";
import { candidatePublicationRequestHash } from "../../src/domain/trip/tripCoreV2CandidatePublication";
import { createHash, randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
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
          request("capabilities", undefined, { Authorization: "Bearer denied" }),
        )
      ).status,
    ).toBe(401);
    expect((await handle(false)(request("capabilities"))).status).toBe(404);
    expect(
      (
        await handle()(
          request("capabilities", undefined, { "X-OTR-Core-Contract-Version": "1" }),
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
