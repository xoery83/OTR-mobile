import { publicationFixture } from "../../../backend/src/__fixtures__/tripCoreV2CandidatePublication";
import { candidatePublicationRequestHash } from "../../domain/trip/tripCoreV2CandidatePublication";
import { createHash, randomUUID } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createCoreV2Transport } from "./tripCoreV2Transport";
import {
  createDevBackendHandler,
  type DevBackendGateway,
} from "../../../backend/src/app";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "../auth/accountRequestContext";
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const actor = randomUUID(),
  trip = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const token = async () => ({ token: "valid", userId: actor });
it("negotiates v2 CLOSED through the actual authenticated API and HTTP handler", async () => {
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: async (t: string) => (t === "valid" ? { id: actor } : null),
      canReadTrip: async () => true,
    } as unknown as DevBackendGateway,
  });
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async (input, init) => handler(new Request(input, init)),
    },
    token,
  );
  const context = await captureAccountRequestContext(trip, async () => actor);
  expect(await transport.capabilities(context)).toMatchObject({
    activationState: "CLOSED",
    contractVersion: 2,
    enabledCommands: [],
  });
});
it("does not reinterpret unavailable replay or another operation's status as absence", async () => {
  const operation = randomUUID(),
    context = await captureAccountRequestContext(trip, async () => actor);
  let code = 503;
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: { code: "CORE_REPLAY_UNAVAILABLE" } }), {
          status: code,
        }),
    },
    token,
  );
  await expect(transport.receipt(context, operation)).rejects.toMatchObject({
    status: 503,
  });
  code = 404;
  expect(await transport.receipt(context, operation)).toBeNull();
  const wrong = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            projection: "STATUS_ONLY",
            domainReceiptId: randomUUID(),
            receiptSha256: "a".repeat(64),
            operationId: randomUUID(),
            outcome: "APPLIED",
            targetRevision: null,
          }),
        ),
    },
    token,
  );
  await expect(wrong.receipt(context, operation)).rejects.toThrow(
    "CORE_RECEIPT_SCOPE_MISMATCH",
  );
});
it("fences a late capability response after A→B→A", async () => {
  const ctx = await captureAccountRequestContext(trip, async () => actor);
  const transport = createCoreV2Transport(
    async () => actor,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async () => {
        const lease = await beginAccountTransition();
        endAccountTransition(lease);
        return new Response("{}");
      },
    },
    token,
  );
  await expect(transport.capabilities(ctx)).rejects.toThrow();
});

it("validates publication request/response scope and rejects a late account-switched result", async () => {
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
  let current = actor,
    wrong = false,
    switchAccount = false;
  const transport = createCoreV2Transport(
    async () => current,
    hash,
    {
      baseUrl: "http://core.local",
      fetchImplementation: async (input, init) => {
        expect(String(input)).toContain("/source-candidates/publish");
        expect(JSON.parse(String(init?.body))).toEqual(publication);
        if (switchAccount) current = randomUUID();
        return new Response(
          JSON.stringify({ ...result, accountId: wrong ? randomUUID() : actor }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
    token,
  );
  const context = await captureAccountRequestContext(trip, async () => actor);
  expect(await transport.publishSourceCandidates(context, publication)).toEqual(result);
  wrong = true;
  await expect(transport.publishSourceCandidates(context, publication)).rejects.toThrow(
    "CORE_PUBLICATION_SCOPE_MISMATCH",
  );
  wrong = false;
  switchAccount = true;
  await expect(transport.publishSourceCandidates(context, publication)).rejects.toThrow();
});

it("allows a bounded normal Core receipt after the global fifteen-second default", async () => {
  vi.useFakeTimers();
  try {
    const operation = randomUUID();
    const context = await captureAccountRequestContext(trip, async () => actor);
    const transport = createCoreV2Transport(
      async () => actor,
      hash,
      {
        baseUrl: "http://core.local",
        timeoutMs: 60_000,
        fetchImplementation: async () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      projection: "STATUS_ONLY",
                      domainReceiptId: randomUUID(),
                      receiptSha256: "a".repeat(64),
                      operationId: operation,
                      outcome: "APPLIED",
                      targetRevision: null,
                    }),
                  ),
                ),
              18_000,
            ),
          ),
      },
      token,
    );
    const result = transport.receipt(context, operation);
    await vi.advanceTimersByTimeAsync(18_000);
    expect(await result).toMatchObject({
      projection: "STATUS_ONLY",
      operationId: operation,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the normal Core sixty-second deadline finite", async () => {
  vi.useFakeTimers();
  try {
    const context = await captureAccountRequestContext(trip, async () => actor);
    const transport = createCoreV2Transport(
      async () => actor,
      hash,
      {
        baseUrl: "http://core.local",
        timeoutMs: 60_000,
        fetchImplementation: async () => new Promise<Response>(() => {}),
      },
      token,
    );
    const assertion = expect(
      transport.receipt(context, randomUUID()),
    ).rejects.toMatchObject({ kind: "timeout", code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it("fences a long normal Core receipt after an account generation change", async () => {
  vi.useFakeTimers();
  try {
    const operation = randomUUID();
    const context = await captureAccountRequestContext(trip, async () => actor);
    const transport = createCoreV2Transport(
      async () => actor,
      hash,
      {
        baseUrl: "http://core.local",
        timeoutMs: 60_000,
        fetchImplementation: async () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      projection: "STATUS_ONLY",
                      domainReceiptId: randomUUID(),
                      receiptSha256: "a".repeat(64),
                      operationId: operation,
                      outcome: "APPLIED",
                      targetRevision: null,
                    }),
                  ),
                ),
              18_000,
            ),
          ),
      },
      token,
    );
    const assertion = expect(transport.receipt(context, operation)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(16_000);
    const lease = await beginAccountTransition();
    endAccountTransition(lease);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});
